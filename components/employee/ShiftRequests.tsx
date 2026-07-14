'use client';

import { useState, useEffect } from 'react';

interface ShiftRequest {
  id: number;
  employeeId: number;
  requestType: string;
  date: string;
  note?: string;
  status: string;
  createdAt: string;
}

interface Props {
  user: { id?: string; name?: string | null };
}

const REQUEST_TYPES = [
  { value: 'day_off', label: 'Žádost o volno' },
  { value: 'swap', label: 'Výměna směny' },
  { value: 'extra', label: 'Extra směna' },
];

export default function ShiftRequests({ user }: Props) {
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ requestType: 'day_off', date: '', note: '' });
  const [submitting, setSubmitting] = useState(false);

  const userId = parseInt(user.id ?? '0');

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/shifts/requests?employeeId=${userId}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setRequests(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/shifts/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, employeeId: userId }),
      });
      if (res.ok) {
        const req = await res.json();
        setRequests(prev => [req, ...prev]);
        setShowForm(false);
        setForm({ requestType: 'day_off', date: '', note: '' });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'approved') return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✅ Schváleno</span>;
    if (status === 'rejected') return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">❌ Zamítnuto</span>;
    return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⏳ Čeká na schválení</span>;
  };

  const typeLabel = (type: string) => REQUEST_TYPES.find(t => t.value === type)?.label ?? type;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-tea-800 text-lg">Moje žádosti</h3>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white text-sm rounded-xl font-medium transition-all">
          + Nová žádost
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border-2 border-matcha-200 p-5 space-y-4">
          <h4 className="font-bold text-tea-800">Nová žádost</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-tea-700 mb-1">Typ žádosti</label>
              <select value={form.requestType} onChange={e => setForm(f => ({ ...f, requestType: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800 bg-white">
                {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-tea-700 mb-1">Datum *</label>
              <input required type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-tea-700 mb-1">Důvod / poznámka</label>
            <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={3}
              placeholder="Napište důvod vaší žádosti..."
              className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800 resize-none placeholder:text-tea-300" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white text-sm rounded-xl font-medium disabled:opacity-60">
              {submitting ? '⏳ Odesílám...' : '📨 Odeslat žádost'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-tea-100 hover:bg-tea-200 text-tea-700 text-sm rounded-xl font-medium">
              Zrušit
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="text-4xl animate-spin">⏳</div></div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-tea-100 p-8 text-center">
          <p className="text-tea-400">Žádné žádosti. Vytvořte svoji první žádost!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border-2 border-tea-100 p-5">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-tea-800">{typeLabel(r.requestType)}</h4>
                {statusBadge(r.status)}
              </div>
              <p className="text-sm text-tea-500">📅 {r.date}</p>
              {r.note && <p className="text-sm text-tea-600 mt-2 bg-tea-50 rounded-lg p-2">{r.note}</p>}
              <p className="text-xs text-tea-400 mt-2">
                Podáno: {new Date(r.createdAt).toLocaleDateString('cs-CZ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
