'use client';

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
export function TaskChecklist({ items, onToggle }: {
  items: ChecklistItem[];
  onToggle?: (index: number) => void;
}) {
  if (!items || items.length === 0) return null;
  const done = items.filter(i => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  return (
    <div className="mt-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-black/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-[#C8F542] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] font-medium tabular-nums text-black/45 shrink-0">{done}/{items.length}</span>
      </div>
      <div className="space-y-0.5">
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            onClick={onToggle ? () => onToggle(i) : undefined}
            disabled={!onToggle}
            className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm transition ${onToggle ? 'hover:bg-black/[0.03]' : ''}`}
          >
            <span className={`grid place-items-center h-4 w-4 shrink-0 rounded-[5px] border transition ${
              it.done ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/25 text-transparent'
            }`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
            </span>
            <span className={`min-w-0 truncate ${it.done ? 'line-through text-black/35' : 'text-black/70'}`}>{it.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
