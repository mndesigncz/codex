'use client';

import { useState, useEffect } from 'react';

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: string;
  status: string;
  dueDate?: string;
}

interface Props {
  user: { id?: string };
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Čeká', color: 'bg-white/[0.08] text-white/60' },
  { value: 'in_progress', label: 'Probíhá', color: 'bg-[#0A84FF]/15 text-[#0A84FF]' },
  { value: 'done', label: 'Hotovo', color: 'bg-[#C8F542]/15 text-[#C8F542]' },
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
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  const counts = { pending: tasks.filter(t => t.status === 'pending').length, in_progress: tasks.filter(t => t.status === 'in_progress').length, done: tasks.filter(t => t.status === 'done').length };

  const priorityIcon = (p: string) => p === 'high' ? '🔴' : p === 'medium' ? '🟡' : '🟢';

  const getStatusOption = (status: string) => STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];

  return (
    <div className="p-6 space-y-6">
      {/* Filter tabs */}
      <div className="flex gap-1 glass rounded-full p-1 w-fit overflow-x-auto">
        {[{ id: 'all', label: 'Všechny', count: tasks.length }, { id: 'pending', label: 'Čeká', count: counts.pending }, { id: 'in_progress', label: 'Probíhá', count: counts.in_progress }, { id: 'done', label: 'Hotovo', count: counts.done }].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-300 ${filter === f.id ? 'bg-[#C8F542] text-black' : 'text-white/50 hover:text-white hover:bg-white/[0.06]'}`}>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-[#C8F542] animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-white/40">{filter === 'done' ? 'Žádné splněné úkoly.' : 'Žádné úkoly v této kategorii.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => {
            const statusOpt = getStatusOption(task.status);
            return (
              <div key={task.id} className={`glass-card p-6 hover:bg-white/[0.08] transition-all duration-300 ${task.status === 'done' ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => updateStatus(task.id, task.status === 'done' ? 'pending' : 'done')}
                    className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-300 ${
                      task.status === 'done' ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-white/20 hover:border-[#C8F542]/60'
                    }`}
                  >
                    {task.status === 'done' && <span className="text-xs font-bold">✓</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className={`font-semibold text-white tracking-tight ${task.status === 'done' ? 'line-through' : ''}`}>
                        <span className="mr-2">{priorityIcon(task.priority)}</span>{task.title}
                      </p>
                      <select
                        value={task.status}
                        onChange={e => updateStatus(task.id, e.target.value)}
                        className={`text-xs px-3 py-1 rounded-full border-0 font-medium cursor-pointer ${statusOpt.color} focus:outline-none`}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    {task.description && <p className="text-sm text-white/50 mt-1.5">{task.description}</p>}
                    {task.dueDate && (
                      <p className={`text-xs mt-2 ${new Date(task.dueDate) < new Date() && task.status !== 'done' ? 'text-red-400 font-medium' : 'text-white/40'}`}>
                        📅 Do: {task.dueDate}
                        {new Date(task.dueDate) < new Date() && task.status !== 'done' && ' ⚠️ Po termínu'}
                      </p>
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
