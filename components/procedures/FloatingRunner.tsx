'use client';

// Plovoucí běh postupu — nad všemi rozhraními (app/providers.tsx).
//
// Kolo 69 (B6b), audit final_sorted.json / obsah-kontrola.txt: zmenšená pilulka byla plná
// limetka s animate-ping (s tlačítkem chatu dvě limetky dole) → inkoustová pilulka jako
// BulkBar, bez pulzu; oslava s konfetami, odskokem a „Hotovo!" text-2xl → klidný panel
// glass-strong s pop-in; ručně psaná tlačítka a inline SVG → Button a Icon; štítek
// „Celkový čas" verzálkami ručně → t-label. „Dokončit" je primary vždy: běžec visí nad
// stránkou, která svou limetku už má (DP: jedna limetka na obrazovce).

import { useEffect, useRef, useState } from 'react';
import { useProcedures } from './ProcedureProvider';
import { parseSteps } from '@/lib/steps';
import { SKIP_REASONS } from '@/lib/procedureScoring';
import StepTimeline from './StepTimeline';
import { useOtevreniNavodu } from '@/lib/otevriNavod';
import { Icon } from '../Icons';
import { Button, Chip, Input } from '../ui';
import { czCount, czForm } from '@/lib/czech';

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

const KROK = { one: 'krok', few: 'kroky', many: 'kroků' };
const POZICE = 'fixed z-50 bottom-[calc(92px+env(safe-area-inset-bottom))] inset-x-3 md:inset-x-auto md:bottom-4 md:left-4 md:w-[340px]';
const PANEL = 'overflow-hidden glass-strong rounded-3xl shadow-[shadow:var(--shadow-float)] pop-in';

export default function FloatingRunner() {
  const { active, justCompleted, syncFailed, toggleItem, toggleSkip, setSkipReason, complete, cancel, dismissCelebration } = useProcedures();
  const [minimized, setMinimized] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Skipping asks WHY — the reason decides whether it costs points.
  const [skipFor, setSkipFor] = useState<number | null>(null);
  const [skipNote, setSkipNote] = useState('');
  const elapsed = useElapsed(active?.startedAt);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Běžec visí v `app/providers.tsx`, tedy nad vedením, zaměstnancem
  // i tabletem naráz, a sám neví, kde je. Na tabletu si otevírání přebírá
  // kiosk (přepne záložku), jinde stačí odkaz odvozený z cesty. Když ani
  // jedno, tlačítko se nevykreslí — viz lib/otevriNavod.ts.
  const navodOdkaz = useOtevreniNavodu();

  // Reset transient UI when a new run starts / celebration appears.
  useEffect(() => { if (active) { setMinimized(false); setConfirmClose(false); setConfirmFinish(false); } }, [active?.id]);

  if (!active && !justCompleted) return null;

  // ---- Celebration ----
  if (!active && justCompleted) {
    return (
      <div className={POZICE}>
        <div className={PANEL} role="status">
          <div className="px-6 py-6 text-center">
            <span aria-hidden className="chip-ok mx-auto grid h-11 w-11 place-items-center rounded-full"><Icon name="check" size={20} strokeWidth={2.2} /></span>
            <h3 className="t-section mt-3">Postup je hotový</h3>
            <p className="t-meta mt-1 truncate">{justCompleted.name}</p>
            <p className="mt-4 text-[28px] font-bold leading-none tracking-tight text-[#16181A] tabular-nums">{fmt(justCompleted.duration)}</p>
            <p className="t-label mt-1.5">Celkový čas</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              <Chip tone="ok" size="sm" icon="check">{justCompleted.done} {czForm(justCompleted.done, KROK)} splněno</Chip>
              {justCompleted.skipped > 0 && <Chip tone="wait" size="sm">{justCompleted.skipped} přeskočeno</Chip>}
            </div>
            <Button variant="primary" block className="mt-5" onClick={dismissCelebration}>Zavřít</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!active) return null;

  const total = active.totalItems || active.items.length;
  const done = active.checkedItems.length;
  const skipped = active.skippedItems.length;
  const remaining = Math.max(0, total - done - skipped); // neither done nor skipped
  const allDone = total > 0 && done >= total;
  const unfinished = skipped + remaining; // everything not actually done
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const doCancel = () => { cancel(); setConfirmClose(false); };
  const doComplete = async () => { setCompleting(true); await complete(); setCompleting(false); };
  // Finishing: straight through when everything's done, otherwise ask first.
  const onFinishClick = () => { if (allDone) doComplete(); else setConfirmFinish(true); };

  // ---- Minimized pill ----
  if (minimized) {
    return (
      <Button variant="primary" onClick={() => setMinimized(false)} aria-label={`Otevřít průběh postupu ${active.name}`}
        className="fixed z-50 bottom-[calc(92px+env(safe-area-inset-bottom))] left-4 md:bottom-4 shadow-[shadow:var(--shadow-float)]">
        <Icon name="play" size={14} />
        <span className="max-w-[140px] truncate">{active.name}</span>
        <span className="tabular-nums text-[#C8F542]">{done}/{total}</span>
      </Button>
    );
  }

  // ---- Full floating window ----
  return (
    <div className={POZICE}>
      <div className={PANEL}>
        {/* Průběh: inkoust, ne limetka — limetka je akce. */}
        <div className="h-1 w-full bg-black/[0.06]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Hotové kroky">
          <div className="h-full bg-[#16181A] transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        </div>

        {/* The ticks live on this device but never reached the server, so the
            employer wouldn't see the run at all. */}
        {syncFailed && (
          // 13 px, ne 11: je to nejdůležitější věta v celém okně a na
          // tabletu za barem se čte na délku paže.
          <p className="note note-wait !rounded-none flex items-start gap-1.5 text-[13px] font-medium leading-snug" role="alert">
            <Icon name="warning" size={16} className="mt-px shrink-0" />
            Neukládá se na server — zkontroluj připojení a zkus to znovu.
            Postup zůstane otevřený, dokud se odeslání nepovede.
          </p>
        )}

        {/* Header */}
        <div className="flex items-center gap-1 px-4 pt-3 pb-2">
          <div className="min-w-0 flex-1">
            <h3 className="t-card truncate">{active.name}</h3>
            <p className="t-meta mt-0.5 flex items-center gap-2 tabular-nums">
              <span>{done}/{total}</span>
              <span aria-hidden className="text-black/25">·</span>
              <span className="inline-flex items-center gap-1"><Icon name="clock" size={13} />{fmt(elapsed)}</span>
            </p>
          </div>
          <Button variant="ghost" size="sm" iconOnly icon="minus" aria-label="Zmenšit" title="Zmenšit" onClick={() => setMinimized(true)} />
          <Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Zrušit průběh" title="Zrušit průběh" onClick={() => setConfirmClose(true)} />
        </div>

        {confirmClose ? (
          /* Confirm cancel — replaces the card body cleanly (no foggy overlay) */
          <div className="px-5 pb-5 pt-3 text-center pop-in">
            <p className="text-sm font-semibold text-[#16181A]">Zrušit tento průběh?</p>
            <p className="t-meta mt-1">Odškrtnuté kroky se neuloží.</p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" block onClick={() => setConfirmClose(false)}>Pokračovat</Button>
              <Button variant="danger-solid" block onClick={doCancel}>Zrušit průběh</Button>
            </div>
          </div>
        ) : confirmFinish ? (
          /* Confirm finishing with unfinished steps */
          <div className="px-5 pb-5 pt-3 text-center pop-in">
            <p className="text-sm font-semibold text-[#16181A]">Dokončit, i když není vše hotové?</p>
            <p className="t-meta mt-1 text-pretty">
              {[skipped > 0 ? `přeskočeno: ${czCount(skipped, KROK)}` : null, remaining > 0 ? `neodškrtnuto: ${czCount(remaining, KROK)}` : null].filter(Boolean).join(', ')}.
              {' '}Vedení uvidí, co zůstalo nedokončené.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" block onClick={() => setConfirmFinish(false)} disabled={completing}>Pokračovat</Button>
              <Button variant="primary" block onClick={doComplete} loading={completing}>Přesto dokončit</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Steps timeline */}
            <div ref={bodyRef} className="max-h-[46vh] md:max-h-[340px] overflow-y-auto scrollbar-thin px-3.5 pb-2 pt-1">
              <StepTimeline
                steps={parseSteps(active.items)}
                statuses={{
                  ...Object.fromEntries(active.skippedItems.map(i => [i, 'skipped' as const])),
                  ...Object.fromEntries(active.checkedItems.map(i => [i, 'done' as const])),
                }}
                onToggle={toggleItem}
                onSkip={(i) => {
                  if (active.skippedItems.includes(i)) toggleSkip(i);
                  else { setSkipFor(i); setSkipNote(''); }
                }}
                interactive
                compact
                {...navodOdkaz}
              />
            </div>

            {skipFor != null && (
              <div className="px-3.5 pb-2">
                <div className="well p-3 space-y-2" role="group" aria-label="Proč krok přeskakuješ">
                  <p className="text-xs font-semibold text-[#16181A]">Proč krok přeskakuješ?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SKIP_REASONS.map(r => (
                      <button key={r.id} type="button"
                        disabled={r.id === 'other' && !skipNote.trim()}
                        onClick={() => {
                          if (r.id === 'other' && !skipNote.trim()) return;
                          toggleSkip(skipFor);
                          setSkipReason(skipFor, r.id, r.id === 'other' ? skipNote.trim() : undefined);
                          setSkipFor(null);
                        }}
                        className="filter-pill tap-target seg-off glass disabled:opacity-50">
                        {r.label}{r.excused ? '' : ' (−body)'}
                      </button>
                    ))}
                  </div>
                  <Input value={skipNote} onChange={e => setSkipNote(e.target.value)} maxLength={200}
                    aria-label="Důvod přeskočení (u „Jiný důvod“ povinný)" placeholder={'U „Jiný důvod" napiš proč…'} />
                  <Button variant="ghost" size="sm" onClick={() => setSkipFor(null)}>Zrušit</Button>
                </div>
              </div>
            )}

            {/* Footer / complete */}
            <div className="px-3 pb-3 pt-1 space-y-2">
              {/* Live tally — highlights anything not yet finished */}
              {unfinished > 0 && (
                <p className="t-meta text-center">
                  {done} hotovo
                  {skipped > 0 && <span className="text-wait-ink"> · {skipped} přeskočeno</span>}
                  {remaining > 0 && <> · {remaining} zbývá</>}
                </p>
              )}
              <Button variant="primary" block icon="check" onClick={onFinishClick} loading={completing}>Dokončit</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
