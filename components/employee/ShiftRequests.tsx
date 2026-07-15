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
    if (status === 'approved') return <span className="rounded-full px-3 py-1 text-xs font-medium bg-[#C8F542]/15 text-[#5B7A08]">✅ Schváleno</span>;
    if (status === 'rejected') return <span className="rounded-full px-3 py-1 text-xs font-medium bg-red-500/15 text-red-600">❌ Zamítnuto</span>;
    return <span className="rounded-full px-3 py-1 text-xs font-medium bg-orange-500/15 text-orange-600">⏳ Čeká na schválení</span>;
  };

  const typeLabel = (type: string) => REQUEST_TYPES.find(t => t.value === type)?.label ?? type;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A]">Moje žádosti</h3>
        <button onClick={() => setShowForm(!showForm)} className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all duration-300">
          + Nová žádost
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4">
          <h4 className="font-bold tracking-tight text-[#16181A]">Nová žádost</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Typ žádosti</label>
              <select value={form.requestType} onChange={e => setForm(f => ({ ...f, requestType: e.target.value }))}
                className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none">
                {REQUEST_TYPES.map(t => <option key={t.value} value={t.value} className="bg-[#0A0A0C] text-[#16181A]">{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Datum *</label>
              <input required type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
                className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Důvod / poznámka</label>
            <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={3}
              placeholder="Napište důvod vaší žádosti..."
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none resize-none" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all duration-300 disabled:opacity-60">
              {submitting ? '⏳ Odesílám...' : '📨 Odeslat žádost'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-full glass border border-black/10 hover:bg-black/[0.06] text-[#16181A] text-sm font-medium px-5 py-2.5 transition-all duration-300">
              Zrušit
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : requests.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-black/45">Žádné žádosti. Vytvořte svoji první žádost!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="glass-card p-6 hover:bg-black/[0.05] transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-[#16181A]">{typeLabel(r.requestType)}</h4>
                {statusBadge(r.status)}
              </div>
              <p className="text-sm text-black/60">📅 {r.date}</p>
              {r.note && <p className="text-sm text-black/60 mt-2 bg-black/[0.04] rounded-2xl p-3">{r.note}</p>}
              <p className="text-xs text-black/45 mt-2">
                Podáno: {new Date(r.createdAt).toLocaleDateString('cs-CZ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
