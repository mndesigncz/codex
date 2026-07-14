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
  { value: 'pending', label: 'Čeká', color: 'bg-tea-100 text-tea-600' },
  { value: 'in_progress', label: 'Probíhá', color: 'bg-blue-100 text-blue-700' },
  { value: 'done', label: 'Hotovo', color: 'bg-green-100 text-green-700' },
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
    <div className="p-6 space-y-5">
      {/* Filter tabs */}
      <div className="flex gap-2 bg-tea-100 p-1 rounded-xl w-fit">
        {[{ id: 'all', label: 'Všechny', count: tasks.length }, { id: 'pending', label: 'Čeká', count: counts.pending }, { id: 'in_progress', label: 'Probíhá', count: counts.in_progress }, { id: 'done', label: 'Hotovo', count: counts.done }].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f.id ? 'bg-white shadow text-tea-800' : 'text-tea-500 hover:text-tea-700'}`}>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="text-4xl animate-spin">⏳</div></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-tea-100 p-8 text-center">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-tea-400">{filter === 'done' ? 'Žádné splněné úkoly.' : 'Žádné úkoly v této kategorii.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => {
            const statusOpt = getStatusOption(task.status);
            return (
              <div key={task.id} className={`bg-white rounded-2xl border-2 border-tea-100 p-5 ${task.status === 'done' ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">{priorityIcon(task.priority)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-semibold text-tea-800 ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</p>
                      <select
                        value={task.status}
                        onChange={e => updateStatus(task.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${statusOpt.color} focus:outline-none`}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    {task.description && <p className="text-sm text-tea-500 mt-1">{task.description}</p>}
                    {task.dueDate && (
                      <p className={`text-xs mt-2 ${new Date(task.dueDate) < new Date() && task.status !== 'done' ? 'text-red-500 font-medium' : 'text-tea-400'}`}>
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
