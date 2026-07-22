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
  const [filter, setFilter] = useState<string>('all');

  const userId = parseInt(user.id ?? '0');

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/tasks?assignedTo=${userId}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTasks(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  const updateStatus = async (taskId: number, newStatus: string) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      if (res.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
        // A recurring task respawns server-side on completion — refetch to see it.
        const done = newStatus === 'done';
        if (done && tasks.find(t => t.id === taskId)?.recurrence) {
          fetch(`/api/tasks?assignedTo=${userId}`).then(r => r.json())
            .then(d => { if (Array.isArray(d)) setTasks(d); }).catch(() => {});
        }
      }
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

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  const counts = { pending: tasks.filter(t => t.status === 'pending').length, in_progress: tasks.filter(t => t.status === 'in_progress').length, done: tasks.filter(t => t.status === 'done').length };

  const priorityColor = (p: string) => p === 'high' ? 'bg-red-500' : p === 'medium' ? 'bg-orange-400' : 'bg-[#C8F542]';

  const getStatusOption = (status: string) => STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];

  return (
    <div className="p-6 space-y-6">
      {/* Filter tabs */}
      <div className="flex gap-1 glass rounded-full p-1 w-fit overflow-x-auto">
        {[{ id: 'all', label: 'Všechny', count: tasks.length }, { id: 'pending', label: 'Čeká', count: counts.pending }, { id: 'in_progress', label: 'Probíhá', count: counts.in_progress }, { id: 'done', label: 'Hotovo', count: counts.done }].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-300 ${filter === f.id ? 'bg-[#C8F542] text-black' : 'text-black/55 hover:text-black hover:bg-black/[0.04]'}`}>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center">
          
          <p className="text-black/45">{filter === 'done' ? 'Žádné splněné úkoly.' : 'Žádné úkoly v této kategorii.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => {
            const statusOpt = getStatusOption(task.status);
            return (
              <div key={task.id} className={`glass-card p-6 hover:bg-black/[0.05] transition-all duration-300 ${task.status === 'done' ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => updateStatus(task.id, task.status === 'done' ? 'pending' : 'done')}
                    className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-300 ${
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
                        onChange={e => updateStatus(task.id, e.target.value)}
                        className={`text-xs px-3 py-1 rounded-full border-0 font-medium cursor-pointer ${statusOpt.color} focus:outline-none`}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    {task.description && <p className="text-sm text-black/55 mt-1.5">{task.description}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {task.dueDate && (
                        <p className={`text-xs ${new Date(task.dueDate) < new Date() && task.status !== 'done' ? 'text-red-600 font-medium' : 'text-black/45'}`}>
                          Do: {task.dueDate}
                          {new Date(task.dueDate) < new Date() && task.status !== 'done' && ' · Po termínu'}
                        </p>
                      )}
                      {task.teamTask && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#0A84FF]/12 text-[#0A6FE0] px-2 py-0.5 text-[10px] font-semibold">
                          🗓️ Pro kohokoliv
                        </span>
                      )}
                      {recurrenceLabel(task.recurrence) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-2 py-0.5 text-[10px] font-semibold">
                          ↻ {recurrenceLabel(task.recurrence)}
                        </span>
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
          })}
        </div>
      )}
    </div>
  );
}
