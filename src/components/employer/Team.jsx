import { useState } from 'react';
import { employees, tasks as initialTasks, shifts, favoriteShifts, dailyReports } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const todayStr = fmt(today);

const priorityColors = {
  high: { bg: 'bg-red-100', text: 'text-red-700', label: 'Vysoká', dot: '🔴' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Střední', dot: '🟡' },
  low: { bg: 'bg-green-100', text: 'text-green-700', label: 'Nízká', dot: '🟢' },
};

const statusColors = {
  pending: { bg: 'bg-tea-100', text: 'text-tea-600', label: 'Čeká' },
  in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Probíhá' },
  done: { bg: 'bg-matcha-100', text: 'text-matcha-700', label: 'Hotovo' },
};

export default function Team() {
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTab, setActiveTab] = useState('team');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignedTo: '1',
    priority: 'medium',
    dueDate: fmt(new Date(today.getTime() + 86400000 * 2)),
  });

  const handleAddTask = () => {
    if (!newTask.title) return;
    const id = Math.max(...tasks.map(t => t.id)) + 1;
    setTasks(prev => [...prev, {
      ...newTask,
      id,
      assignedTo: parseInt(newTask.assignedTo),
      assignedBy: 0,
      status: 'pending',
      createdAt: todayStr,
    }]);
    setShowNewTask(false);
    setNewTask({ title: '', description: '', assignedTo: '1', priority: 'medium', dueDate: fmt(new Date(today.getTime() + 86400000 * 2)) });
  };

  const handleTaskStatus = (taskId, status) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
  };

  const getEmployeeStats = (empId) => {
    const empShifts = shifts.filter(s => s.employeeId === empId);
    const completedShifts = empShifts.filter(s => s.status === 'completed');
    const upcomingShifts = empShifts.filter(s => s.date >= todayStr && s.status !== 'completed');
    const empTasks = tasks.filter(t => t.assignedTo === empId);
    const doneTasks = empTasks.filter(t => t.status === 'done');
    const pref = favoriteShifts.find(f => f.employeeId === empId);
    return { empShifts, completedShifts, upcomingShifts, empTasks, doneTasks, pref };
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tea-800">👥 Tým</h1>
          <p className="text-tea-500 text-sm">{employees.length} zaměstnanců</p>
        </div>
        <button
          onClick={() => setShowNewTask(true)}
          className="flex items-center gap-2 px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white font-semibold rounded-xl transition-all shadow-md"
        >
          ➕ Nový úkol
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-tea-100 p-1 rounded-xl w-fit">
        {[['team', '👥 Zaměstnanci'], ['tasks', '✅ Úkoly'], ['reports', '📝 Denní zprávy']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === id ? 'bg-white shadow text-matcha-700' : 'text-tea-500 hover:text-tea-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Team tab */}
      {activeTab === 'team' && (
        <div className="grid md:grid-cols-2 gap-4">
          {employees.map(emp => {
            const stats = getEmployeeStats(emp.id);
            const isSelected = selectedEmployee === emp.id;
            return (
              <div
                key={emp.id}
                className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden cursor-pointer transition-all ${
                  isSelected ? 'border-matcha-400' : 'border-tea-100 hover:border-tea-300'
                }`}
                onClick={() => setSelectedEmployee(isSelected ? null : emp.id)}
              >
                <div className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-matcha-100 flex items-center justify-center text-3xl flex-shrink-0">
                      {emp.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-tea-800 text-lg">{emp.name}</p>
                      <p className="text-tea-500 text-sm">{emp.role}</p>
                      <p className="text-tea-400 text-xs">{emp.email}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-matcha-100 text-matcha-700 text-xs rounded-full font-medium">
                        ✅ Aktivní
                      </span>
                      <p className="text-xs text-tea-400 mt-1">od {new Date(emp.joinDate).toLocaleDateString('cs-CZ', { month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-tea-100">
                    <div className="text-center">
                      <p className="text-xl font-bold text-tea-800">{emp.hoursThisMonth}</p>
                      <p className="text-xs text-tea-400">hod/měsíc</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-tea-800">{stats.upcomingShifts.length}</p>
                      <p className="text-xs text-tea-400">nadch. směn</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-tea-800">{stats.empTasks.filter(t => t.status !== 'done').length}</p>
                      <p className="text-xs text-tea-400">aktivní úkoly</p>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="mt-4 pt-4 border-t border-tea-100 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-tea-500">Telefon:</span>
                        <span className="font-medium text-tea-800">{emp.phone}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-tea-500">Preference směn:</span>
                        <span className="font-medium text-tea-800">
                          {stats.pref?.preference === 'morning' ? '🌅 Ranní' :
                           stats.pref?.preference === 'afternoon' ? '🌆 Odpolední' : '🔄 Flexibilní'}
                        </span>
                      </div>
                      {stats.pref?.note && (
                        <p className="text-xs text-tea-500 italic">"{stats.pref.note}"</p>
                      )}
                      <div>
                        <p className="text-sm text-tea-500 mb-2">Nadcházející směny:</p>
                        <div className="space-y-1">
                          {stats.upcomingShifts.slice(0, 3).map(s => (
                            <div key={s.id} className="flex justify-between text-xs bg-tea-50 px-3 py-2 rounded-lg">
                              <span>{new Date(s.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', weekday: 'short' })}</span>
                              <span className="font-medium">{s.start}–{s.end}</span>
                            </div>
                          ))}
                          {stats.upcomingShifts.length === 0 && <p className="text-xs text-tea-400">Žádné nadcházející směny</p>}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-tea-500 mb-2">Aktuální úkoly:</p>
                        <div className="space-y-1">
                          {stats.empTasks.filter(t => t.status !== 'done').slice(0, 3).map(t => (
                            <div key={t.id} className="flex items-center gap-2 text-xs bg-tea-50 px-3 py-2 rounded-lg">
                              <span>{priorityColors[t.priority]?.dot}</span>
                              <span className="truncate">{t.title}</span>
                            </div>
                          ))}
                          {stats.empTasks.filter(t => t.status !== 'done').length === 0 && (
                            <p className="text-xs text-matcha-600">✅ Bez aktivních úkolů</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <div className="space-y-3">
          {tasks.map(task => {
            const emp = employees.find(e => e.id === task.assignedTo);
            const p = priorityColors[task.priority];
            const s = statusColors[task.status];
            return (
              <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{p?.dot}</span>
                    <div className="flex-1">
                      <div className="flex items-start gap-2 flex-wrap">
                        <p className={`font-bold text-tea-800 ${task.status === 'done' ? 'line-through text-tea-400' : ''}`}>
                          {task.title}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s?.bg} ${s?.text} flex-shrink-0`}>
                          {s?.label}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p?.bg} ${p?.text} flex-shrink-0`}>
                          {p?.label}
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-sm text-tea-500 mt-1">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-tea-400">
                        <span>👤 {emp?.name}</span>
                        <span>📅 Splatnost: {new Date(task.dueDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {task.status !== 'done' && (
                        <>
                          {task.status === 'pending' && (
                            <button
                              onClick={() => handleTaskStatus(task.id, 'in_progress')}
                              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                            >
                              ▶ Zahájit
                            </button>
                          )}
                          <button
                            onClick={() => handleTaskStatus(task.id, 'done')}
                            className="text-xs px-2 py-1 bg-matcha-100 text-matcha-700 rounded-lg hover:bg-matcha-200 transition-colors"
                          >
                            ✓ Hotovo
                          </button>
                        </>
                      )}
                      {task.status === 'done' && (
                        <button
                          onClick={() => handleTaskStatus(task.id, 'pending')}
                          className="text-xs px-2 py-1 bg-tea-100 text-tea-600 rounded-lg hover:bg-tea-200 transition-colors"
                        >
                          ↩ Znovu
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Daily reports tab */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {dailyReports.map(report => {
            const opener = employees.find(e => e.id === report.openedBy);
            const closer = employees.find(e => e.id === report.closedBy);
            return (
              <div key={report.id} className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-tea-100">
                  <div>
                    <h3 className="font-bold text-tea-800">
                      {new Date(report.date).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </h3>
                    <p className="text-xs text-tea-400">{report.weather}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-matcha-700">{report.revenue.toLocaleString('cs-CZ')} Kč</p>
                    <p className="text-xs text-tea-400">{report.customers} zákazníků</p>
                  </div>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-tea-400">Nejprodávanější</p>
                      <p className="text-sm font-semibold text-tea-800">{report.topSeller}</p>
                      <p className="text-xs text-tea-500">({report.topSellerCount}×)</p>
                    </div>
                    <div>
                      <p className="text-xs text-tea-400">Průměr/zákazník</p>
                      <p className="text-sm font-semibold text-tea-800">{(report.revenue / report.customers).toFixed(0)} Kč</p>
                    </div>
                    <div>
                      <p className="text-xs text-tea-400">Otevíral</p>
                      <p className="text-sm font-semibold text-tea-800">{opener?.name.split(' ')[0]}</p>
                    </div>
                    <div>
                      <p className="text-xs text-tea-400">Zavíral</p>
                      <p className="text-sm font-semibold text-tea-800">{closer?.name.split(' ')[0]}</p>
                    </div>
                  </div>
                  <div className="p-3 bg-tea-50 rounded-xl">
                    <p className="text-xs text-tea-400 mb-1">Poznámky ze směny:</p>
                    <p className="text-sm text-tea-700">{report.notes}</p>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex justify-center">
            <button className="px-4 py-2 border-2 border-tea-200 text-tea-500 rounded-xl hover:bg-tea-50 text-sm">
              📄 Načíst starší zprávy
            </button>
          </div>
        </div>
      )}

      {/* New task modal */}
      {showNewTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-tea-100">
              <h3 className="font-bold text-tea-800 text-lg">➕ Nový úkol</h3>
              <button onClick={() => setShowNewTask(false)} className="text-tea-400 hover:text-tea-700 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Název úkolu</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={e => setNewTask(s => ({ ...s, title: e.target.value }))}
                  placeholder="Co je potřeba udělat?"
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Popis</label>
                <textarea
                  value={newTask.description}
                  onChange={e => setNewTask(s => ({ ...s, description: e.target.value }))}
                  placeholder="Podrobnější popis (volitelné)..."
                  rows={3}
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Přiřadit komu</label>
                <select
                  value={newTask.assignedTo}
                  onChange={e => setNewTask(s => ({ ...s, assignedTo: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-tea-700 mb-1">Priorita</label>
                  <select
                    value={newTask.priority}
                    onChange={e => setNewTask(s => ({ ...s, priority: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500"
                  >
                    <option value="high">🔴 Vysoká</option>
                    <option value="medium">🟡 Střední</option>
                    <option value="low">🟢 Nízká</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-tea-700 mb-1">Splatnost</label>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={e => setNewTask(s => ({ ...s, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowNewTask(false)} className="flex-1 py-2 border-2 border-tea-200 text-tea-600 rounded-xl hover:bg-tea-50 font-semibold">Zrušit</button>
              <button onClick={handleAddTask} className="flex-1 py-2 bg-matcha-600 hover:bg-matcha-700 text-white rounded-xl font-semibold shadow-md">Přidat úkol</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
