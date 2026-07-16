'use client';

import { Step, fmtMinutes } from '@/lib/steps';

type Status = 'pending' | 'done' | 'failed';

interface Props {
  steps: Step[];
  // index -> status. Absent = pending.
  statuses?: Record<number, Status>;
  onToggle?: (index: number) => void;   // left-click / tap → done
  onFail?: (index: number) => void;     // right-click / long-press → failed
  interactive?: boolean;
  compact?: boolean;
}

const clockGlyph = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const checkGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
);
const crossGlyph = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
const infoGlyph = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);

// One consistent on-brand tile (lime + lime-text) for every step.
const TILE = 'bg-[#C8F542]/30 text-[#5B7A08]';

export default function StepTimeline({ steps, statuses = {}, onToggle, onFail, interactive = false, compact = false }: Props) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const status: Status = statuses[i] ?? 'pending';
        const prev: Status = statuses[i - 1] ?? 'pending';
        const done = status === 'done';
        const failed = status === 'failed';
        const first = i === 0;
        const last = i === steps.length - 1;

        const segColor = (st: Status) => (st === 'done' ? 'bg-[#C8F542]' : st === 'failed' ? 'bg-red-300' : 'bg-black/[0.12]');

        return (
          <li key={i} className="relative flex items-stretch gap-3">
            {/* Card */}
            <div className={`flex-1 min-w-0 ${compact ? 'mb-2' : 'mb-3'}`}>
              <div
                onClick={() => interactive && onToggle?.(i)}
                onContextMenu={(e) => { if (interactive && onFail) { e.preventDefault(); onFail(i); } }}
                className={`rounded-[20px] px-3.5 ${compact ? 'py-2.5' : 'py-3'} border transition ${
                  done
                    ? 'bg-[#C8F542]/[0.12] border-[#C8F542]/30'
                    : failed
                    ? 'bg-red-500/[0.06] border-red-500/20'
                    : 'bg-white border-black/[0.05] shadow-[0_2px_10px_rgba(20,30,10,0.05)]'
                } ${interactive ? 'cursor-pointer active:scale-[0.99]' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex ${compact ? 'h-8 w-8 text-base' : 'h-10 w-10 text-xl'} flex-shrink-0 items-center justify-center rounded-2xl ${TILE}`}>
                    {s.emoji || <span className="text-sm font-bold">{i + 1}</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold leading-snug ${compact ? 'text-sm' : 'text-[15px]'} ${done || failed ? 'text-black/40 line-through' : 'text-[#16181A]'}`}>
                      {s.text}
                    </p>
                    {s.note && !compact && (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-black/45">
                        <span className="mt-0.5 flex-shrink-0 text-black/30">{infoGlyph}</span>
                        <span className="leading-snug">{s.note}</span>
                      </p>
                    )}
                  </div>
                  {s.minutes != null && (
                    <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-semibold text-black/55 tabular-nums">
                      {clockGlyph}{fmtMinutes(s.minutes)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right rail: connecting line + status dot */}
            <div className="relative w-7 flex-shrink-0">
              {/* incoming segment (from previous dot) */}
              {!first && <span className={`absolute left-1/2 -translate-x-1/2 top-0 h-1/2 w-[3px] rounded-full ${segColor(prev)}`} />}
              {/* outgoing segment (into next dot, bridging the card gap) */}
              {!last && <span className={`absolute left-1/2 -translate-x-1/2 top-1/2 ${compact ? '-bottom-2' : '-bottom-3'} w-[3px] rounded-full ${segColor(status)}`} />}
              {/* status dot, vertically centered on the card */}
              <button
                type="button"
                disabled={!interactive}
                onClick={() => onToggle?.(i)}
                onContextMenu={(e) => { if (interactive && onFail) { e.preventDefault(); onFail(i); } }}
                title={interactive ? (done ? 'Zrušit označení' : 'Označit jako splněné') : undefined}
                className={`absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full transition ${
                  done
                    ? 'bg-[#C8F542] text-black shadow-[0_2px_8px_rgba(200,245,66,0.5)]'
                    : failed
                    ? 'bg-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.4)]'
                    : `bg-white border-2 border-black/15 shadow-sm ${interactive ? 'hover:border-[#C8F542] cursor-pointer' : ''}`
                }`}
              >
                {done ? checkGlyph : failed ? crossGlyph : null}
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
