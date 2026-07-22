'use client';

import { useMemo, useState } from 'react';
import { Icon } from './Icons';
import { recurrenceLabel } from './TaskChecklist';

export type BoardTask = {
  id: number;
  title: string;
  description?: string | null;
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

// A weekly kanban styled exactly like the Planning board — glass columns and
// draggable cards — but the columns are the days of the week. Dragging a card
// onto another day changes its due date (employer only, via onMove).
export default function TaskWeekBoard({ tasks, weekStart, onComplete, labelFor, onOpen, onMove, onAddForDay }: {
  tasks: BoardTask[];
  weekStart: number;
  onComplete: (t: BoardTask, done: boolean) => void;
  labelFor?: (t: BoardTask) => string;
  onOpen?: (t: BoardTask) => void;
  onMove?: (t: BoardTask, date: string) => void;
  onAddForDay?: (date: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
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

  const drop = (key: string) => {
    setDragOver(null);
    if (dragId == null) return;
    const t = tasks.find(x => x.id === dragId);
    setDragId(null);
    if (t && t.dueDate !== key) onMove?.(t, key);
  };

  const card = (t: BoardTask) => {
    const done = t.status === 'done';
    const label = labelFor?.(t);
    return (
      <div
        key={t.id}
        draggable={!!onMove}
        onDragStart={() => setDragId(t.id)}
        onDragEnd={() => { setDragId(null); setDragOver(null); }}
        className={`relative bg-black/[0.04] border border-black/[0.07] rounded-2xl p-3 transition-all ${onMove ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === t.id ? 'opacity-40' : 'hover:bg-black/[0.06]'} ${done ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start gap-2">
          <button onClick={() => onComplete(t, !done)} title={done ? 'Zrušit hotové' : 'Hotovo'}
            className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border flex items-center justify-center transition ${done ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/25 hover:border-[#C8F542]/70 bg-white/60'}`}>
            {done && <span className="text-[11px] font-bold leading-none">✓</span>}
          </button>
          <button onClick={() => onOpen?.(t)} className="min-w-0 flex-1 text-left">
            <p className={`font-semibold text-sm break-words ${done ? 'line-through text-black/40' : 'text-[#16181A]'}`}>{t.title}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={`w-2 h-2 rounded-full shrink-0 ${prioDot(t.priority)}`} />
              {label && <span className="text-[11px] text-black/50 truncate max-w-[9rem]">{label}</span>}
              {recurrenceLabel(t.recurrence) && (
                <span className="inline-flex items-center rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-1.5 py-0.5 text-[9px] font-semibold">↻</span>
              )}
            </div>
            {done && t.completedByName && <p className="text-[10px] text-black/35 mt-1">splnil {t.completedByName}</p>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Week navigation */}
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

      {/* Day columns — a horizontally scrolling kanban */}
      <div className="flex gap-4 overflow-x-auto scrollbar-thin pb-2 -mx-1 px-1 snap-x">
        {days.map(d => {
          const key = ymd(d);
          const list = (byDay.get(key) ?? []).slice().sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'));
          const isToday = key === today;
          return (
            <div
              key={key}
              onDragOver={onMove ? (e => { e.preventDefault(); setDragOver(key); }) : undefined}
              onDragLeave={onMove ? (() => setDragOver(c => (c === key ? null : c))) : undefined}
              onDrop={onMove ? (() => drop(key)) : undefined}
              className={`shrink-0 w-[15rem] snap-start glass rounded-3xl p-3.5 flex flex-col gap-3 transition-all ${dragOver === key ? 'ring-2 ring-[#C8F542]/60 bg-[#C8F542]/[0.05]' : ''} ${isToday ? 'ring-1 ring-[#C8F542]/40' : ''}`}
            >
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isToday ? 'bg-[#C8F542]' : 'bg-black/20'}`} />
                  <span className="font-semibold text-sm text-[#16181A] tracking-tight truncate">
                    {WD[d.getDay()]} <span className="text-black/45 font-normal">{d.getDate()}.{d.getMonth() + 1}.</span>
                  </span>
                </div>
                {list.length > 0 && <span className="rounded-full bg-black/[0.06] text-black/55 px-2 py-0.5 text-xs font-medium shrink-0">{list.length}</span>}
              </div>

              <div className="space-y-2.5 min-h-[3rem]">
                {list.map(card)}
                {list.length === 0 && <p className="text-[11px] text-black/25 text-center py-4">Žádný úkol</p>}
              </div>

              {onAddForDay && (
                <button onClick={() => onAddForDay(key)}
                  className="w-full py-2 border border-dashed border-black/10 rounded-2xl text-xs text-black/35 hover:border-[#C8F542]/40 hover:text-[#5B7A08] transition">
                  + Přidat úkol
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
