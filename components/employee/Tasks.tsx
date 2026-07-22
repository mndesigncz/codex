'use client';

import { useState, useEffect } from 'react';
import { TaskChecklist, recurrenceLabel, ChecklistItem } from '../TaskChecklist';

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: string;
  status: string;
  dueDate?: string;
  recurrence?: string | null;
  teamTask?: boolean;
  completedByName?: string | null;
  checklist?: ChecklistItem[];
}

interface Props {
  user: { id?: string };
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Čeká', color: 'bg-black/[0.05] text-black/60' },
  { value: 'in_progress', label: 'Probíhá', color: 'bg-[#0A84FF]/15 text-[#0A6FE0]' },
  { value: 'done', label: 'Hotovo', color: 'bg-[#C8F542]/15 text-[#5B7A08]' },
];

export default function Tasks({ user }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = parseInt(user.id ?? '0');

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/tasks?assignedTo=${userId}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTasks(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  const today = new Date().toISOString().split('T')[0];

  const updateStatus = async (task: Task, newStatus: string) => {
    // Completing a task on a day that isn't its due day → warn first.
    if (newStatus === 'done' && task.dueDate && task.dueDate !== today) {
      const d = new Date(task.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
      if (!confirm(`Tohle není dnešní úkol (termín: ${d}). Opravdu ho chceš splnit teď?`)) return;
    }
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: newStatus }),
      });
      if (res.ok) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleChecklistItem = async (task: Task, index: number) => {
    const next = (task.checklist ?? []).map((it, i) => i === index ? { ...it, done: !it.done } : it);
    const prev = tasks;
    setTasks(ts => ts.map(x => x.id === task.id ? { ...x, checklist: next } : x));
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, checklist: next }),
      });
      if (!res.ok) throw new Error();
    } catch { setTasks(prev); }
  };

  const priorityColor = (p: string) => p === 'high' ? 'bg-red-500' : p === 'medium' ? 'bg-orange-400' : 'bg-[#C8F542]';
  const getStatusOption = (status: string) => STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];

  // Group by day: overdue, today (incl. no-date), upcoming (future), done.
  const byDate = (a: Task, b: Task) => String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? ''));
  const undone = tasks.filter(t => t.status !== 'done');
  const overdue = undone.filter(t => t.dueDate && t.dueDate < today).sort(byDate);
  const todayTasks = undone.filter(t => !t.dueDate || t.dueDate === today).sort(byDate);
  const upcoming = undone.filter(t => t.dueDate && t.dueDate > today).sort(byDate);
  const done = tasks.filter(t => t.status === 'done').sort((a, b) => byDate(b, a)).slice(0, 20);

  const card = (task: Task) => {
    const statusOpt = getStatusOption(task.status);
    return (
      <div key={task.id} className={`glass-card p-5 sm:p-6 transition-all ${task.status === 'done' ? 'opacity-50' : ''}`}>
        <div className="flex items-start gap-3">
          <button
            onClick={() => updateStatus(task, task.status === 'done' ? 'pending' : 'done')}
            className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 transition ${
              task.status === 'done' ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/15 hover:border-[#C8F542]/60'
            }`}
          >
            {task.status === 'done' && <span className="text-xs font-bold">✓</span>}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <p className={`font-semibold text-[#16181A] tracking-tight ${task.status === 'done' ? 'line-through' : ''}`}>
                <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${priorityColor(task.priority)}`} />{task.title}
              </p>
              <select
                value={task.status}
                onChange={e => updateStatus(task, e.target.value)}
                className={`text-xs px-3 py-1 rounded-full border-0 font-medium cursor-pointer ${statusOpt.color} focus:outline-none`}
              >
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {task.description && <p className="text-sm text-black/55 mt-1.5">{task.description}</p>}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {task.dueDate && (
                <p className={`text-xs ${task.dueDate < today && task.status !== 'done' ? 'text-red-600 font-medium' : 'text-black/45'}`}>
                  {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                  {task.dueDate < today && task.status !== 'done' && ' · po termínu'}
                </p>
              )}
              {task.teamTask && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#0A84FF]/12 text-[#0A6FE0] px-2 py-0.5 text-[10px] font-semibold">🗓️ Pro kohokoliv</span>
              )}
              {recurrenceLabel(task.recurrence) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-2 py-0.5 text-[10px] font-semibold">↻ {recurrenceLabel(task.recurrence)}</span>
              )}
              {task.status === 'done' && task.completedByName && (
                <span className="text-[10px] text-black/40">splnil {task.completedByName}</span>
              )}
            </div>
            {task.checklist && task.checklist.length > 0 && (
              <TaskChecklist items={task.checklist} onToggle={i => toggleChecklistItem(task, i)} />
            )}
          </div>
        </div>
      </div>
    );
  };

  const section = (title: string, list: Task[], tone = 'text-black/45') =>
    list.length > 0 && (
      <div className="space-y-2.5">
        <h3 className={`text-xs font-bold uppercase tracking-[0.13em] ${tone}`}>{title} ({list.length})</h3>
        {list.map(card)}
      </div>
    );

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto w-full">
      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : tasks.length === 0 ? (
        <div className="glass-card p-8 text-center"><p className="text-black/45">Zatím žádné úkoly.</p></div>
      ) : (
        <>
          {section('Po termínu', overdue, 'text-red-600')}
          {section('Dnes', todayTasks, 'text-[#5B7A08]')}
          {section('Budoucí úkoly', upcoming)}
          {section('Hotové', done)}
          {overdue.length + todayTasks.length + upcoming.length === 0 && (
            <div className="glass-card p-8 text-center"><p className="text-black/45">Vše hotovo. 🎉</p></div>
          )}
        </>
      )}
    </div>
  );
}
