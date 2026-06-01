import { useState } from 'react';
import { shiftRequests as initialRequests, shifts, employees } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

const statusBadge = {
  pending:  { cls: 'bg-warning/20 text-warning border-warning/30', label: 'Čeká na schválení' },
  approved: { cls: 'bg-accent/20 text-accent border-accent/30', label: 'Schváleno' },
  rejected: { cls: 'bg-danger/20 text-danger border-danger/30', label: 'Zamítnuto' },
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
    setRequests(prev => [...prev, {
      id,
      employeeId: user.id,
      ...newRequest,
      type: requestType,
      status: 'pending',
      createdAt: fmt(today),
    }]);
    setShowNewRequest(false);
    setNewRequest({ type: 'day_off', requestedDate: fmt(addDays(today, 2)), requestedType: 'morning', fromShiftId: '', reason: '' });
  };

  const getShiftInfo = (shiftId) => {
    const s = shifts.find(sh => sh.id === parseInt(shiftId));
    if (!s) return null;
    return `${new Date(s.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })} · ${s.start}–${s.end}`;
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Žádosti o směny</h1>
          <p className="text-text-secondary text-sm">Požádejte o volno, výměnu nebo novou směnu</p>
        </div>
        <button
          onClick={() => setShowNewRequest(true)}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-accent-blue hover:bg-accent-blue/90 text-white font-semibold rounded-xl transition-all shadow-lg text-sm"
        >
          <span>+</span>
          <span className="hidden sm:inline">Nová žádost</span>
        </button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Čeká', count: requests.filter(r => r.status === 'pending').length, icon: '⏳', accent: 'text-warning' },
          { label: 'Schváleno', count: requests.filter(r => r.status === 'approved').length, icon: '✅', accent: 'text-accent' },
          { label: 'Zamítnuto', count: requests.filter(r => r.status === 'rejected').length, icon: '❌', accent: 'text-danger' },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-2xl border border-border p-3 md:p-4 text-center">
            <p className="text-2xl">{s.icon}</p>
            <p className={`text-2xl font-bold mt-1 ${s.accent}`}>{s.count}</p>
            <p className="text-xs text-text-secondary mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Requests list */}
      <div className="space-y-3">
        <h3 className="font-bold text-white text-sm">Vaše žádosti</h3>
        {requests.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-text-secondary">Žádné podané žádosti</p>
            <button onClick={() => setShowNewRequest(true)} className="mt-3 text-accent-blue text-sm hover:underline">
              Podat novou žádost →
            </button>
          </div>
        ) : (
          requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(req => {
            const badge = statusBadge[req.status];
            return (
              <div key={req.id} className={`bg-card rounded-2xl border-2 p-4 md:p-5 ${
                req.status === 'pending' ? 'border-warning/40' :
                req.status === 'approved' ? 'border-accent/40' : 'border-danger/40'
              }`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium border ${badge?.cls}`}>
                        {badge?.label}
                      </span>
                      <span className="text-xs px-2 py-1 bg-elevated text-text-secondary rounded-full border border-border">
                        {req.type === 'swap' ? '🔄 Výměna' : req.type === 'day_off' ? '🏠 Volno' : '📋 Nová směna'}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">{req.reason}</p>
                    {req.requestedDate && (
                      <p className="text-xs text-text-secondary/60 mt-2">
                        📅 {new Date(req.requestedDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {req.requestedType && ` · ${req.requestedType === 'morning' ? '🌅 Ranní' : '🌆 Odpolední'}`}
                      </p>
                    )}
                    {req.fromShiftId && (
                      <p className="text-xs text-text-secondary/60 mt-1">
                        🔄 Výměna: {getShiftInfo(req.fromShiftId)}
                      </p>
                    )}
                    <p className="text-xs text-text-secondary/40 mt-1">
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
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-bold text-white text-lg">Nová žádost</h3>
              <button onClick={() => setShowNewRequest(false)} className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-white bg-elevated rounded-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Typ žádosti</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['day_off', '🏠', 'Volno'],
                    ['request', '📋', 'Nová směna'],
                    ['swap', '🔄', 'Výměna'],
                  ].map(([val, icon, label]) => (
                    <label key={val} className={`flex flex-col items-center gap-1 p-3 rounded-2xl border cursor-pointer transition-all ${
                      requestType === val ? 'border-accent-blue bg-accent-blue/10 text-accent-blue' : 'border-border bg-elevated text-text-secondary hover:border-border/60'
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
                      <span className="text-xs font-semibold">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">
                  {requestType === 'day_off' ? 'Datum volna' : 'Požadované datum'}
                </label>
                <input
                  type="date"
                  value={newRequest.requestedDate}
                  onChange={e => setNewRequest(s => ({ ...s, requestedDate: e.target.value }))}
                  min={fmt(addDays(today, 1))}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent-blue text-white text-sm"
                />
              </div>

              {requestType === 'request' && (
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Typ směny</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[['morning', '🌅 Ranní (6:00–14:00)'], ['afternoon', '🌆 Odpolední (14:00–22:00)']].map(([val, label]) => (
                      <label key={val} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                        newRequest.requestedType === val ? 'border-accent-blue bg-accent-blue/10' : 'border-border bg-elevated'
                      }`}>
                        <input
                          type="radio"
                          name="shiftType"
                          value={val}
                          checked={newRequest.requestedType === val}
                          onChange={() => setNewRequest(s => ({ ...s, requestedType: val }))}
                          className="sr-only"
                        />
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${newRequest.requestedType === val ? 'border-accent-blue' : 'border-border'}`}>
                          {newRequest.requestedType === val && <div className="w-2 h-2 rounded-full bg-accent-blue" />}
                        </div>
                        <span className="text-xs text-text-secondary">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {requestType === 'swap' && (
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Vaše směna k výměně</label>
                  <select
                    value={newRequest.fromShiftId}
                    onChange={e => setNewRequest(s => ({ ...s, fromShiftId: e.target.value }))}
                    className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent-blue text-white text-sm"
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

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Důvod žádosti</label>
                <textarea
                  value={newRequest.reason}
                  onChange={e => setNewRequest(s => ({ ...s, reason: e.target.value }))}
                  placeholder={
                    requestType === 'day_off' ? 'Důvod žádosti o volno...' :
                    requestType === 'swap' ? 'Proč potřebujete výměnu?' :
                    'Proč chcete tuto směnu?'
                  }
                  rows={3}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent-blue text-white placeholder:text-text-secondary/50 resize-none text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowNewRequest(false)} className="flex-1 py-3 border border-border text-text-secondary rounded-2xl hover:bg-elevated font-semibold text-sm transition-colors">Zrušit</button>
              <button
                onClick={handleSubmit}
                disabled={!newRequest.reason}
                className="flex-1 py-3 bg-accent-blue hover:bg-accent-blue/90 disabled:bg-accent-blue/30 text-white rounded-2xl font-bold shadow-lg text-sm transition-colors"
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
