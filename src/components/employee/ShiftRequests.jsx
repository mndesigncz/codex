import { useState } from 'react';
import { shiftRequests, shifts } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const todayStr = fmt(today);

const typeOptions = [
  { value: 'swap',    label: '🔄 Výměna směn',     desc: 'Chcete vyměnit svou směnu s jinou' },
  { value: 'day_off', label: '🏖 Volný den',        desc: 'Požádat o volno nebo nemocenskou' },
  { value: 'request', label: '📋 Žádost o směnu',   desc: 'Chcete odepracovat extra směnu' },
];

const statusConfig = {
  pending:  { label: '⏳ Čeká na schválení', bg: 'bg-amber-50  border-amber-200  text-amber-800' },
  approved: { label: '✅ Schváleno',          bg: 'bg-matcha-50 border-matcha-200 text-matcha-800' },
  rejected: { label: '❌ Zamítnuto',          bg: 'bg-red-50    border-red-200    text-red-800' },
};

export default function ShiftRequests({ user }) {
  const [myRequests, setMyRequests] = useState(
    shiftRequests.filter(r => r.employeeId === user?.id)
  );
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'day_off',
    requestedDate: '',
    requestedType: 'morning',
    reason: '',
  });

  const myUpcomingShifts = shifts.filter(
    s => s.employeeId === user?.id && s.date >= todayStr
  );

  const submit = (e) => {
    e.preventDefault();
    const req = {
      id: Date.now(),
      employeeId: user?.id,
      type: form.type,
      requestedDate: form.requestedDate,
      requestedType: form.requestedType,
      reason: form.reason,
      status: 'pending',
      createdAt: todayStr,
    };
    setMyRequests(prev => [...prev, req]);
    setShowForm(false);
    setForm({ type: 'day_off', requestedDate: '', requestedType: 'morning', reason: '' });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* New request button */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-tea-500">{myRequests.length} celkem žádostí</p>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-matcha-600 text-white text-sm font-semibold rounded-xl hover:bg-matcha-700 transition-colors"
        >
          + Nová žádost
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={submit} className="bg-white rounded-2xl border-2 border-matcha-200 p-6 space-y-5 shadow-sm">
          <h3 className="font-bold text-tea-800 text-lg">📋 Nová žádost</h3>

          {/* Type selection */}
          <div>
            <label className="block text-sm font-medium text-tea-700 mb-2">Typ žádosti</label>
            <div className="grid grid-cols-1 gap-2">
              {typeOptions.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    form.type === opt.value
                      ? 'border-matcha-400 bg-matcha-50'
                      : 'border-tea-200 hover:border-tea-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={opt.value}
                    checked={form.type === opt.value}
                    onChange={() => setForm(f => ({ ...f, type: opt.value }))}
                    className="mt-0.5 accent-matcha-600"
                  />
                  <div>
                    <p className="font-semibold text-tea-800 text-sm">{opt.label}</p>
                    <p className="text-xs text-tea-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-tea-700 mb-1">Datum</label>
            <input
              type="date"
              required
              min={todayStr}
              value={form.requestedDate}
              onChange={e => setForm(f => ({ ...f, requestedDate: e.target.value }))}
              className="w-full px-3 py-2.5 border-2 border-tea-200 rounded-xl text-sm focus:outline-none focus:border-matcha-400 bg-white"
            />
          </div>

          {/* Shift type (only for 'request') */}
          {form.type === 'request' && (
            <div>
              <label className="block text-sm font-medium text-tea-700 mb-1">Typ směny</label>
              <div className="flex gap-3">
                {[
                  { value: 'morning',   label: '🌅 Ranní (06:00–14:00)' },
                  { value: 'afternoon', label: '🌙 Odpolední (14:00–22:00)' },
                ].map(opt => (
                  <label key={opt.value} className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer ${
                    form.requestedType === opt.value ? 'border-matcha-400 bg-matcha-50' : 'border-tea-200'
                  }`}>
                    <input
                      type="radio"
                      value={opt.value}
                      checked={form.requestedType === opt.value}
                      onChange={() => setForm(f => ({ ...f, requestedType: opt.value }))}
                      className="accent-matcha-600"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Swap info */}
          {form.type === 'swap' && myUpcomingShifts.length > 0 && (
            <div className="bg-tea-50 rounded-xl p-3 text-sm text-tea-600">
              <p className="font-medium text-tea-700 mb-2">Vaše nadcházející směny:</p>
              {myUpcomingShifts.slice(0, 3).map(s => (
                <div key={s.id} className="text-xs text-tea-500">
                  📅 {new Date(s.date).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'short' })} — {s.start}–{s.end}
                </div>
              ))}
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-tea-700 mb-1">Důvod / Poznámka</label>
            <textarea
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              rows={3}
              required
              placeholder="Popište důvod vaší žádosti..."
              className="w-full px-3 py-2.5 border-2 border-tea-200 rounded-xl text-sm focus:outline-none focus:border-matcha-400 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button type="submit" className="flex-1 py-2.5 bg-matcha-600 text-white rounded-xl font-semibold text-sm hover:bg-matcha-700">
              Odeslat žádost
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 text-tea-500 rounded-xl text-sm hover:bg-tea-100">
              Zrušit
            </button>
          </div>
        </form>
      )}

      {/* My requests list */}
      <div className="space-y-4">
        <h3 className="font-bold text-tea-800">Moje žádosti</h3>
        {myRequests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-tea-100 p-12 text-center">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-tea-400">Zatím žádné žádosti</p>
          </div>
        ) : (
          [...myRequests].reverse().map(req => {
            const st = statusConfig[req.status] || statusConfig.pending;
            const typeLabel = typeOptions.find(t => t.value === req.type)?.label || req.type;
            return (
              <div key={req.id} className="bg-white rounded-2xl border border-tea-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-bold text-tea-800 text-sm">{typeLabel}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${st.bg}`}>
                        {st.label}
                      </span>
                    </div>
                    {req.requestedDate && (
                      <p className="text-sm text-tea-600 mb-1">
                        📅 {new Date(req.requestedDate).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        {req.requestedType && ` — ${req.requestedType === 'morning' ? '🌅 Ranní' : '🌙 Odpolední'}`}
                      </p>
                    )}
                    {req.reason && (
                      <div className="bg-tea-50 rounded-xl px-3 py-2 mt-2">
                        <p className="text-xs text-tea-600 italic">"{req.reason}"</p>
                      </div>
                    )}
                    <p className="text-xs text-tea-400 mt-2">Podáno: {req.createdAt}</p>
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
