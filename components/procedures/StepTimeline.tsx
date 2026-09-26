'use client';

import { Step, fmtMinutes } from '@/lib/steps';
import { Icon } from '../Icons';
import { Button, Chip } from '../ui';
import { clickable } from '@/lib/clickable';

type Status = 'pending' | 'done' | 'skipped';

interface Props {
  steps: Step[];
  // index -> status. Absent = pending.
  statuses?: Record<number, Status>;
  onToggle?: (index: number) => void;   // left-click / tap → done
  onSkip?: (index: number) => void;     // skip button / right-click → skipped
  interactive?: boolean;
  compact?: boolean;
  /**
   * Jak otevřít návod připnutý ke kroku.
   *
   * Ve webu stačí odkaz `?view=guides&guide=N` — layout ho umí přečíst.
   * Na tabletu URL směrování není, takže kiosk předá callback a přepne
   * záložku sám. Bez obojího se odkaz nevykreslí vůbec, aby nikde
   * nesvítilo tlačítko, které nikam nevede.
   */
  onOpenGuide?: (guideId: number) => void;
  guideHref?: (guideId: number) => string;
}

// Kolo 69 (B6b): vlastní SVG glyfy (hodiny, fajfka, přeskočit, info, kniha) nahradila sada
// z Icons.tsx; limetková dlaždice u každého kroku, limetkový/oranžový tón karty a limetková
// ZÁŘE tečky hotového kroku pryč (audit: limetka je akce, ne stav). Hotové = inkoustová
// tečka s fajfkou a přeškrtnutý text, přeskočené = tečka ve stavovém tónu „čeká".

export default function StepTimeline({ steps, statuses = {}, onToggle, onSkip, interactive = false, compact = false, onOpenGuide, guideHref }: Props) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const status: Status = statuses[i] ?? 'pending';
        const prev: Status = statuses[i - 1] ?? 'pending';
        const done = status === 'done';
        const skipped = status === 'skipped';
        const first = i === 0;
        const last = i === steps.length - 1;

        const segColor = (st: Status) => (st === 'done' ? 'bg-black/45' : st === 'skipped' ? 'bg-wait/70' : 'bg-black/[0.12]');

        return (
          <li key={i} className="relative flex items-stretch gap-3">
            {/* Card */}
            <div className={`flex-1 min-w-0 ${compact ? 'mb-2' : 'mb-3'}`}>
              <div
                {...clickable(() => onToggle?.(i), {
                  disabled: !interactive,
                  label: `${done ? 'Zrušit splnění' : 'Označit jako hotové'} — ${s.text}`,
                })}
                // Přeskočení krok viselo jen na pravém tlačítku myši, takže
                // klávesnicí ani na tabletu nešlo vůbec. Pravé tlačítko
                // zůstává jako zkratka; „S" dělá totéž z klávesnice a pod
                // kartou je na to i tlačítko.
                onContextMenu={(e) => { if (interactive && onSkip) { e.preventDefault(); onSkip(i); } }}
                onKeyDown={(e) => {
                  if (!interactive) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (e.target !== e.currentTarget) return;
                    e.preventDefault(); onToggle?.(i);
                  } else if (onSkip && (e.key === 's' || e.key === 'S')) {
                    e.preventDefault(); onSkip(i);
                  }
                }}
                className={`rounded-3xl px-3.5 ${compact ? 'py-2.5' : 'py-3'} border bg-white transition-[transform,border-color] ${
                  skipped ? 'border-wait/30' : 'border-black/[0.07]'
                } ${interactive ? 'cursor-pointer active:scale-[0.99]' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`well flex ${compact ? 'h-8 w-8 text-base' : 'h-10 w-10 text-xl'} flex-shrink-0 items-center justify-center text-black/60`}>
                    {s.emoji || <span className="text-sm font-bold">{i + 1}</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold leading-snug ${compact ? 'text-sm' : 'text-[15px]'} ${done ? 'text-black/40 line-through' : skipped ? 'text-black/45' : 'text-[#16181A]'}`}>
                      {s.text}
                    </p>
                    {skipped ? (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-wait-ink">
                        <Icon name="chevronRight" size={13} /> Přeskočeno
                      </p>
                    ) : s.note && !compact && (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-black/45">
                        <Icon name="info" size={12} className="mt-0.5 flex-shrink-0 text-black/30" />
                        <span className="leading-snug">{s.note}</span>
                      </p>
                    )}
                    {/* Návod ke kroku. Klik se nesmí propsat na kartu — ta
                        krok odškrtne, takže bez stopPropagation by otevření
                        návodu zároveň prohlásilo krok za hotový. */}
                    {s.guideId != null && !skipped && (onOpenGuide || guideHref) && (
                      onOpenGuide ? (
                        <Button variant="secondary" size="sm" icon="book" className="mt-1.5"
                          onClick={(e) => { e.stopPropagation(); onOpenGuide(s.guideId as number); }}>
                          Otevřít návod
                        </Button>
                      ) : (
                        <a href={guideHref!(s.guideId as number)}
                          onClick={(e) => e.stopPropagation()}
                          className="btn btn-secondary btn-sm mt-1.5 inline-flex items-center gap-1.5">
                          <Icon name="book" size={14} /> Otevřít návod
                        </a>
                      )
                    )}
                  </div>
                  {s.minutes != null && !skipped && (
                    <Chip tone="muted" size="sm" icon="clock" className="flex-shrink-0 tabular-nums">{fmtMinutes(s.minutes)}</Chip>
                  )}
                  {/* Skip / undo-skip control */}
                  {interactive && onSkip && !done && (
                    <Button variant="ghost" size="sm" icon={skipped ? 'undo' : 'chevronRight'} className="flex-shrink-0"
                      iconOnly={compact && !skipped}
                      aria-label={skipped ? `Vrátit mezi kroky: ${s.text}` : `Přeskočit krok: ${s.text}`}
                      title={skipped ? 'Vrátit mezi kroky' : 'Přeskočit tento krok'}
                      onClick={(e) => { e.stopPropagation(); onSkip(i); }}>
                      {compact && !skipped ? undefined : skipped ? 'Vrátit' : 'Přeskočit'}
                    </Button>
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
                onContextMenu={(e) => { if (interactive && onSkip) { e.preventDefault(); onSkip(i); } }}
                title={interactive ? (done ? 'Zrušit označení' : 'Označit jako splněné') : undefined}
                aria-label={interactive ? `${done ? 'Zrušit splnění' : 'Označit jako hotové'} — ${s.text}` : undefined}
                className={`absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  done
                    ? 'bg-[#16181A] text-white'
                    : skipped
                    ? 'bg-wait text-white'
                    : `bg-white border-2 border-black/15 ${interactive ? 'hover:border-black/40 cursor-pointer' : ''}`
                }`}
              >
                {done ? <Icon name="check" size={15} strokeWidth={2.4} /> : skipped ? <Icon name="chevronRight" size={13} strokeWidth={2.4} /> : null}
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
