import { useState } from 'react';
import { dailyReports as initialReports, employees, statsData } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

export default function DailyReports() {
  const [reports, setReports] = useState(initialReports);
  const [showNewReport, setShowNewReport] = useState(false);
  const [newReport, setNewReport] = useState({
    date: fmt(today),
    customers: '',
    revenue: '',
    topSeller: '',
    topSellerCount: '',
    notes: '',
    weather: 'Slunečno',
    openedBy: '1',
    closedBy: '2',
  });

  const handleAddReport = () => {
    if (!newReport.date || !newReport.customers) return;
    const id = Math.max(...reports.map(r => r.id)) + 1;
    setReports(prev => [{
      ...newReport,
      id,
      customers: parseInt(newReport.customers) || 0,
      revenue: parseInt(newReport.revenue) || 0,
      topSellerCount: parseInt(newReport.topSellerCount) || 0,
      openedBy: parseInt(newReport.openedBy),
      closedBy: parseInt(newReport.closedBy),
      staffOnDuty: [parseInt(newReport.openedBy), parseInt(newReport.closedBy)],
    }, ...prev]);
    setShowNewReport(false);
    setNewReport({ date: fmt(today), customers: '', revenue: '', topSeller: '', topSellerCount: '', notes: '', weather: 'Slunečno', openedBy: '1', closedBy: '2' });
  };

  const totalRevenue = reports.reduce((s, r) => s + r.revenue, 0);
  const totalCustomers = reports.reduce((s, r) => s + r.customers, 0);
  const avgPerCustomer = totalCustomers > 0 ? (totalRevenue / totalCustomers).toFixed(0) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tea-800">📈 Denní zprávy</h1>
          <p className="text-tea-500 text-sm">Přehled denní aktivity čajovny</p>
        </div>
        <button
          onClick={() => setShowNewReport(true)}
          className="flex items-center gap-2 px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white font-semibold rounded-xl transition-all shadow-md"
        >
          ➕ Nová zpráva
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Celkové tržby', value: `${totalRevenue.toLocaleString('cs-CZ')} Kč`, icon: '💰', color: 'matcha' },
          { label: 'Celkem zákazníků', value: totalCustomers, icon: '👥', color: 'tea' },
          { label: 'Průměr/zákazník', value: `${avgPerCustomer} Kč`, icon: '📊', color: 'amber' },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-2xl border border-tea-100 p-4 shadow-sm`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-tea-400">{s.label}</p>
                <p className="text-xl font-bold text-tea-800 mt-0.5">{s.value}</p>
              </div>
              <span className="text-2xl">{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue chart (mini) */}
      <div className="bg-white rounded-2xl border border-tea-100 p-5 shadow-sm">
        <h3 className="font-bold text-tea-800 mb-4">📊 Tržby posledních dní</h3>
        <div className="flex items-end gap-3 h-24">
          {[...reports].reverse().map((r, i) => {
            const maxRev = Math.max(...reports.map(rr => rr.revenue));
            const pct = maxRev > 0 ? (r.revenue / maxRev) * 100 : 0;
            return (
              <div key={r.id} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-matcha-700 font-semibold">{r.revenue.toLocaleString('cs-CZ')}</span>
                <div
                  className="w-full bg-matcha-500 rounded-t-lg transition-all"
                  style={{ height: `${Math.max(pct, 5)}%` }}
                />
                <span className="text-xs text-tea-400">
                  {new Date(r.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reports list */}
      <div className="space-y-4">
        {reports.map(report => {
          const opener = employees.find(e => e.id === report.openedBy);
          const closer = employees.find(e => e.id === report.closedBy);
          const weekday = new Date(report.date).toLocaleDateString('cs-CZ', { weekday: 'long' });
          return (
            <div key={report.id} className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-tea-50 to-matcha-50 border-b border-tea-100">
                <div>
                  <h3 className="font-bold text-tea-800 capitalize">
                    {weekday}, {new Date(report.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-tea-400">{report.weather}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-matcha-700">{report.revenue.toLocaleString('cs-CZ')} Kč</p>
                  <p className="text-sm text-tea-500">{report.customers} zákazníků</p>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="bg-tea-50 rounded-xl p-3">
                    <p className="text-xs text-tea-400">Průměr/zákazník</p>
                    <p className="text-lg font-bold text-tea-800">{(report.revenue / report.customers).toFixed(0)} Kč</p>
                  </div>
                  <div className="bg-tea-50 rounded-xl p-3">
                    <p className="text-xs text-tea-400">Nejprodávanější</p>
                    <p className="text-sm font-bold text-tea-800">{report.topSeller}</p>
                    <p className="text-xs text-tea-500">{report.topSellerCount}× prodáno</p>
                  </div>
                  <div className="bg-tea-50 rounded-xl p-3">
                    <p className="text-xs text-tea-400">Otevíral</p>
                    <p className="text-sm font-bold text-tea-800">{opener?.name.split(' ')[0] || '—'}</p>
                  </div>
                  <div className="bg-tea-50 rounded-xl p-3">
                    <p className="text-xs text-tea-400">Zavíral</p>
                    <p className="text-sm font-bold text-tea-800">{closer?.name.split(' ')[0] || '—'}</p>
                  </div>
                </div>
                <div className="p-3 bg-matcha-50 rounded-xl border border-matcha-100">
                  <p className="text-xs text-matcha-600 font-semibold mb-1">📝 Poznámky ze směny</p>
                  <p className="text-sm text-tea-700">{report.notes}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* New report modal */}
      {showNewReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-tea-100 sticky top-0 bg-white">
              <h3 className="font-bold text-tea-800 text-lg">📝 Nová denní zpráva</h3>
              <button onClick={() => setShowNewReport(false)} className="text-tea-400 hover:text-tea-700 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Datum</label>
                <input type="date" value={newReport.date} onChange={e => setNewReport(s => ({ ...s, date: e.target.value }))} className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-tea-700 mb-1">Počet zákazníků</label>
                  <input type="number" value={newReport.customers} onChange={e => setNewReport(s => ({ ...s, customers: e.target.value }))} placeholder="0" className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-tea-700 mb-1">Tržby (Kč)</label>
                  <input type="number" value={newReport.revenue} onChange={e => setNewReport(s => ({ ...s, revenue: e.target.value }))} placeholder="0" className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-tea-700 mb-1">Nejprodávanější</label>
                  <input type="text" value={newReport.topSeller} onChange={e => setNewReport(s => ({ ...s, topSeller: e.target.value }))} placeholder="Název nápoje" className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-tea-700 mb-1">Počet prodaných</label>
                  <input type="number" value={newReport.topSellerCount} onChange={e => setNewReport(s => ({ ...s, topSellerCount: e.target.value }))} placeholder="0" className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Počasí</label>
                <select value={newReport.weather} onChange={e => setNewReport(s => ({ ...s, weather: e.target.value }))} className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm">
                  <option>Slunečno</option>
                  <option>Zataženo</option>
                  <option>Zataženo, chladno</option>
                  <option>Déšť</option>
                  <option>Sněžení</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-tea-700 mb-1">Otevíral</label>
                  <select value={newReport.openedBy} onChange={e => setNewReport(s => ({ ...s, openedBy: e.target.value }))} className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm">
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name.split(' ')[0]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-tea-700 mb-1">Zavíral</label>
                  <select value={newReport.closedBy} onChange={e => setNewReport(s => ({ ...s, closedBy: e.target.value }))} className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm">
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name.split(' ')[0]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Poznámky</label>
                <textarea value={newReport.notes} onChange={e => setNewReport(s => ({ ...s, notes: e.target.value }))} placeholder="Co se dělo, jak byl den rušný, problémy..." rows={3} className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 resize-none text-sm" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowNewReport(false)} className="flex-1 py-2 border-2 border-tea-200 text-tea-600 rounded-xl hover:bg-tea-50 font-semibold">Zrušit</button>
              <button onClick={handleAddReport} className="flex-1 py-2 bg-matcha-600 hover:bg-matcha-700 text-white rounded-xl font-semibold shadow-md">Přidat zprávu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
