import { useState } from 'react';
import { shiftRequests as initialRequests, shifts, employees } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

const statusBadge = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: '⏳ Čeká na schválení' },
  approved: { bg: 'bg-matcha-100', text: 'text-matcha-700', label: '✅ Schváleno' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: '❌ Zamítnuto' },
};

export default function ShiftRequests({ user }) {
  const [requests, setRequests] = useState(
    initialRequests.filter(r => r.employeeId === user.id)
  );
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [requestType, setRequestType] = useState('day_off');
  const [newRequest, setNewRequest] = useState({
    type: 'day_off',
    requestedDate: fmt(addDays(today, 2)),
    requestedType: 'morning',
    fromShiftId: '',
    reason: '',
  });

  const myShifts = shifts.filter(s => s.employeeId === user.id && s.date >= fmt(today));

  const handleSubmit = () => {
    if (!newRequest.reason) return;
    const id = Date.now();
    const req = {
      id,
      employeeId: user.id,
      ...newRequest,
      type: requestType,
      status: 'pending',
      createdAt: fmt(today),
    };
    setRequests(prev => [...prev, req]);
    setShowNewRequest(false);
    setNewRequest({ type: 'day_off', requestedDate: fmt(addDays(today, 2)), requestedType: 'morning', fromShiftId: '', reason: '' });
  };

  const getShiftInfo = (shiftId) => {
    const s = shifts.find(sh => sh.id === parseInt(shiftId));
    if (!s) return null;
    return `${new Date(s.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })} · ${s.start}–${s.end}`;
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tea-800">📨 Žádosti o směny</h1>
          <p className="text-tea-500 text-sm">Požádejte o volno, výměnu nebo novou směnu</p>
        </div>
        <button
          onClick={() => setShowNewRequest(true)}
          className="flex items-center gap-2 px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white font-semibold rounded-xl transition-all shadow-md"
        >
          ➕ Nová žádost
        </button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Čeká na schválení', count: requests.filter(r => r.status === 'pending').length, icon: '⏳', color: 'amber' },
          { label: 'Schváleno', count: requests.filter(r => r.status === 'approved').length, icon: '✅', color: 'matcha' },
          { label: 'Zamítnuto', count: requests.filter(r => r.status === 'rejected').length, icon: '❌', color: 'red' },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-2xl border border-tea-100 p-4 text-center shadow-sm`}>
            <p className="text-2xl">{s.icon}</p>
            <p className="text-2xl font-bold text-tea-800 mt-1">{s.count}</p>
            <p className="text-xs text-tea-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Requests list */}
      <div className="space-y-3">
        <h3 className="font-bold text-tea-700">Vaše žádosti</h3>
        {requests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-tea-100 p-8 text-center">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-tea-400">Žádné podané žádosti</p>
            <button onClick={() => setShowNewRequest(true)} className="mt-3 text-matcha-600 text-sm hover:underline">
              Podat novou žádost →
            </button>
          </div>
        ) : (
          requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(req => {
            const badge = statusBadge[req.status];
            return (
              <div key={req.id} className={`bg-white rounded-2xl border-2 p-5 ${
                req.status === 'pending' ? 'border-amber-200' :
                req.status === 'approved' ? 'border-matcha-200' : 'border-red-200'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${badge?.bg} ${badge?.text}`}>
                        {badge?.label}
                      </span>
                      <span className="text-xs px-2 py-1 bg-tea-100 text-tea-600 rounded-full">
                        {req.type === 'swap' ? '🔄 Výměna směny' : req.type === 'day_off' ? '🏠 Volno' : '📋 Žádost o směnu'}
                      </span>
                    </div>
                    <p className="text-sm text-tea-700 leading-relaxed">{req.reason}</p>
                    {req.requestedDate && (
                      <p className="text-xs text-tea-400 mt-2">
                        📅 {new Date(req.requestedDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {req.requestedType && ` · ${req.requestedType === 'morning' ? '🌅 Ranní' : '🌆 Odpolední'}`}
                      </p>
                    )}
                    {req.fromShiftId && (
                      <p className="text-xs text-tea-400 mt-1">
                        🔄 Výměna směny: {getShiftInfo(req.fromShiftId)}
                      </p>
                    )}
                    <p className="text-xs text-tea-400 mt-1">
                      Odesláno: {new Date(req.createdAt).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New request modal */}
      {showNewRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-tea-100">
              <h3 className="font-bold text-tea-800 text-lg">📨 Nová žádost</h3>
              <button onClick={() => setShowNewRequest(false)} className="text-tea-400 hover:text-tea-700 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Request type */}
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-2">Typ žádosti</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['day_off', '🏠', 'Volno'],
                    ['request', '📋', 'Nová směna'],
                    ['swap', '🔄', 'Výměna'],
                  ].map(([val, icon, label]) => (
                    <label key={val} className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      requestType === val ? 'border-matcha-500 bg-matcha-50' : 'border-tea-200 hover:border-tea-300'
                    }`}>
                      <input
                        type="radio"
                        name="reqType"
                        value={val}
                        checked={requestType === val}
                        onChange={() => setRequestType(val)}
                        className="sr-only"
                      />
                      <span className="text-xl">{icon}</span>
                      <span className="text-xs font-semibold text-tea-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">
                  {requestType === 'day_off' ? 'Datum volna' : 'Požadované datum'}
                </label>
                <input
                  type="date"
                  value={newRequest.requestedDate}
                  onChange={e => setNewRequest(s => ({ ...s, requestedDate: e.target.value }))}
                  min={fmt(addDays(today, 1))}
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500"
                />
              </div>

              {/* Shift type for request */}
              {requestType === 'request' && (
                <div>
                  <label className="block text-sm font-medium text-tea-700 mb-2">Typ směny</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[['morning', '🌅 Ranní (6:00–14:00)'], ['afternoon', '🌆 Odpolední (14:00–22:00)']].map(([val, label]) => (
                      <label key={val} className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer ${
                        newRequest.requestedType === val ? 'border-matcha-500 bg-matcha-50' : 'border-tea-200'
                      }`}>
                        <input
                          type="radio"
                          name="shiftType"
                          value={val}
                          checked={newRequest.requestedType === val}
                          onChange={() => setNewRequest(s => ({ ...s, requestedType: val }))}
                          className="accent-matcha-600"
                        />
                        <span className="text-xs">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Swap: select which shift */}
              {requestType === 'swap' && (
                <div>
                  <label className="block text-sm font-medium text-tea-700 mb-1">Vaše směna k výměně</label>
                  <select
                    value={newRequest.fromShiftId}
                    onChange={e => setNewRequest(s => ({ ...s, fromShiftId: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm"
                  >
                    <option value="">Vyberte směnu...</option>
                    {myShifts.map(s => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })} · {s.type === 'morning' ? 'Ranní' : 'Odpolední'} ({s.start}–{s.end})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Důvod žádosti</label>
                <textarea
                  value={newRequest.reason}
                  onChange={e => setNewRequest(s => ({ ...s, reason: e.target.value }))}
                  placeholder={
                    requestType === 'day_off' ? 'Důvod žádosti o volno (návštěva lékaře, rodinné důvody...)' :
                    requestType === 'swap' ? 'Proč potřebujete výměnu?' :
                    'Proč chcete tuto směnu?'
                  }
                  rows={3}
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 resize-none text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowNewRequest(false)} className="flex-1 py-2 border-2 border-tea-200 text-tea-600 rounded-xl hover:bg-tea-50 font-semibold">Zrušit</button>
              <button
                onClick={handleSubmit}
                disabled={!newRequest.reason}
                className="flex-1 py-2 bg-matcha-600 hover:bg-matcha-700 disabled:bg-matcha-300 text-white rounded-xl font-semibold shadow-md"
              >
                Odeslat žádost
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
