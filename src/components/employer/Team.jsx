import { useState } from 'react';
import { employees as initialEmployees, tasks as initialTasks, shifts, favoriteShifts, dailyReports } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const todayStr = fmt(today);

const priorityColors = {
  high:   { dot: '🔴', badge: 'bg-danger/20 text-danger' },
  medium: { dot: '🟡', badge: 'bg-warning/20 text-warning' },
  low:    { dot: '🟢', badge: 'bg-accent/20 text-accent' },
};

const statusColors = {
  pending:     { badge: 'bg-elevated text-text-secondary', label: 'Čeká' },
  in_progress: { badge: 'bg-accent-blue/20 text-accent-blue', label: 'Probíhá' },
  done:        { badge: 'bg-accent/20 text-accent', label: 'Hotovo' },
};

export default function Team() {
  const [employees, setEmployees] = useState(initialEmployees);
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTab, setActiveTab] = useState('team');
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // New task modal
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignedTo: '1',
    priority: 'medium',
    dueDate: fmt(new Date(today.getTime() + 86400000 * 2)),
  });

  // Add employee modal
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    role: 'Barista',
    email: '',
    phone: '',
    shiftPreference: 'flexible',
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

  const handleAddEmployee = () => {
    if (!newEmployee.name || !newEmployee.email) return;
    const avatarOptions = ['👩', '👨', '🧑', '👩‍🦱', '👨‍🦱'];
    const id = Math.max(...employees.map(e => e.id)) + 1;
    const added = {
      id,
      name: newEmployee.name,
      role: newEmployee.role,
      email: newEmployee.email,
      phone: newEmployee.phone,
      avatar: avatarOptions[id % avatarOptions.length],
      hoursThisMonth: 0,
      joinDate: todayStr,
    };
    setEmployees(prev => [...prev, added]);
    setShowAddEmployee(false);
    setNewEmployee({ name: '', role: 'Barista', email: '', phone: '', shiftPreference: 'flexible' });
  };

  const getEmployeeStats = (empId) => {
    const empShifts = shifts.filter(s => s.employeeId === empId);
    const completedShifts = empShifts.filter(s => s.status === 'completed');
    const upcomingShifts = empShifts.filter(s => s.date >= todayStr && s.status !== 'completed');
    const empTasks = tasks.filter(t => t.assignedTo === empId);
    const pref = favoriteShifts.find(f => f.employeeId === empId);
    return { empShifts, completedShifts, upcomingShifts, empTasks, pref };
  };

  const tabs = [
    ['team', '👥 Zaměstnanci'],
    ['tasks', '✅ Úkoly'],
    ['reports', '📝 Denní zprávy'],
  ];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Tým</h1>
          <p className="text-text-secondary text-sm">{employees.length} zaměstnanců</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddEmployee(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-accent-blue hover:bg-accent-blue/90 text-white font-semibold rounded-xl transition-all shadow-lg text-sm"
          >
            <span>+</span>
            <span className="hidden sm:inline">Přidat zaměstnance</span>
            <span className="sm:hidden">Přidat</span>
          </button>
          <button
            onClick={() => setShowNewTask(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-accent hover:bg-accent/90 text-black font-semibold rounded-xl transition-all shadow-lg text-sm"
          >
            <span>+</span>
            <span className="hidden sm:inline">Nový úkol</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-elevated p-1 rounded-xl w-fit">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
              activeTab === id ? 'bg-card text-white shadow' : 'text-text-secondary hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Team tab */}
      {activeTab === 'team' && (
        <div className="grid md:grid-cols-2 gap-3 md:gap-4">
          {employees.map(emp => {
            const stats = getEmployeeStats(emp.id);
            const isSelected = selectedEmployee === emp.id;
            return (
              <div
                key={emp.id}
                className={`bg-card rounded-2xl border-2 overflow-hidden cursor-pointer transition-all ${
                  isSelected ? 'border-accent' : 'border-border hover:border-border/80'
                }`}
                onClick={() => setSelectedEmployee(isSelected ? null : emp.id)}
              >
                <div className="p-4 md:p-5">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-elevated flex items-center justify-center text-2xl md:text-3xl flex-shrink-0 border border-border">
                      {emp.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-base md:text-lg">{emp.name}</p>
                      <p className="text-text-secondary text-sm">{emp.role}</p>
                      <p className="text-text-secondary/60 text-xs truncate">{emp.email}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent/10 text-accent text-xs rounded-full font-medium border border-accent/20">
                        Aktivní
                      </span>
                      <p className="text-xs text-text-secondary mt-1">
                        od {new Date(emp.joinDate).toLocaleDateString('cs-CZ', { month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
                    <div className="text-center">
                      <p className="text-lg md:text-xl font-bold text-white">{emp.hoursThisMonth}</p>
                      <p className="text-xs text-text-secondary">hod/měsíc</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg md:text-xl font-bold text-white">{stats.upcomingShifts.length}</p>
                      <p className="text-xs text-text-secondary">nadch. směn</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg md:text-xl font-bold text-white">{stats.empTasks.filter(t => t.status !== 'done').length}</p>
                      <p className="text-xs text-text-secondary">aktivní úkoly</p>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary">Telefon:</span>
                        <span className="font-medium text-white">{emp.phone || '—'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary">Preference směn:</span>
                        <span className="font-medium text-white">
                          {stats.pref?.preference === 'morning' ? '🌅 Ranní' :
                           stats.pref?.preference === 'afternoon' ? '🌆 Odpolední' : '🔄 Flexibilní'}
                        </span>
                      </div>
                      {stats.pref?.note && (
                        <p className="text-xs text-text-secondary italic">"{stats.pref.note}"</p>
                      )}
                      <div>
                        <p className="text-sm text-text-secondary mb-2">Nadcházející směny:</p>
                        <div className="space-y-1">
                          {stats.upcomingShifts.slice(0, 3).map(s => (
                            <div key={s.id} className="flex justify-between text-xs bg-elevated px-3 py-2 rounded-xl border border-border">
                              <span className="text-text-secondary">{new Date(s.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', weekday: 'short' })}</span>
                              <span className="font-medium text-white">{s.start}–{s.end}</span>
                            </div>
                          ))}
                          {stats.upcomingShifts.length === 0 && <p className="text-xs text-text-secondary">Žádné nadcházející směny</p>}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-text-secondary mb-2">Aktuální úkoly:</p>
                        <div className="space-y-1">
                          {stats.empTasks.filter(t => t.status !== 'done').slice(0, 3).map(t => (
                            <div key={t.id} className="flex items-center gap-2 text-xs bg-elevated px-3 py-2 rounded-xl border border-border">
                              <span>{priorityColors[t.priority]?.dot}</span>
                              <span className="truncate text-white">{t.title}</span>
                            </div>
                          ))}
                          {stats.empTasks.filter(t => t.status !== 'done').length === 0 && (
                            <p className="text-xs text-accent">Bez aktivních úkolů</p>
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
              <div key={task.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="p-4 md:p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5 flex-shrink-0">{p?.dot}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <p className={`font-bold text-white ${task.status === 'done' ? 'line-through text-text-secondary' : ''}`}>
                          {task.title}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s?.badge} flex-shrink-0`}>
                          {s?.label}
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-sm text-text-secondary mt-1">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-text-secondary">
                        <span>👤 {emp?.name}</span>
                        <span>📅 {new Date(task.dueDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {task.status !== 'done' && (
                        <>
                          {task.status === 'pending' && (
                            <button
                              onClick={() => handleTaskStatus(task.id, 'in_progress')}
                              className="text-xs px-2 py-1 bg-accent-blue/20 text-accent-blue rounded-lg hover:bg-accent-blue/30 transition-colors"
                            >
                              Zahájit
                            </button>
                          )}
                          <button
                            onClick={() => handleTaskStatus(task.id, 'done')}
                            className="text-xs px-2 py-1 bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors"
                          >
                            Hotovo
                          </button>
                        </>
                      )}
                      {task.status === 'done' && (
                        <button
                          onClick={() => handleTaskStatus(task.id, 'pending')}
                          className="text-xs px-2 py-1 bg-elevated text-text-secondary rounded-lg hover:bg-border transition-colors"
                        >
                          Znovu
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
              <div key={report.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
                  <div>
                    <h3 className="font-bold text-white text-sm md:text-base">
                      {new Date(report.date).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </h3>
                    <p className="text-xs text-text-secondary">{report.weather}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg md:text-xl font-bold text-accent">{report.revenue.toLocaleString('cs-CZ')} Kč</p>
                    <p className="text-xs text-text-secondary">{report.customers} zákazníků</p>
                  </div>
                </div>
                <div className="p-4 md:p-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {[
                      ['Nejprodávanější', `${report.topSeller} (${report.topSellerCount}×)`],
                      ['Průměr/zákazník', `${(report.revenue / report.customers).toFixed(0)} Kč`],
                      ['Otevíral', opener?.name.split(' ')[0] || '—'],
                      ['Zavíral', closer?.name.split(' ')[0] || '—'],
                    ].map(([label, val]) => (
                      <div key={label} className="bg-elevated rounded-xl p-3 border border-border">
                        <p className="text-xs text-text-secondary">{label}</p>
                        <p className="text-sm font-semibold text-white mt-0.5">{val}</p>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 bg-elevated rounded-xl border border-border">
                    <p className="text-xs text-text-secondary mb-1">📝 Poznámky ze směny</p>
                    <p className="text-sm text-text-secondary">{report.notes}</p>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex justify-center">
            <button className="px-4 py-2 border border-border text-text-secondary rounded-xl hover:bg-elevated text-sm transition-colors">
              Načíst starší zprávy
            </button>
          </div>
        </div>
      )}

      {/* ── New task modal ── */}
      {showNewTask && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-bold text-white text-lg">Nový úkol</h3>
              <button onClick={() => setShowNewTask(false)} className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-white bg-elevated rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Název úkolu</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={e => setNewTask(s => ({ ...s, title: e.target.value }))}
                  placeholder="Co je potřeba udělat?"
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Popis</label>
                <textarea
                  value={newTask.description}
                  onChange={e => setNewTask(s => ({ ...s, description: e.target.value }))}
                  placeholder="Podrobnější popis (volitelné)..."
                  rows={3}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 resize-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Přiřadit komu</label>
                <select
                  value={newTask.assignedTo}
                  onChange={e => setNewTask(s => ({ ...s, assignedTo: e.target.value }))}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white text-sm"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Priorita</label>
                  <select
                    value={newTask.priority}
                    onChange={e => setNewTask(s => ({ ...s, priority: e.target.value }))}
                    className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white text-sm"
                  >
                    <option value="high">🔴 Vysoká</option>
                    <option value="medium">🟡 Střední</option>
                    <option value="low">🟢 Nízká</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Splatnost</label>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={e => setNewTask(s => ({ ...s, dueDate: e.target.value }))}
                    className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowNewTask(false)} className="flex-1 py-3 border border-border text-text-secondary rounded-2xl hover:bg-elevated font-semibold text-sm transition-colors">Zrušit</button>
              <button onClick={handleAddTask} className="flex-1 py-3 bg-accent hover:bg-accent/90 text-black rounded-2xl font-bold shadow-lg text-sm transition-colors">Přidat úkol</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Employee modal ── */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-bold text-white text-lg">Přidat zaměstnance</h3>
              <button onClick={() => setShowAddEmployee(false)} className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-white bg-elevated rounded-lg transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Jméno *</label>
                <input
                  type="text"
                  value={newEmployee.name}
                  onChange={e => setNewEmployee(s => ({ ...s, name: e.target.value }))}
                  placeholder="Celé jméno"
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent-blue text-white placeholder:text-text-secondary/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Role</label>
                <select
                  value={newEmployee.role}
                  onChange={e => setNewEmployee(s => ({ ...s, role: e.target.value }))}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent-blue text-white text-sm"
                >
                  <option>Barista</option>
                  <option>Baristka</option>
                  <option>Pomocný personál</option>
                  <option>Pokladní</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Email *</label>
                <input
                  type="email"
                  value={newEmployee.email}
                  onChange={e => setNewEmployee(s => ({ ...s, email: e.target.value }))}
                  placeholder="jmeno@cajovna.cz"
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent-blue text-white placeholder:text-text-secondary/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Telefon</label>
                <input
                  type="tel"
                  value={newEmployee.phone}
                  onChange={e => setNewEmployee(s => ({ ...s, phone: e.target.value }))}
                  placeholder="+420 000 000 000"
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent-blue text-white placeholder:text-text-secondary/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Typ směn</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['morning', '🌅', 'Ranní'],
                    ['afternoon', '🌆', 'Odpolední'],
                    ['flexible', '🔄', 'Flexibilní'],
                  ].map(([val, icon, label]) => (
                    <label key={val} className={`flex flex-col items-center gap-1 p-3 rounded-2xl border cursor-pointer transition-all ${
                      newEmployee.shiftPreference === val
                        ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                        : 'border-border bg-elevated text-text-secondary hover:border-border/60'
                    }`}>
                      <input
                        type="radio"
                        name="shiftPref"
                        value={val}
                        checked={newEmployee.shiftPreference === val}
                        onChange={() => setNewEmployee(s => ({ ...s, shiftPreference: val }))}
                        className="sr-only"
                      />
                      <span className="text-xl">{icon}</span>
                      <span className="text-xs font-semibold">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowAddEmployee(false)} className="flex-1 py-3 border border-border text-text-secondary rounded-2xl hover:bg-elevated font-semibold text-sm transition-colors">Zrušit</button>
              <button
                onClick={handleAddEmployee}
                disabled={!newEmployee.name || !newEmployee.email}
                className="flex-1 py-3 bg-accent-blue hover:bg-accent-blue/90 disabled:bg-accent-blue/30 text-white rounded-2xl font-bold shadow-lg text-sm transition-colors"
              >
                Přidat zaměstnance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
