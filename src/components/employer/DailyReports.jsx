import { useState } from 'react';
import { dailyReports, employees } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;

export default function DailyReports() {
  const [reports, setReports] = useState(dailyReports);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customers: '',
    revenue: '',
    topSeller: '',
    topSellerCount: '',
    notes: '',
    weather: 'Slunečno',
  });

  const submitReport = (e) => {
    e.preventDefault();
    const report = {
      id: Date.now(),
      date: fmt(today),
      openedBy: 0,
      closedBy: 0,
      customers: parseInt(form.customers) || 0,
      revenue: parseInt(form.revenue) || 0,
      topSeller: form.topSeller,
      topSellerCount: parseInt(form.topSellerCount) || 0,
      notes: form.notes,
      weather: form.weather,
      staffOnDuty: [],
    };
    setReports(prev => [report, ...prev]);
    setShowForm(false);
    setForm({ customers: '', revenue: '', topSeller: '', topSellerCount: '', notes: '', weather: 'Slunečno' });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-tea-500">{reports.length} zpráv celkem</div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-matcha-600 text-white text-sm font-semibold rounded-xl hover:bg-matcha-700 transition-colors"
        >
          + Přidat dnešní zprávu
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitReport} className="bg-white rounded-2xl border-2 border-matcha-200 p-6 space-y-4 shadow-sm">
          <h3 className="font-bold text-tea-800 text-lg">📝 Denní zpráva — {today.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-tea-700 mb-1">Počet zákazníků</label>
              <input
                type="number" min="0"
                value={form.customers}
                onChange={e => setForm(f => ({ ...f, customers: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl text-sm focus:outline-none focus:border-matcha-400"
                placeholder="Např. 45"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-tea-700 mb-1">Tržby (Kč)</label>
              <input
                type="number" min="0"
                value={form.revenue}
                onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl text-sm focus:outline-none focus:border-matcha-400"
                placeholder="Např. 3500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-tea-700 mb-1">Nejprodávanější</label>
              <input
                type="text"
                value={form.topSeller}
                onChange={e => setForm(f => ({ ...f, topSeller: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl text-sm focus:outline-none focus:border-matcha-400"
                placeholder="Např. Matcha Latte"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-tea-700 mb-1">Počet prodaných ks</label>
              <input
                type="number" min="0"
                value={form.topSellerCount}
                onChange={e => setForm(f => ({ ...f, topSellerCount: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl text-sm focus:outline-none focus:border-matcha-400"
                placeholder="Např. 12"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-tea-700 mb-1">Počasí</label>
            <select
              value={form.weather}
              onChange={e => setForm(f => ({ ...f, weather: e.target.value }))}
              className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl text-sm focus:outline-none focus:border-matcha-400 bg-white"
            >
              {['Slunečno', 'Zataženo', 'Déšť', 'Sníh', 'Mlha', 'Větrno', 'Chladno'].map(w => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-tea-700 mb-1">Poznámky ze dne</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl text-sm focus:outline-none focus:border-matcha-400 resize-none"
              placeholder="Co se dnes dělo, co bylo neobvyklé, feedback zákazníků..."
            />
          </div>
          <div className="flex gap-3">
            <button type="submit" className="px-6 py-2 bg-matcha-600 text-white rounded-xl font-semibold text-sm hover:bg-matcha-700 transition-colors">
              Uložit zprávu
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 text-tea-500 rounded-xl text-sm hover:bg-tea-100">
              Zrušit
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {reports.map(report => {
          const opener = employees.find(e => e.id === report.openedBy);
          const closer = employees.find(e => e.id === report.closedBy);
          const avgRev = report.customers > 0 ? (report.revenue / report.customers).toFixed(0) : 0;

          return (
            <div key={report.id} className="bg-white rounded-2xl border border-tea-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-tea-100 bg-tea-50">
                <div>
                  <p className="font-bold text-tea-800">
                    {new Date(report.date).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  <div className="flex gap-3 text-xs text-tea-400 mt-0.5">
                    <span>🌤 {report.weather}</span>
                    {opener && <span>🌅 Otevřel: {opener.name.split(' ')[0]}</span>}
                    {closer && <span>🌙 Zavřel: {closer.name.split(' ')[0]}</span>}
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-tea-800">{report.customers}</p>
                    <p className="text-xs text-tea-400">Zákazníků</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-matcha-700">{report.revenue.toLocaleString('cs-CZ')}</p>
                    <p className="text-xs text-tea-400">Tržby (Kč)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-tea-800">{avgRev}</p>
                    <p className="text-xs text-tea-400">Kč / zákazník</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-tea-800 leading-tight">{report.topSeller}</p>
                    <p className="text-xs text-tea-400">Nejprodávanější ({report.topSellerCount}x)</p>
                  </div>
                </div>
                {report.notes && (
                  <div className="bg-tea-50 rounded-xl p-3 text-sm text-tea-600 italic">
                    "{report.notes}"
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
