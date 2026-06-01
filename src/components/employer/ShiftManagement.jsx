import { useState } from 'react';
import { shifts as initialShifts, employees, shiftRequests as initialRequests } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

function getWeekDays(startDate) {
  return Array.from({ length: 7 }, (_, i) => fmt(addDays(startDate, i)));
}

const shiftTypeLabels = { morning: '🌅 Ranní', afternoon: '🌆 Odpolední' };
const statusColors = {
  completed: 'bg-tea-200 text-tea-600',
  ongoing: 'bg-matcha-500 text-white',
  upcoming: 'bg-blue-100 text-blue-700',
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tea-800">📅 Správa směn</h1>
          <p className="text-tea-500 text-sm">Plánování a přehled směn</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white font-semibold rounded-xl transition-all shadow-md"
        >
          ➕ Nová směna
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-tea-100 p-1 rounded-xl w-fit">
        {[['calendar', '📅 Kalendář'], ['list', '📋 Seznam'], ['requests', `📨 Žádosti ${pendingRequests.length > 0 ? `(${pendingRequests.length})` : ''}`]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === id ? 'bg-white shadow text-matcha-700' : 'text-tea-500 hover:text-tea-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Calendar view */}
      {activeTab === 'calendar' && (
        <div className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
          {/* Week navigation */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-tea-100">
            <button onClick={prevWeek} className="p-2 hover:bg-tea-100 rounded-lg transition-colors">◀</button>
            <span className="font-bold text-tea-800">
              {new Date(weekDays[0]).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })} –{' '}
              {new Date(weekDays[6]).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <button onClick={nextWeek} className="p-2 hover:bg-tea-100 rounded-lg transition-colors">▶</button>
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 divide-x divide-tea-100">
            {weekDays.map((day, i) => {
              const dayShifts = shifts.filter(s => s.date === day);
              const isToday = day === fmt(today);
              return (
                <div key={day} className={`min-h-32 ${isToday ? 'bg-matcha-50' : ''}`}>
                  <div className={`p-2 text-center border-b border-tea-100 ${isToday ? 'bg-matcha-600 text-white' : ''}`}>
                    <p className="text-xs font-semibold">{dayNames[i]}</p>
                    <p className={`text-lg font-bold ${isToday ? '' : 'text-tea-700'}`}>
                      {new Date(day).getDate()}
                    </p>
                  </div>
                  <div className="p-1 space-y-1">
                    {dayShifts.map(shift => {
                      const emp = employees.find(e => e.id === shift.employeeId);
                      return (
                        <div
                          key={shift.id}
                          className={`text-xs p-1.5 rounded-lg ${statusColors[shift.status] || 'bg-tea-100 text-tea-700'}`}
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
          <div className="flex gap-4 px-5 py-3 border-t border-tea-100 bg-tea-50">
            <span className="flex items-center gap-1 text-xs text-tea-500">
              <span className="w-3 h-3 rounded bg-matcha-500 inline-block"></span> Probíhá
            </span>
            <span className="flex items-center gap-1 text-xs text-tea-500">
              <span className="w-3 h-3 rounded bg-blue-200 inline-block"></span> Nadcházející
            </span>
            <span className="flex items-center gap-1 text-xs text-tea-500">
              <span className="w-3 h-3 rounded bg-tea-300 inline-block"></span> Dokončeno
            </span>
          </div>
        </div>
      )}

      {/* List view */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-tea-100">
            <h3 className="font-bold text-tea-800">Všechny směny</h3>
          </div>
          <div className="divide-y divide-tea-50">
            {shifts
              .filter(s => s.date >= fmt(addDays(today, -7)))
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(shift => {
                const emp = employees.find(e => e.id === shift.employeeId);
                return (
                  <div key={shift.id} className="flex items-center gap-4 px-5 py-3 hover:bg-tea-50 transition-colors">
                    <span className="text-xl">{emp?.avatar || '👤'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-tea-800">{emp?.name}</p>
                      <p className="text-xs text-tea-500">
                        {new Date(shift.date).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-tea-700">{shiftTypeLabels[shift.type]}</p>
                      <p className="text-xs text-tea-400">{shift.start} – {shift.end}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[shift.status] || 'bg-tea-100 text-tea-500'}`}>
                      {shift.status === 'completed' ? 'Dokončeno' : shift.status === 'ongoing' ? 'Probíhá' : 'Nadcházející'}
                    </span>
                    {shift.note && <span title={shift.note} className="text-tea-400 text-sm">💬</span>}
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
            <div className="bg-white rounded-2xl p-8 text-center text-tea-400">
              Žádné žádosti o směny
            </div>
          )}
          {requests.map(req => {
            const emp = employees.find(e => e.id === req.employeeId);
            return (
              <div key={req.id} className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden ${
                req.status === 'pending' ? 'border-amber-200' : req.status === 'approved' ? 'border-matcha-200' : 'border-red-200'
              }`}>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <span className="text-2xl">{emp?.avatar || '👤'}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-tea-800">{emp?.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          req.type === 'swap' ? 'bg-blue-100 text-blue-700' :
                          req.type === 'day_off' ? 'bg-purple-100 text-purple-700' :
                          'bg-matcha-100 text-matcha-700'
                        }`}>
                          {req.type === 'swap' ? '🔄 Výměna směny' : req.type === 'day_off' ? '🏠 Volno' : '📋 Žádost o směnu'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-auto ${
                          req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                          req.status === 'approved' ? 'bg-matcha-100 text-matcha-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {req.status === 'pending' ? '⏳ Čeká' : req.status === 'approved' ? '✅ Schváleno' : '❌ Zamítnuto'}
                        </span>
                      </div>
                      <p className="text-sm text-tea-600 mb-2">{req.reason}</p>
                      {req.requestedDate && (
                        <p className="text-xs text-tea-400">
                          Požadované datum: {new Date(req.requestedDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                          {req.requestedType && ` · ${shiftTypeLabels[req.requestedType]}`}
                        </p>
                      )}
                      <p className="text-xs text-tea-400 mt-1">
                        Odesláno: {new Date(req.createdAt).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                  </div>
                  {req.status === 'pending' && (
                    <div className="flex gap-3 mt-4 pt-4 border-t border-tea-100">
                      <button
                        onClick={() => handleRequestAction(req.id, 'approved')}
                        className="flex-1 py-2 bg-matcha-600 hover:bg-matcha-700 text-white text-sm font-semibold rounded-xl transition-all"
                      >
                        ✅ Schválit
                      </button>
                      <button
                        onClick={() => handleRequestAction(req.id, 'rejected')}
                        className="flex-1 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-semibold rounded-xl transition-all"
                      >
                        ❌ Zamítnout
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-tea-100">
              <h3 className="font-bold text-tea-800 text-lg">➕ Přidat novou směnu</h3>
              <button onClick={() => setShowModal(false)} className="text-tea-400 hover:text-tea-700 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Zaměstnanec</label>
                <select
                  value={newShift.employeeId}
                  onChange={e => setNewShift(s => ({ ...s, employeeId: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Datum</label>
                <input
                  type="date"
                  value={newShift.date}
                  onChange={e => setNewShift(s => ({ ...s, date: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Typ směny</label>
                <div className="grid grid-cols-2 gap-2">
                  {[['morning', '🌅 Ranní (6:00–14:00)'], ['afternoon', '🌆 Odpolední (14:00–22:00)']].map(([val, label]) => (
                    <label key={val} className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer ${
                      newShift.type === val ? 'border-matcha-500 bg-matcha-50' : 'border-tea-200'
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
                        className="accent-matcha-600"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Poznámka</label>
                <input
                  type="text"
                  value={newShift.note}
                  onChange={e => setNewShift(s => ({ ...s, note: e.target.value }))}
                  placeholder="Volitelná poznámka..."
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 border-2 border-tea-200 text-tea-600 rounded-xl hover:bg-tea-50 transition-all font-semibold"
              >
                Zrušit
              </button>
              <button
                onClick={handleAddShift}
                className="flex-1 py-2 bg-matcha-600 hover:bg-matcha-700 text-white rounded-xl transition-all font-semibold shadow-md"
              >
                Přidat směnu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
