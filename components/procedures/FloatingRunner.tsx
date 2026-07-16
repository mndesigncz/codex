'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useProcedures } from './ProcedureProvider';
import { parseSteps } from '@/lib/steps';
import StepTimeline from './StepTimeline';

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Live mm:ss timer since a start timestamp.
function useElapsed(startedAt?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000));
}

const CONFETTI = ['#C8F542', '#79D06B', '#2FA968', '#EEFFB4', '#16181A', '#ffd84d'];

function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 42 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      dur: 1.6 + Math.random() * 1.4,
      color: CONFETTI[i % CONFETTI.length],
      size: 6 + Math.random() * 6,
      rot: Math.random() * 360,
    })),
    []
  );
  return (
    <div className="pr-confetti-wrap" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="pr-confetti"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export default function FloatingRunner() {
  const { active, justCompleted, toggleItem, complete, cancel, dismissCelebration } = useProcedures();
  const [minimized, setMinimized] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [completing, setCompleting] = useState(false);
  const elapsed = useElapsed(active?.startedAt);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Reset transient UI when a new run starts / celebration appears.
  useEffect(() => { if (active) { setMinimized(false); setConfirmClose(false); } }, [active?.id]);

  if (!active && !justCompleted) return null;

  // ---- Celebration ----
  if (!active && justCompleted) {
    return (
      <>
        <StyleBlock />
        <div className="fixed z-50 bottom-3 inset-x-3 md:inset-x-auto md:bottom-4 md:right-4 md:w-[340px]">
          <div className="relative overflow-hidden glass-strong rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.28)] motion-safe:animate-[pr-pop_0.4s_ease-out]">
            <Confetti />
            <div className="relative px-6 py-7 text-center">
              <div className="text-5xl motion-safe:animate-[pr-bounce_0.7s_ease-out]">🎉</div>
              <h3 className="mt-3 text-2xl font-bold tracking-tight text-[#16181A]">Hotovo!</h3>
              <p className="mt-1 text-sm text-black/60 truncate">{justCompleted.name}</p>
              <div className="mt-5 flex items-center justify-center gap-2 tabular-nums">
                <span className="text-5xl font-bold tracking-tight text-[#5B7A08]">{fmt(justCompleted.duration)}</span>
              </div>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-black/40">Celkový čas</p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#C8F542]/25 px-3 py-1 text-sm font-medium text-[#5B7A08]">
                {checkGlyph}
                {justCompleted.total} {stepsWord(justCompleted.total)} splněno
              </div>
              <button
                onClick={dismissCelebration}
                className="mt-6 w-full rounded-full bg-[#16181A] text-white font-semibold px-5 py-2.5 hover:brightness-110 transition"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!active) return null;

  const total = active.totalItems || active.items.length;
  const done = active.checkedItems.length;
  const allDone = total > 0 && done >= total;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const doCancel = () => { cancel(); setConfirmClose(false); };
  const doComplete = async () => { setCompleting(true); await complete(); setCompleting(false); };

  // ---- Minimized pill ----
  if (minimized) {
    return (
      <>
        <StyleBlock />
        <button
          onClick={() => setMinimized(false)}
          className="fixed z-50 bottom-4 right-4 flex items-center gap-2.5 rounded-full bg-[#C8F542] text-black font-semibold pl-4 pr-3 py-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.22)] hover:brightness-110 transition"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-black/60 opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-black" />
          </span>
          <span className="max-w-[140px] truncate text-sm">{active.name}</span>
          <span className="tabular-nums rounded-full bg-black/15 px-2 py-0.5 text-xs">{done}/{total}</span>
        </button>
      </>
    );
  }

  // ---- Full floating window ----
  return (
    <>
      <StyleBlock />
      <div className="fixed z-50 bottom-3 inset-x-3 md:inset-x-auto md:bottom-4 md:right-4 md:w-[340px]">
        <div className="overflow-hidden glass-strong rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.28)] motion-safe:animate-[pr-pop_0.28s_ease-out]">
          {/* Progress bar */}
          <div className="h-1 w-full bg-black/[0.06]">
            <div
              className="h-full bg-[#C8F542] transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Header */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold tracking-tight text-[#16181A]">{active.name}</p>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-black/50">
                <span className="tabular-nums font-medium text-[#5B7A08]">{done}/{total}</span>
                <span className="text-black/25">•</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  {clockGlyph}{fmt(elapsed)}
                </span>
              </div>
            </div>
            <button
              onClick={() => setMinimized(true)}
              title="Minimalizovat"
              className="flex h-8 w-8 items-center justify-center rounded-full text-black/45 hover:bg-black/[0.06] hover:text-black transition"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 12h12" /></svg>
            </button>
            <button
              onClick={() => setConfirmClose(true)}
              title="Zrušit průběh"
              className="flex h-8 w-8 items-center justify-center rounded-full text-black/45 hover:bg-red-500/10 hover:text-red-600 transition"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          {/* Steps timeline */}
          <div ref={bodyRef} className="max-h-[46vh] md:max-h-[340px] overflow-y-auto scrollbar-thin px-3.5 pb-2 pt-1">
            <StepTimeline
              steps={parseSteps(active.items)}
              statuses={Object.fromEntries(active.checkedItems.map(i => [i, 'done' as const]))}
              onToggle={toggleItem}
              interactive
              compact
            />
          </div>

          {/* Footer / complete */}
          <div className="px-3 pb-3 pt-1">
            {allDone ? (
              <button
                onClick={doComplete}
                disabled={completing}
                className="w-full rounded-full bg-[#C8F542] text-black font-semibold px-5 py-3 hover:brightness-110 transition disabled:opacity-60 motion-safe:animate-[pr-pop_0.3s_ease-out] flex items-center justify-center gap-2"
              >
                {completing ? 'Ukládám…' : <>Dokončit {checkGlyph}</>}
              </button>
            ) : (
              <p className="text-center text-xs text-black/40 py-1">
                Odškrtávejte kroky, jak je plníte
              </p>
            )}
          </div>
        </div>

        {/* Confirm cancel */}
        {confirmClose && (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl modal-overlay p-4">
            <div className="modal-sheet rounded-3xl p-5 text-center w-full">
              <p className="text-sm font-semibold text-[#16181A]">Zrušit tento průběh?</p>
              <p className="mt-1 text-xs text-black/55">Odškrtnuté kroky se neuloží.</p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setConfirmClose(false)}
                  className="flex-1 rounded-full glass border border-black/10 text-[#16181A] px-4 py-2.5 text-sm font-medium hover:bg-black/[0.05] transition"
                >
                  Pokračovat
                </button>
                <button
                  onClick={doCancel}
                  className="flex-1 rounded-full bg-red-500 text-white px-4 py-2.5 text-sm font-semibold hover:brightness-110 transition"
                >
                  Zrušit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function stepsWord(n: number) {
  if (n === 1) return 'krok';
  if (n >= 2 && n <= 4) return 'kroky';
  return 'kroků';
}

const checkGlyph = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
);
const clockGlyph = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);

// Scoped keyframes — respects prefers-reduced-motion via motion-safe:* utilities on elements.
function StyleBlock() {
  return (
    <style>{`
      @keyframes pr-pop { 0% { opacity:0; transform: translateY(8px) scale(0.98); } 100% { opacity:1; transform: translateY(0) scale(1); } }
      @keyframes pr-bounce { 0% { transform: scale(0.4); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }
      @keyframes pr-fall { 0% { transform: translateY(-10%) rotate(0deg); opacity:1; } 100% { transform: translateY(360px) rotate(540deg); opacity:0; } }
      .pr-confetti-wrap { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
      .pr-confetti { position:absolute; top:-12px; border-radius:2px; }
      @media (prefers-reduced-motion: no-preference) {
        .pr-confetti { animation-name: pr-fall; animation-timing-function: ease-in; animation-iteration-count: 1; animation-fill-mode: forwards; }
      }
    `}</style>
  );
}
