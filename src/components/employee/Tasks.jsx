import { useState } from 'react';
import { tasks as allTasks, employees } from '../../data/mockData.js';

const priorityColors = {
  high: { bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-700', dot: '🔴', label: 'Vysoká' },
  medium: { bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700', dot: '🟡', label: 'Střední' },
  low: { bg: 'bg-green-50 border-green-200', badge: 'bg-green-100 text-green-700', dot: '🟢', label: 'Nízká' },
};

const statusColors = {
  pending: { label: 'Čeká', badge: 'bg-tea-100 text-tea-600' },
  in_progress: { label: 'Probíhá', badge: 'bg-blue-100 text-blue-700' },
  done: { label: 'Hotovo', badge: 'bg-matcha-100 text-matcha-700' },
};

export default function Tasks({ user }) {
  const [tasks, setTasks] = useState(allTasks.filter(t => t.assignedTo === user.id));
  const [filter, setFilter] = useState('active');

  const filtered = tasks.filter(t => {
    if (filter === 'active') return t.status !== 'done';
    if (filter === 'done') return t.status === 'done';
    return true;
  });

  const handleStatus = (taskId, newStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const activeTasks = tasks.filter(t => t.status !== 'done').length;
  const highPriority = tasks.filter(t => t.priority === 'high' && t.status !== 'done').length;

  const today = new Date();
  const isOverdue = (dueDate) => new Date(dueDate) < today;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-tea-800">✅ Moje úkoly</h1>
        <p className="text-tea-500 text-sm">Úkoly přidělené vám vedením</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-tea-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-tea-800">{activeTasks}</p>
          <p className="text-xs text-tea-400 mt-1">Aktivní úkoly</p>
        </div>
        <div className="bg-white rounded-2xl border border-tea-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-red-500">{highPriority}</p>
          <p className="text-xs text-tea-400 mt-1">Vysoká priorita</p>
        </div>
        <div className="bg-white rounded-2xl border border-tea-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-matcha-600">{doneTasks}</p>
          <p className="text-xs text-tea-400 mt-1">Dokončeno</p>
        </div>
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="bg-white rounded-2xl border border-tea-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-tea-700">Celkový pokrok</span>
            <span className="text-sm font-bold text-matcha-700">{Math.round((doneTasks / tasks.length) * 100)}%</span>
          </div>
          <div className="w-full bg-tea-100 rounded-full h-3">
            <div
              className="h-full bg-gradient-to-r from-matcha-400 to-matcha-600 rounded-full transition-all"
              style={{ width: `${(doneTasks / tasks.length) * 100}%` }}
            />
          </div>
          <p className="text-xs text-tea-400 mt-1.5">{doneTasks} z {tasks.length} úkolů dokončeno</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 bg-tea-100 p-1 rounded-xl w-fit">
        {[['active', `⏳ Aktivní (${activeTasks})`], ['done', `✅ Dokončeno (${doneTasks})`], ['all', '📋 Vše']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${filter === id ? 'bg-white shadow text-matcha-700' : 'text-tea-500 hover:text-tea-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-tea-100 p-8 text-center">
            {filter === 'done' ? (
              <>
                <p className="text-3xl mb-2">📭</p>
                <p className="text-tea-400">Žádné dokončené úkoly</p>
              </>
            ) : (
              <>
                <p className="text-3xl mb-2">🎉</p>
                <p className="font-semibold text-matcha-700">Všechny úkoly dokončeny!</p>
                <p className="text-sm text-tea-400 mt-1">Výborná práce!</p>
              </>
            )}
          </div>
        ) : (
          filtered
            .sort((a, b) => {
              const pOrder = { high: 0, medium: 1, low: 2 };
              const sOrder = { in_progress: 0, pending: 1, done: 2 };
              return sOrder[a.status] - sOrder[b.status] || pOrder[a.priority] - pOrder[b.priority];
            })
            .map(task => {
              const p = priorityColors[task.priority];
              const s = statusColors[task.status];
              const overdue = task.status !== 'done' && isOverdue(task.dueDate);
              return (
                <div key={task.id} className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${p?.bg || ''} ${task.status === 'done' ? 'opacity-60' : ''}`}>
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      {/* Checkbox-style button */}
                      <button
                        onClick={() => handleStatus(task.id, task.status === 'done' ? 'pending' : 'done')}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                          task.status === 'done'
                            ? 'bg-matcha-500 border-matcha-500 text-white'
                            : 'border-tea-300 hover:border-matcha-400'
                        }`}
                      >
                        {task.status === 'done' && <span className="text-xs">✓</span>}
                      </button>

                      <div className="flex-1">
                        <div className="flex items-start gap-2 flex-wrap">
                          <p className={`font-bold text-tea-800 ${task.status === 'done' ? 'line-through' : ''}`}>
                            {task.title}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s?.badge} flex-shrink-0`}>
                            {s?.label}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p?.badge} flex-shrink-0`}>
                            {p?.dot} {p?.label}
                          </span>
                        </div>
                        {task.description && (
                          <p className="text-sm text-tea-600 mt-1.5 leading-relaxed">{task.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span className={`${overdue ? 'text-red-500 font-semibold' : 'text-tea-400'}`}>
                            📅 Splatnost: {new Date(task.dueDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })}
                            {overdue && ' ⚠️ Po termínu!'}
                          </span>
                        </div>
                      </div>

                      {task.status !== 'done' && (
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {task.status === 'pending' && (
                            <button
                              onClick={() => handleStatus(task.id, 'in_progress')}
                              className="text-xs px-2 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                            >
                              ▶ Zahájit
                            </button>
                          )}
                          {task.status === 'in_progress' && (
                            <button
                              onClick={() => handleStatus(task.id, 'done')}
                              className="text-xs px-2 py-1.5 bg-matcha-100 text-matcha-700 rounded-lg hover:bg-matcha-200 transition-colors font-medium"
                            >
                              ✓ Dokončit
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* Info note */}
      <div className="bg-tea-50 rounded-xl p-3 border border-tea-200">
        <p className="text-xs text-tea-500">
          💡 Máte-li otázky k úkolům, napište do chatu nebo přímo vedení.
          Nové úkoly jsou přidávány zaměstnavatelem.
        </p>
      </div>
    </div>
  );
}
