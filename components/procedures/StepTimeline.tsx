'use client';

import { Step, fmtMinutes } from '@/lib/steps';

type Status = 'pending' | 'done' | 'failed';

interface Props {
  steps: Step[];
  // index -> status. Absent = pending.
  statuses?: Record<number, Status>;
  onToggle?: (index: number) => void;   // left-click / tap → done
  onFail?: (index: number) => void;     // optional → failed
  interactive?: boolean;
  compact?: boolean;
}

const clockGlyph = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const checkGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
);
const crossGlyph = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
const infoGlyph = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);

// Soft rotating tints for the emoji tile, so a routine reads like the
// reference's colorful cards without any per-step configuration.
const TILES = [
  'bg-[#C8F542]/25 text-[#5B7A08]',
  'bg-[#0A84FF]/12 text-[#0A6FE0]',
  'bg-[#FF9F0A]/15 text-[#C77700]',
  'bg-[#BF5AF2]/12 text-[#8E3FC0]',
  'bg-[#FF6482]/12 text-[#D63A5C]',
];

export default function StepTimeline({ steps, statuses = {}, onToggle, onFail, interactive = false, compact = false }: Props) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const status: Status = statuses[i] ?? 'pending';
        const done = status === 'done';
        const failed = status === 'failed';
        const last = i === steps.length - 1;

        // Connector color reflects the step above it being resolved.
        const lineColor = done ? 'bg-[#C8F542]' : failed ? 'bg-red-300' : 'bg-black/10';

        return (
          <li key={i} className="relative flex gap-3">
            {/* Timeline rail: status dot + connecting line */}
            <div className="flex flex-col items-center flex-shrink-0">
              <button
                type="button"
                disabled={!interactive}
                onClick={() => onToggle?.(i)}
                onContextMenu={(e) => { if (interactive && onFail) { e.preventDefault(); onFail(i); } }}
                title={interactive ? (done ? 'Označit jako nesplněné' : 'Označit jako splněné') : undefined}
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition ${
                  done
                    ? 'bg-[#C8F542] border-[#C8F542] text-black'
                    : failed
                    ? 'bg-red-500 border-red-500 text-white'
                    : `bg-white border-black/20 text-transparent ${interactive ? 'hover:border-[#C8F542] cursor-pointer' : ''}`
                }`}
              >
                {done ? checkGlyph : failed ? crossGlyph : <span className="h-2 w-2 rounded-full bg-transparent" />}
              </button>
              {!last && <span className={`w-0.5 flex-1 my-1 rounded-full transition-colors ${lineColor}`} style={{ minHeight: compact ? 18 : 26 }} />}
            </div>

            {/* Step card */}
            <div className={`flex-1 min-w-0 ${last ? '' : compact ? 'mb-2' : 'mb-3'}`}>
              <div
                onClick={() => interactive && onToggle?.(i)}
                className={`rounded-2xl border px-3.5 ${compact ? 'py-2.5' : 'py-3'} transition ${
                  done
                    ? 'bg-[#C8F542]/[0.09] border-[#C8F542]/25'
                    : failed
                    ? 'bg-red-500/[0.06] border-red-500/20'
                    : 'bg-white/70 border-black/[0.07] hover:border-black/15'
                } ${interactive ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex ${compact ? 'h-8 w-8' : 'h-9 w-9'} flex-shrink-0 items-center justify-center rounded-xl text-lg ${TILES[i % TILES.length]}`}>
                    {s.emoji || '•'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold leading-snug ${compact ? 'text-sm' : 'text-[15px]'} ${done || failed ? 'text-black/40 line-through' : 'text-[#16181A]'}`}>
                      {s.text}
                    </p>
                    {s.note && !compact && (
                      <p className="mt-0.5 flex items-start gap-1 text-xs text-black/45">
                        <span className="mt-0.5 flex-shrink-0 text-black/30">{infoGlyph}</span>
                        <span className="leading-snug">{s.note}</span>
                      </p>
                    )}
                  </div>
                  {s.minutes != null && (
                    <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-black/55 tabular-nums">
                      {clockGlyph}{fmtMinutes(s.minutes)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
