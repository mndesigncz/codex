import { useState } from 'react';
import { shifts as initialShifts, employees, shiftRequests as initialRequests } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

function getWeekDays(startDate) {
  return Array.from({ length: 7 }, (_, i) => fmt(addDays(startDate, i)));
}

const shiftTypeLabels = { morning: '🌅 Ranní', afternoon: '🌆 Odpolední' };

const statusStyles = {
  completed: 'bg-elevated text-text-secondary',
  ongoing:   'bg-accent text-black',
  upcoming:  'bg-accent-blue/20 text-accent-blue',
};

export default function ShiftManagement() {
  const [shifts, setShifts] = useState(initialShifts);
  const [requests, setRequests] = useState(initialRequests);
  const [weekStart, setWeekStart] = useState(today);
  const [activeTab, setActiveTab] = useState('calendar');
  const [showModal, setShowModal] = useState(false);
  const [newShift, setNewShift] = useState({
    date: fmt(today),
    employeeId: '1',
    type: 'morning',
    start: '06:00',
    end: '14:00',
    note: '',
  });

  const weekDays = getWeekDays(weekStart);
  const prevWeek = () => setWeekStart(d => addDays(d, -7));
  const nextWeek = () => setWeekStart(d => addDays(d, 7));
  const dayNames = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

  const handleAddShift = () => {
    const id = Math.max(...shifts.map(s => s.id)) + 1;
    setShifts(prev => [...prev, { ...newShift, id, employeeId: parseInt(newShift.employeeId), status: 'upcoming' }]);
    setShowModal(false);
    setNewShift({ date: fmt(today), employeeId: '1', type: 'morning', start: '06:00', end: '14:00', note: '' });
  };

  const handleRequestAction = (reqId, action) => {
    setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: action } : r));
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Správa směn</h1>
          <p className="text-text-secondary text-sm">Plánování a přehled směn</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-accent hover:bg-accent/90 text-black font-semibold rounded-xl transition-all shadow-lg text-sm"
        >
          <span>+</span>
          <span className="hidden sm:inline">Nová směna</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-elevated p-1 rounded-xl w-fit">
        {[
          ['calendar', '📅 Kalendář'],
          ['list', '📋 Seznam'],
          [`requests`, `📨 Žádosti${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}`]
        ].map(([id, label]) => (
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

      {/* Calendar view */}
      {activeTab === 'calendar' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {/* Week navigation */}
          <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
            <button onClick={prevWeek} className="w-8 h-8 flex items-center justify-center hover:bg-elevated rounded-lg transition-colors text-text-secondary hover:text-white">◀</button>
            <span className="font-bold text-white text-sm">
              {new Date(weekDays[0]).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })} –{' '}
              {new Date(weekDays[6]).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <button onClick={nextWeek} className="w-8 h-8 flex items-center justify-center hover:bg-elevated rounded-lg transition-colors text-text-secondary hover:text-white">▶</button>
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 divide-x divide-border">
            {weekDays.map((day, i) => {
              const dayShifts = shifts.filter(s => s.date === day);
              const isToday = day === fmt(today);
              return (
                <div key={day} className={`min-h-28 ${isToday ? 'bg-accent/5' : ''}`}>
                  <div className={`p-2 text-center border-b border-border ${isToday ? 'bg-accent text-black' : ''}`}>
                    <p className={`text-xs font-semibold ${isToday ? 'text-black' : 'text-text-secondary'}`}>{dayNames[i]}</p>
                    <p className={`text-base font-bold ${isToday ? 'text-black' : 'text-white'}`}>
                      {new Date(day).getDate()}
                    </p>
                  </div>
                  <div className="p-1 space-y-1">
                    {dayShifts.map(shift => {
                      const emp = employees.find(e => e.id === shift.employeeId);
                      return (
                        <div
                          key={shift.id}
                          className={`text-xs p-1.5 rounded-lg ${statusStyles[shift.status] || 'bg-elevated text-text-secondary'}`}
                        >
                          <p className="font-semibold truncate">{emp?.name.split(' ')[0]}</p>
                          <p className="opacity-80">{shift.start}–{shift.end}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 px-4 md:px-5 py-3 border-t border-border bg-elevated">
            {[
              ['bg-accent', 'Probíhá'],
              ['bg-accent-blue/50', 'Nadcházející'],
              ['bg-elevated border border-border', 'Dokončeno'],
            ].map(([cls, label]) => (
              <span key={label} className="flex items-center gap-1 text-xs text-text-secondary">
                <span className={`w-3 h-3 rounded ${cls} inline-block`}></span> {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* List view */}
      {activeTab === 'list' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 md:px-5 py-4 border-b border-border">
            <h3 className="font-bold text-white">Všechny směny</h3>
          </div>
          <div className="divide-y divide-border">
            {shifts
              .filter(s => s.date >= fmt(addDays(today, -7)))
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(shift => {
                const emp = employees.find(e => e.id === shift.employeeId);
                return (
                  <div key={shift.id} className="flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 hover:bg-elevated transition-colors">
                    <span className="text-xl">{emp?.avatar || '👤'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{emp?.name}</p>
                      <p className="text-xs text-text-secondary">
                        {new Date(shift.date).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium text-text-secondary">{shiftTypeLabels[shift.type]}</p>
                      <p className="text-xs text-text-secondary/60">{shift.start} – {shift.end}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusStyles[shift.status] || 'bg-elevated text-text-secondary'} border border-border`}>
                      {shift.status === 'completed' ? 'Dokončeno' : shift.status === 'ongoing' ? 'Probíhá' : 'Nadcházející'}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Requests view */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {requests.length === 0 && (
            <div className="bg-card rounded-2xl border border-border p-8 text-center text-text-secondary">
              Žádné žádosti o směny
            </div>
          )}
          {requests.map(req => {
            const emp = employees.find(e => e.id === req.employeeId);
            return (
              <div key={req.id} className={`bg-card rounded-2xl border-2 overflow-hidden ${
                req.status === 'pending' ? 'border-warning/40' : req.status === 'approved' ? 'border-accent/40' : 'border-danger/40'
              }`}>
                <div className="p-4 md:p-5">
                  <div className="flex items-start gap-4">
                    <span className="text-2xl">{emp?.avatar || '👤'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-bold text-white">{emp?.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          req.type === 'swap' ? 'bg-accent-blue/20 text-accent-blue' :
                          req.type === 'day_off' ? 'bg-elevated text-text-secondary border border-border' :
                          'bg-accent/20 text-accent'
                        }`}>
                          {req.type === 'swap' ? '🔄 Výměna' : req.type === 'day_off' ? '🏠 Volno' : '📋 Žádost'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-auto ${
                          req.status === 'pending' ? 'bg-warning/20 text-warning' :
                          req.status === 'approved' ? 'bg-accent/20 text-accent' :
                          'bg-danger/20 text-danger'
                        }`}>
                          {req.status === 'pending' ? '⏳ Čeká' : req.status === 'approved' ? '✅ Schváleno' : '❌ Zamítnuto'}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary mb-2">{req.reason}</p>
                      {req.requestedDate && (
                        <p className="text-xs text-text-secondary/60">
                          Datum: {new Date(req.requestedDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                          {req.requestedType && ` · ${shiftTypeLabels[req.requestedType]}`}
                        </p>
                      )}
                    </div>
                  </div>
                  {req.status === 'pending' && (
                    <div className="flex gap-3 mt-4 pt-4 border-t border-border">
                      <button
                        onClick={() => handleRequestAction(req.id, 'approved')}
                        className="flex-1 py-2 bg-accent hover:bg-accent/90 text-black text-sm font-bold rounded-xl transition-all"
                      >
                        Schválit
                      </button>
                      <button
                        onClick={() => handleRequestAction(req.id, 'rejected')}
                        className="flex-1 py-2 bg-danger/20 hover:bg-danger/30 text-danger text-sm font-bold rounded-xl transition-all"
                      >
                        Zamítnout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add shift modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-bold text-white text-lg">Přidat novou směnu</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-white bg-elevated rounded-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Zaměstnanec</label>
                <select
                  value={newShift.employeeId}
                  onChange={e => setNewShift(s => ({ ...s, employeeId: e.target.value }))}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white text-sm"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Datum</label>
                <input
                  type="date"
                  value={newShift.date}
                  onChange={e => setNewShift(s => ({ ...s, date: e.target.value }))}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Typ směny</label>
                <div className="grid grid-cols-2 gap-2">
                  {[['morning', '🌅 Ranní (6:00–14:00)'], ['afternoon', '🌆 Odpolední (14:00–22:00)']].map(([val, label]) => (
                    <label key={val} className={`flex items-center gap-2 p-3 rounded-2xl border cursor-pointer transition-all ${
                      newShift.type === val ? 'border-accent bg-accent/10 text-white' : 'border-border bg-elevated text-text-secondary'
                    }`}>
                      <input
                        type="radio"
                        name="shiftType"
                        value={val}
                        checked={newShift.type === val}
                        onChange={() => setNewShift(s => ({
                          ...s,
                          type: val,
                          start: val === 'morning' ? '06:00' : '14:00',
                          end: val === 'morning' ? '14:00' : '22:00',
                        }))}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${newShift.type === val ? 'border-accent' : 'border-border'}`}>
                        {newShift.type === val && <div className="w-2 h-2 rounded-full bg-accent" />}
                      </div>
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Poznámka</label>
                <input
                  type="text"
                  value={newShift.note}
                  onChange={e => setNewShift(s => ({ ...s, note: e.target.value }))}
                  placeholder="Volitelná poznámka..."
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 border border-border text-text-secondary rounded-2xl hover:bg-elevated font-semibold text-sm transition-colors">Zrušit</button>
              <button onClick={handleAddShift} className="flex-1 py-3 bg-accent hover:bg-accent/90 text-black rounded-2xl font-bold shadow-lg text-sm transition-colors">Přidat směnu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
