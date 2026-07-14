'use client';

import { useState, useEffect } from 'react';

interface DailyReport {
  id: number;
  date: string;
  revenue: number;
  customers: number;
  notes?: string;
}

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
    <div className="p-6 space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-matcha-50 border-2 border-matcha-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-matcha-600 font-medium">Celkový příjem</p>
          <p className="text-2xl font-bold text-matcha-700 mt-1">{totalRevenue.toLocaleString('cs-CZ')} Kč</p>
        </div>
        <div className="bg-tea-50 border-2 border-tea-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-tea-600 font-medium">Zákazníci celkem</p>
          <p className="text-2xl font-bold text-tea-700 mt-1">{totalCustomers}</p>
        </div>
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-amber-600 font-medium">Průměr/den</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{avgRevenue.toLocaleString('cs-CZ')} Kč</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold text-tea-800">Denní zprávy</h3>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white text-sm rounded-xl font-medium">
          + Přidat zprávu
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border-2 border-matcha-200 p-5 space-y-4">
          <h4 className="font-bold text-tea-800">Nová denní zpráva</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-tea-700 mb-1">Datum</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800" />
            </div>
            <div>
              <label className="block text-xs font-medium text-tea-700 mb-1">Příjem (Kč)</label>
              <input type="number" required value={form.revenue} onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800" />
            </div>
            <div>
              <label className="block text-xs font-medium text-tea-700 mb-1">Zákazníků</label>
              <input type="number" required value={form.customers} onChange={e => setForm(f => ({ ...f, customers: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-tea-700 mb-1">Poznámky</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800 resize-none" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white text-sm rounded-xl font-medium disabled:opacity-60">
              {submitting ? '⏳' : '✅ Uložit'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-tea-100 hover:bg-tea-200 text-tea-700 text-sm rounded-xl font-medium">
              Zrušit
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-4xl animate-spin">⏳</div>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border-2 border-tea-100 p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-tea-800">
                  {new Date(r.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <div className="flex gap-4">
                  <span className="text-sm font-semibold text-matcha-700">{r.revenue.toLocaleString('cs-CZ')} Kč</span>
                  <span className="text-sm text-tea-500">👥 {r.customers}</span>
                </div>
              </div>
              {r.notes && <p className="text-sm text-tea-500 bg-tea-50 rounded-lg p-2">{r.notes}</p>}
            </div>
          ))}
          {reports.length === 0 && (
            <div className="bg-white rounded-2xl border-2 border-tea-100 p-8 text-center">
              <p className="text-tea-400">Žádné zprávy k zobrazení.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
