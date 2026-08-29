'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { useKioskShift } from './KioskShiftGate';
import { pragueToday } from '@/lib/pragueTime';

interface ChecklistItem { text: string; done: boolean }
interface Task {
  id: number;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  dueDate?: string | null;
  assignedTo?: number | null;
  teamTask?: boolean;
  checklist?: ChecklistItem[];
  assigneeName?: string | null;
  assigneeAvatar?: string | null;
  completedByName?: string | null;
}

type Filter = 'all' | 'mine' | 'open' | 'done';

const prioDot = (p: string) => p === 'high' ? 'bg-red-500' : p === 'medium' ? 'bg-orange-400' : 'bg-[#C8F542]';
const todayStr = () => pragueToday();

export default function KioskTasks() {
  const { active } = useKioskShift();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('open');

  const load = () => {
    fetch('/api/tasks').then(r => r.json()).then(d => { if (Array.isArray(d)) setTasks(d); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(load, []);

  const setStatus = async (t: Task, status: string) => {
    const prev = tasks;
    setTasks(list => list.map(x => x.id === t.id ? { ...x, status } : x));
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, status, actingAs: active?.id }),
      });
      if (!res.ok) throw new Error();
    } catch { setTasks(prev); }
  };

  const toggleChecklistItem = async (t: Task, index: number) => {
    const next = (t.checklist ?? []).map((it, i) => i === index ? { ...it, done: !it.done } : it);
    const prev = tasks;
    setTasks(list => list.map(x => x.id === t.id ? { ...x, checklist: next } : x));
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, checklist: next, actingAs: active?.id }),
      });
      if (!res.ok) throw new Error();
    } catch { setTasks(prev); }
  };

  const today = todayStr();
  const weekAhead = useMemo(() => pragueToday(7), [today]);

  const filtered = useMemo(() => tasks.filter(t => {
    if (filter === 'mine') return active != null && (t.assignedTo === active.id || t.assignedTo == null);
    if (filter === 'open') return t.status !== 'done';
    if (filter === 'done') return t.status === 'done';
    return true;
  }), [tasks, filter, active]);

  const byDate = (a: Task, b: Task) => String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? ''));
  const undone = filtered.filter(t => t.status !== 'done');
  const overdue = undone.filter(t => t.dueDate && t.dueDate < today).sort(byDate);
  const todayTasks = undone.filter(t => !t.dueDate || t.dueDate === today).sort(byDate);
  const thisWeek = undone.filter(t => t.dueDate && t.dueDate > today && t.dueDate <= weekAhead).sort(byDate);
  const later = undone.filter(t => t.dueDate && t.dueDate > weekAhead).sort(byDate);
  const done = filtered.filter(t => t.status === 'done').sort((a, b) => byDate(b, a)).slice(0, 30);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'open', label: 'Nesplněné' },
    { id: 'mine', label: active ? `Moje (${active.name.split(' ')[0]})` : 'Moje' },
    { id: 'all', label: 'Vše' },
    { id: 'done', label: 'Hotové' },
  ];

  const card = (t: Task) => {
    const isDone = t.status === 'done';
    const overdueTask = !isDone && t.dueDate && t.dueDate < today;
    return (
      <div key={t.id} className={`glass-card p-4 flex flex-col ${isDone ? 'opacity-60' : ''}`}>
        <div className="flex items-start gap-3 flex-1">
          <button
            onClick={() => setStatus(t, isDone ? 'pending' : 'done')}
            title={isDone ? 'Vrátit mezi nesplněné' : 'Označit jako hotové'}
            className={`mt-0.5 w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition active:scale-90 ${
              isDone ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/20 hover:border-[#C8F542]'
            }`}
          >
            {isDone && <span className="text-sm font-bold">✓</span>}
          </button>
          <div className="min-w-0 flex-1">
            <p className={`font-semibold text-[#16181A] leading-snug ${isDone ? 'line-through text-black/45' : ''}`}>
              <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${prioDot(t.priority)}`} />
              {t.title}
            </p>
            {t.description && !isDone && <p className="text-sm text-black/50 mt-1">{t.description}</p>}
            <p className="text-xs text-black/40 mt-1.5 truncate">
              {t.teamTask || t.assignedTo == null ? '🗓️ Kdokoliv' : `${t.assigneeAvatar ?? '👤'} ${t.assigneeName ?? ''}`}
              {t.dueDate && (
                <span className={overdueTask ? 'text-red-600 font-medium' : ''}>
                  {' · '}{new Date(t.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                  {overdueTask && ' · po termínu'}
                </span>
              )}
              {isDone && t.completedByName && ` · splnil ${t.completedByName}`}
            </p>
            {!isDone && t.checklist && t.checklist.length > 0 && (
              <div className="mt-2.5 space-y-1">
                {t.checklist.map((it, i) => (
                  <button key={i} onClick={() => toggleChecklistItem(t, i)}
                    className="w-full flex items-center gap-2.5 text-left min-h-[40px] rounded-xl px-2 -mx-2 hover:bg-black/[0.03] active:scale-[0.99] transition">
                    <span className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${
                      it.done ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/20'
                    }`}>
                      {it.done && <span className="text-[11px] font-bold">✓</span>}
                    </span>
                    <span className={`text-sm ${it.done ? 'text-black/40 line-through' : 'text-[#16181A]'}`}>{it.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const section = (title: string, list: Task[], tone = 'text-black/45') =>
    list.length > 0 && (
      <section>
        <h3 className={`text-xs font-bold uppercase tracking-[0.13em] ${tone} mb-2.5`}>{title} ({list.length})</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">{list.map(card)}</div>
      </section>
    );

  return (
    <div className="space-y-6">
      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold min-h-[44px] transition active:scale-[0.97] ${
              filter === f.id ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-black/45">
          {filter === 'done' ? 'Zatím nic hotového.' : 'Žádné úkoly. 🎉'}
        </div>
      ) : (
        <>
          {filter !== 'done' && overdue.length + todayTasks.length + thisWeek.length + later.length === 0 && (
            <div className="glass-card p-6 text-center text-[#5B7A08] font-medium">Všechny úkoly splněné! 🎉</div>
          )}
          {section('Po termínu', overdue, 'text-red-600')}
          {section('Dnes', todayTasks, 'text-[#5B7A08]')}
          {section('Tento týden', thisWeek)}
          {section('Později', later)}
          {(filter === 'done' || filter === 'all') && section('Hotové', done)}
        </>
      )}
    </div>
  );
}
