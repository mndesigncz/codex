import { useState } from 'react';
import { dailyReports as initialReports, employees, statsData } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;

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
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Denní zprávy</h1>
          <p className="text-text-secondary text-sm">Přehled denní aktivity čajovny</p>
        </div>
        <button
          onClick={() => setShowNewReport(true)}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-accent hover:bg-accent/90 text-black font-semibold rounded-xl transition-all shadow-lg text-sm"
        >
          <span>+</span>
          <span className="hidden sm:inline">Nová zpráva</span>
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[
          { label: 'Celkové tržby', value: `${totalRevenue.toLocaleString('cs-CZ')} Kč`, icon: '💰', accent: 'text-accent' },
          { label: 'Celkem zákazníků', value: totalCustomers, icon: '👥', accent: 'text-accent-blue' },
          { label: 'Průměr/zákazník', value: `${avgPerCustomer} Kč`, icon: '📊', accent: 'text-warning' },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-2xl border border-border p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-text-secondary">{s.label}</p>
                <p className={`text-lg md:text-xl font-bold mt-0.5 ${s.accent}`}>{s.value}</p>
              </div>
              <span className="text-xl md:text-2xl">{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="bg-card rounded-2xl border border-border p-4 md:p-5">
        <h3 className="font-bold text-white mb-4 text-sm md:text-base">Tržby posledních dní</h3>
        <div className="flex items-end gap-2 md:gap-3 h-20 md:h-24">
          {[...reports].reverse().map((r) => {
            const maxRev = Math.max(...reports.map(rr => rr.revenue));
            const pct = maxRev > 0 ? (r.revenue / maxRev) * 100 : 0;
            return (
              <div key={r.id} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-accent font-semibold hidden sm:block">{r.revenue.toLocaleString('cs-CZ')}</span>
                <div
                  className="w-full bg-accent rounded-t-lg transition-all"
                  style={{ height: `${Math.max(pct, 5)}%` }}
                />
                <span className="text-xs text-text-secondary">
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
            <div key={report.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 md:px-5 py-4 bg-elevated border-b border-border">
                <div>
                  <h3 className="font-bold text-white capitalize text-sm md:text-base">
                    {weekday}, {new Date(report.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">{report.weather}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl md:text-2xl font-bold text-accent">{report.revenue.toLocaleString('cs-CZ')} Kč</p>
                  <p className="text-sm text-text-secondary">{report.customers} zákazníků</p>
                </div>
              </div>
              <div className="p-4 md:p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    ['Průměr/zákazník', `${(report.revenue / report.customers).toFixed(0)} Kč`],
                    ['Nejprodávanější', `${report.topSeller} (${report.topSellerCount}×)`],
                    ['Otevíral', opener?.name.split(' ')[0] || '—'],
                    ['Zavíral', closer?.name.split(' ')[0] || '—'],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-elevated rounded-xl p-3 border border-border">
                      <p className="text-xs text-text-secondary">{label}</p>
                      <p className="text-sm font-bold text-white mt-0.5">{val}</p>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-elevated rounded-xl border border-border">
                  <p className="text-xs text-text-secondary font-semibold mb-1">Poznámky ze směny</p>
                  <p className="text-sm text-text-secondary">{report.notes}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* New report modal */}
      {showNewReport && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
              <h3 className="font-bold text-white text-lg">Nová denní zpráva</h3>
              <button onClick={() => setShowNewReport(false)} className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-white bg-elevated rounded-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Datum</label>
                <input type="date" value={newReport.date} onChange={e => setNewReport(s => ({ ...s, date: e.target.value }))} className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Zákazníci</label>
                  <input type="number" value={newReport.customers} onChange={e => setNewReport(s => ({ ...s, customers: e.target.value }))} placeholder="0" className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Tržby (Kč)</label>
                  <input type="number" value={newReport.revenue} onChange={e => setNewReport(s => ({ ...s, revenue: e.target.value }))} placeholder="0" className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Nejprodávanější</label>
                  <input type="text" value={newReport.topSeller} onChange={e => setNewReport(s => ({ ...s, topSeller: e.target.value }))} placeholder="Název nápoje" className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Počet prodaných</label>
                  <input type="number" value={newReport.topSellerCount} onChange={e => setNewReport(s => ({ ...s, topSellerCount: e.target.value }))} placeholder="0" className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Počasí</label>
                <select value={newReport.weather} onChange={e => setNewReport(s => ({ ...s, weather: e.target.value }))} className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white text-sm">
                  <option>Slunečno</option><option>Zataženo</option><option>Zataženo, chladno</option><option>Déšť</option><option>Sněžení</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Otevíral</label>
                  <select value={newReport.openedBy} onChange={e => setNewReport(s => ({ ...s, openedBy: e.target.value }))} className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white text-sm">
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name.split(' ')[0]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Zavíral</label>
                  <select value={newReport.closedBy} onChange={e => setNewReport(s => ({ ...s, closedBy: e.target.value }))} className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white text-sm">
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name.split(' ')[0]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Poznámky</label>
                <textarea value={newReport.notes} onChange={e => setNewReport(s => ({ ...s, notes: e.target.value }))} placeholder="Co se dělo, jak byl den rušný, problémy..." rows={3} className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 resize-none text-sm" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowNewReport(false)} className="flex-1 py-3 border border-border text-text-secondary rounded-2xl hover:bg-elevated font-semibold text-sm transition-colors">Zrušit</button>
              <button onClick={handleAddReport} className="flex-1 py-3 bg-accent hover:bg-accent/90 text-black rounded-2xl font-bold shadow-lg text-sm transition-colors">Přidat zprávu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
