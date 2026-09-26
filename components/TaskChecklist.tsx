'use client';

import { Icon } from './Icons';
import { Button } from './ui';

export type ChecklistItem = { text: string; done: boolean };

export const RECURRENCE_OPTIONS = [
  { value: '', label: 'Neopakovat' },
  { value: 'daily', label: 'Denně' },
  { value: 'weekdays', label: 'Pracovní dny' },
  { value: 'weekly', label: 'Týdně' },
];

export function recurrenceLabel(r?: string | null): string | null {
  switch (r) {
    case 'daily': return 'Denně';
    case 'weekdays': return 'Pracovní dny';
    case 'weekly': return 'Týdně';
    default: return null;
  }
}

// A read/tick checklist rendered under a task. `onToggle(index)` flips one item;
// the parent persists the whole list.
export function TaskChecklist({ items, onToggle, onToggleAll }: {
  items: ChecklistItem[];
  onToggle?: (index: number) => void;
  /**
   * Odškrtnout celý seznam najednou. Dvanáctibodový zavírací postup se
   * odklikával po jedné položce i ve chvíli, kdy je hotový celý — což je
   * ten nejčastější případ, kdy se na checklist sahá naposled.
   */
  onToggleAll?: (done: boolean) => void;
}) {
  if (!items || items.length === 0) return null;
  const done = items.filter(i => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  const allDone = done === items.length;
  return (
    <div className="mt-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-black/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-[#C8F542] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-medium tabular-nums text-black/55 shrink-0">{done}/{items.length}</span>
        {/* Kolo 69: dřív ruční pilulka 11 px; tichá akce v řádku je ghost Button. */}
        {onToggleAll && items.length > 2 && (
          <Button variant="ghost" size="sm" className="shrink-0 -my-1" onClick={() => onToggleAll(!allDone)}>
            {allDone ? 'Zrušit vše' : 'Odškrtnout vše'}
          </Button>
        )}
      </div>
      <div className="space-y-0.5">
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            onClick={onToggle ? () => onToggle(i) : undefined}
            disabled={!onToggle}
            role="checkbox"
            aria-checked={it.done}
            // Rádiusy ze systému (řádek i zaškrtávátko 10 px) a fajfka z Icons.tsx místo vlastního SVG (kolo 69).
            className={`tap-target-sm flex w-full items-center gap-2 rounded-xl px-1.5 py-1 text-left text-sm transition-colors ${onToggle ? 'hover:bg-black/[0.03]' : ''}`}
          >
            <span aria-hidden className={`grid place-items-center h-[18px] w-[18px] shrink-0 rounded-xl border transition-colors ${
              it.done ? 'bg-[#C8F542] border-[#C8F542] on-accent' : 'border-black/25 text-transparent'
            }`}>
              <Icon name="check" size={12} strokeWidth={2.6} />
            </span>
            <span className={`min-w-0 truncate ${it.done ? 'line-through text-black/45' : 'text-black/70'}`}>{it.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
