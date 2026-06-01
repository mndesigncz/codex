import { useState } from 'react';
import { tasks as allTasks, employees } from '../../data/mockData.js';

const priorityColors = {
  high:   { dot: '🔴', badge: 'bg-danger/20 text-danger border-danger/30', label: 'Vysoká' },
  medium: { dot: '🟡', badge: 'bg-warning/20 text-warning border-warning/30', label: 'Střední' },
  low:    { dot: '🟢', badge: 'bg-accent/20 text-accent border-accent/30', label: 'Nízká' },
};

const statusColors = {
  pending:     { label: 'Čeká',    badge: 'bg-elevated text-text-secondary border-border' },
  in_progress: { label: 'Probíhá', badge: 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' },
  done:        { label: 'Hotovo',  badge: 'bg-accent/20 text-accent border-accent/30' },
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
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white">Moje úkoly</h1>
        <p className="text-text-secondary text-sm">Úkoly přidělené vám vedením</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="bg-card rounded-2xl border border-border p-3 md:p-4 text-center">
          <p className="text-2xl font-bold text-white">{activeTasks}</p>
          <p className="text-xs text-text-secondary mt-1">Aktivní úkoly</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-3 md:p-4 text-center">
          <p className="text-2xl font-bold text-danger">{highPriority}</p>
          <p className="text-xs text-text-secondary mt-1">Vysoká priorita</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-3 md:p-4 text-center">
          <p className="text-2xl font-bold text-accent">{doneTasks}</p>
          <p className="text-xs text-text-secondary mt-1">Dokončeno</p>
        </div>
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-white">Celkový pokrok</span>
            <span className="text-sm font-bold text-accent">{Math.round((doneTasks / tasks.length) * 100)}%</span>
          </div>
          <div className="w-full bg-elevated rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${(doneTasks / tasks.length) * 100}%` }}
            />
          </div>
          <p className="text-xs text-text-secondary mt-1.5">{doneTasks} z {tasks.length} úkolů dokončeno</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-elevated p-1 rounded-xl w-fit">
        {[
          ['active', `Aktivní (${activeTasks})`],
          ['done', `Hotovo (${doneTasks})`],
          ['all', 'Vše']
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
              filter === id ? 'bg-card text-white shadow' : 'text-text-secondary hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center">
            {filter === 'done' ? (
              <>
                <p className="text-3xl mb-2">📭</p>
                <p className="text-text-secondary">Žádné dokončené úkoly</p>
              </>
            ) : (
              <>
                <p className="text-3xl mb-2">🎉</p>
                <p className="font-semibold text-accent">Všechny úkoly dokončeny!</p>
                <p className="text-sm text-text-secondary mt-1">Výborná práce!</p>
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
                <div key={task.id} className={`bg-card rounded-2xl border overflow-hidden transition-all ${
                  task.status === 'done' ? 'border-border opacity-60' : overdue ? 'border-danger/40' : 'border-border'
                }`}>
                  <div className="p-4 md:p-5">
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => handleStatus(task.id, task.status === 'done' ? 'pending' : 'done')}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                          task.status === 'done'
                            ? 'bg-accent border-accent text-black'
                            : 'border-border hover:border-accent'
                        }`}
                      >
                        {task.status === 'done' && <span className="text-xs font-bold">✓</span>}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                          <p className={`font-bold text-white ${task.status === 'done' ? 'line-through text-text-secondary' : ''}`}>
                            {task.title}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${s?.badge} flex-shrink-0`}>
                            {s?.label}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${p?.badge} flex-shrink-0`}>
                            {p?.dot} {p?.label}
                          </span>
                        </div>
                        {task.description && (
                          <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{task.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span className={`${overdue ? 'text-danger font-semibold' : 'text-text-secondary/60'}`}>
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
                              className="text-xs px-2 py-1.5 bg-accent-blue/20 text-accent-blue rounded-lg hover:bg-accent-blue/30 transition-colors font-medium"
                            >
                              Zahájit
                            </button>
                          )}
                          {task.status === 'in_progress' && (
                            <button
                              onClick={() => handleStatus(task.id, 'done')}
                              className="text-xs px-2 py-1.5 bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors font-medium"
                            >
                              Dokončit
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

      <div className="bg-elevated rounded-xl p-3 border border-border">
        <p className="text-xs text-text-secondary">
          Máte-li otázky k úkolům, napište do chatu nebo přímo vedení.
          Nové úkoly jsou přidávány zaměstnavatelem.
        </p>
      </div>
    </div>
  );
}
