import { useState } from 'react';
import { tasks } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const todayStr = fmt(today);

const priorityConfig = {
  high:   { label: 'Vysoká',  dot: '🔴', bg: 'bg-red-50   border-red-100',    text: 'text-red-700' },
  medium: { label: 'Střední', dot: '🟡', bg: 'bg-amber-50 border-amber-100',  text: 'text-amber-700' },
  low:    { label: 'Nízká',   dot: '🟢', bg: 'bg-tea-50   border-tea-100',     text: 'text-tea-600' },
};

const statusConfig = {
  pending:     { label: 'Čeká',      color: 'bg-tea-100  text-tea-700' },
  in_progress: { label: 'Probíhá',   color: 'bg-blue-100 text-blue-700' },
  done:        { label: 'Hotovo',    color: 'bg-matcha-100 text-matcha-700' },
};

export default function Tasks({ user }) {
  const [myTasks, setMyTasks] = useState(
    tasks.filter(t => t.assignedTo === user?.id)
  );
  const [filter, setFilter] = useState('all');

  const filtered = myTasks.filter(t => {
    if (filter === 'pending') return t.status !== 'done';
    if (filter === 'done')    return t.status === 'done';
    return true;
  });

  const updateStatus = (id, status) => {
    setMyTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  const pending = myTasks.filter(t => t.status !== 'done').length;
  const done = myTasks.filter(t => t.status === 'done').length;

  const isOverdue = (task) => task.status !== 'done' && task.dueDate < todayStr;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-tea-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-amber-600">{pending}</p>
          <p className="text-xs text-tea-400 mt-1">Aktivní úkoly</p>
        </div>
        <div className="bg-white rounded-2xl border border-tea-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-matcha-700">{done}</p>
          <p className="text-xs text-tea-400 mt-1">Splněno</p>
        </div>
        <div className="bg-white rounded-2xl border border-tea-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-tea-800">{myTasks.length}</p>
          <p className="text-xs text-tea-400 mt-1">Celkem</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 bg-tea-100 p-1 rounded-xl w-fit">
        {[
          { id: 'all',     label: `Vše (${myTasks.length})` },
          { id: 'pending', label: `Aktivní (${pending})` },
          { id: 'done',    label: `Hotovo (${done})` },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              filter === f.id ? 'bg-white shadow text-matcha-700' : 'text-tea-500 hover:text-tea-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tasks */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-tea-100 p-12 text-center">
            <p className="text-3xl mb-2">{filter === 'done' ? '🎉' : '😴'}</p>
            <p className="text-tea-400">
              {filter === 'done' ? 'Zatím žádné splněné úkoly' : 'Žádné aktivní úkoly – volno!'}
            </p>
          </div>
        ) : (
          filtered.map(task => {
            const prio = priorityConfig[task.priority] || priorityConfig.medium;
            const st   = statusConfig[task.status]     || statusConfig.pending;
            const overdue = isOverdue(task);
            return (
              <div
                key={task.id}
                className={`bg-white rounded-2xl border-2 shadow-sm p-5 transition-all ${
                  task.status === 'done'
                    ? 'border-tea-100 opacity-70'
                    : overdue
                    ? 'border-red-200 bg-red-50'
                    : `border-${prio.bg.split(' ')[0].replace('bg-', '')}-100`
                }`}
              >
                <div className="flex gap-4">
                  {/* Status toggle */}
                  <button
                    onClick={() => updateStatus(task.id, task.status === 'done' ? 'pending' : 'done')}
                    className={`mt-0.5 w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                      task.status === 'done'
                        ? 'bg-matcha-500 border-matcha-500 text-white'
                        : 'border-tea-300 hover:border-matcha-400'
                    }`}
                  >
                    {task.status === 'done' && <span className="text-xs font-bold">✓</span>}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`font-semibold text-tea-800 ${task.status === 'done' ? 'line-through text-tea-400' : ''}`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-sm text-tea-500 mt-1 leading-relaxed">{task.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                          {st.label}
                        </span>
                        <span className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-tea-400'}`}>
                          {overdue ? '⚠️ Po termínu' : '📅'}{' '}
                          {new Date(task.dueDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </div>

                    {task.status !== 'done' && (
                      <div className="flex gap-2 mt-3">
                        {task.status === 'pending' && (
                          <button
                            onClick={() => updateStatus(task.id, 'in_progress')}
                            className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium transition-colors"
                          >
                            ▶ Zahájit
                          </button>
                        )}
                        {task.status === 'in_progress' && (
                          <button
                            onClick={() => updateStatus(task.id, 'done')}
                            className="text-xs px-3 py-1.5 bg-matcha-100 text-matcha-700 rounded-lg hover:bg-matcha-200 font-medium transition-colors"
                          >
                            ✓ Označit jako splněné
                          </button>
                        )}
                        <span className={`text-xs px-2 py-1 rounded-lg font-medium ${prio.text} ${prio.bg}`}>
                          {prio.dot} {prio.label} priorita
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
