'use client';

import { useMemo, useState } from 'react';
import { Icon } from './Icons';
import { recurrenceLabel } from './TaskChecklist';

// Minimal shape the board needs — both the employer and employee task types
// satisfy this.
export type BoardTask = {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  recurrence?: string | null;
  teamTask?: boolean;
  completedByName?: string | null;
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const WD = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const prioDot = (p: string) => p === 'high' ? 'bg-red-500' : p === 'medium' ? 'bg-orange-400' : 'bg-[#C8F542]';

// A horizontally-scrolling week board: 7 day columns, cards = tasks due that
// day. Columns keep a comfortable width and scroll sideways rather than being
// squeezed, so titles never get crushed.
export default function TaskWeekBoard({ tasks, weekStart, onComplete, labelFor, onOpen }: {
  tasks: BoardTask[];
  weekStart: number;
  onComplete: (t: BoardTask, done: boolean) => void;
  labelFor?: (t: BoardTask) => string;
  onOpen?: (t: BoardTask) => void;
}) {
  const [offset, setOffset] = useState(0);
  const today = ymd(new Date());

  const days = useMemo(() => {
    const base = new Date(); base.setHours(0, 0, 0, 0);
    const toStart = (base.getDay() - weekStart + 7) % 7;
    const start = new Date(base);
    start.setDate(base.getDate() - toStart + offset * 7);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [weekStart, offset]);

  const byDay = useMemo(() => {
    const m = new Map<string, BoardTask[]>();
    for (const t of tasks) if (t.dueDate) (m.get(t.dueDate) ?? m.set(t.dueDate, []).get(t.dueDate)!).push(t);
    return m;
  }, [tasks]);

  const card = (t: BoardTask) => {
    const done = t.status === 'done';
    const label = labelFor?.(t);
    return (
      <div key={t.id} className={`rounded-xl bg-white border border-black/[0.07] p-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${done ? 'opacity-55' : ''}`}>
        <div className="flex items-start gap-2">
          <button onClick={() => onComplete(t, !done)} title={done ? 'Zrušit hotové' : 'Hotovo'}
            className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border flex items-center justify-center transition ${done ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/25 hover:border-[#C8F542]/70'}`}>
            {done && <span className="text-[9px] font-bold leading-none">✓</span>}
          </button>
          <button onClick={() => onOpen?.(t)} className="min-w-0 flex-1 text-left">
            <p className={`text-[12px] font-semibold leading-snug break-words ${done ? 'line-through text-black/40' : 'text-[#16181A]'}`}>{t.title}</p>
            <div className="flex items-center gap-1 mt-1 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${prioDot(t.priority)}`} />
              {label && <span className="text-[10px] text-black/45 truncate">{label}</span>}
              {recurrenceLabel(t.recurrence) && <span className="text-[10px] text-[#5B7A08] shrink-0">↻</span>}
            </div>
            {done && t.completedByName && <p className="text-[9.5px] text-black/35 mt-0.5 truncate">splnil {t.completedByName}</p>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOffset(o => o - 1)} className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.05]">
          <Icon name="chevron" size={16} className="rotate-90" />
        </button>
        <p className="text-sm font-semibold text-[#16181A] text-center">
          {days[0].toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })} – {days[6].toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}
          {offset === 0 && <span className="text-black/40 font-normal"> · tento týden</span>}
        </p>
        <button onClick={() => setOffset(o => o + 1)} className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.05]">
          <Icon name="chevron" size={16} className="-rotate-90" />
        </button>
      </div>

      <div className="flex gap-2.5 overflow-x-auto scrollbar-thin pb-2 -mx-1 px-1 snap-x">
        {days.map(d => {
          const key = ymd(d);
          const list = (byDay.get(key) ?? []).slice().sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'));
          const isToday = key === today;
          return (
            <div key={key} className={`shrink-0 w-[44vw] sm:w-48 md:w-[13.5rem] snap-start rounded-2xl border p-2 ${isToday ? 'bg-[#C8F542]/[0.08] border-[#C8F542]/40' : 'bg-black/[0.02] border-black/[0.06]'}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wide px-1 pb-2 ${isToday ? 'text-[#5B7A08]' : 'text-black/40'}`}>
                {WD[d.getDay()]} {d.getDate()}.
              </p>
              <div className="space-y-1.5 min-h-[3rem]">
                {list.map(card)}
                {list.length === 0 && <p className="text-[11px] text-black/20 px-1 py-3 text-center">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
