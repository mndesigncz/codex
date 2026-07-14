'use client';

import { useState, useEffect } from 'react';

interface DailyReport {
  id: number;
  date: string;
  revenue: number;
  customers: number;
  notes?: string;
}

const inputClass =
  'w-full rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

export default function DailyReports() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], revenue: '', customers: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/reports')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setReports(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, revenue: parseInt(form.revenue), customers: parseInt(form.customers) }),
      });
      if (res.ok) {
        const report = await res.json();
        setReports(prev => [report, ...prev]);
        setShowForm(false);
        setForm({ date: new Date().toISOString().split('T')[0], revenue: '', customers: '', notes: '' });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const totalRevenue = reports.reduce((s, r) => s + r.revenue, 0);
  const totalCustomers = reports.reduce((s, r) => s + r.customers, 0);
  const avgRevenue = reports.length > 0 ? Math.round(totalRevenue / reports.length) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-6">
          <p className="text-xs uppercase tracking-wider text-white/40">Celkový příjem</p>
          <p className="text-3xl font-bold tracking-tight text-white mt-2">{totalRevenue.toLocaleString('cs-CZ')} Kč</p>
          <div className="h-1 rounded-full bg-white/10 mt-4 overflow-hidden">
            <div className="h-full rounded-full bg-[#C8F542] w-full" />
          </div>
        </div>
        <div className="glass-card p-6">
          <p className="text-xs uppercase tracking-wider text-white/40">Zákazníci celkem</p>
          <p className="text-3xl font-bold tracking-tight text-white mt-2">{totalCustomers}</p>
          <div className="h-1 rounded-full bg-white/10 mt-4 overflow-hidden">
            <div className="h-full rounded-full bg-[#0A84FF] w-full" />
          </div>
        </div>
        <div className="glass-card p-6">
          <p className="text-xs uppercase tracking-wider text-white/40">Průměr/den</p>
          <p className="text-3xl font-bold tracking-tight text-white mt-2">{avgRevenue.toLocaleString('cs-CZ')} Kč</p>
          <div className="h-1 rounded-full bg-white/10 mt-4 overflow-hidden">
            <div className="h-full rounded-full bg-orange-400 w-2/3" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold tracking-tight text-white">Denní zprávy</h3>
        <button onClick={() => setShowForm(!showForm)} className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all">
          + Přidat zprávu
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card border-[#C8F542]/20 p-6 space-y-5">
          <h4 className="font-bold tracking-tight text-white">Nová denní zpráva</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Datum</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Příjem (Kč)</label>
              <input type="number" required value={form.revenue} onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Zákazníků</label>
              <input type="number" required value={form.customers} onChange={e => setForm(f => ({ ...f, customers: e.target.value }))}
                className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Poznámky</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className={`${inputClass} resize-none`} />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all disabled:opacity-50">
              {submitting ? 'Ukládám…' : 'Uložit'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-full glass border border-white/15 hover:bg-white/10 text-white px-5 py-2.5 text-sm font-medium transition-all">
              Zrušit
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-[#C8F542] animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold tracking-tight text-white">
                  {new Date(r.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <div className="flex gap-4">
                  <span className="text-sm font-semibold text-[#C8F542]">{r.revenue.toLocaleString('cs-CZ')} Kč</span>
                  <span className="text-sm text-white/50">👥 {r.customers}</span>
                </div>
              </div>
              {r.notes && <p className="text-sm text-white/50 bg-white/[0.06] border border-white/[0.06] rounded-2xl p-3">{r.notes}</p>}
            </div>
          ))}
          {reports.length === 0 && (
            <div className="glass-card p-8 text-center">
              <p className="text-white/40">Žádné zprávy k zobrazení.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
