import { useState } from 'react';
import { employees, shifts, tasks, inventory, dailyReports, statsData, notifications } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const todayStr = fmt(today);

function StatCard({ icon, label, value, sub, accent = 'green' }) {
  const accentMap = {
    green:  'border-accent/30 bg-accent/10 text-accent',
    blue:   'border-accent-blue/30 bg-accent-blue/10 text-accent-blue',
    orange: 'border-warning/30 bg-warning/10 text-warning',
    red:    'border-danger/30 bg-danger/10 text-danger',
  };
  return (
    <div className={`rounded-2xl border p-4 md:p-5 ${accentMap[accent]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-text-secondary">{label}</p>
          <p className="text-2xl md:text-3xl font-bold mt-1 text-white">{value}</p>
          {sub && <p className="text-xs text-text-secondary mt-1">{sub}</p>}
        </div>
        <span className="text-2xl md:text-3xl">{icon}</span>
      </div>
    </div>
  );
}

function MiniBar({ data, max }) {
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((val, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-accent transition-all"
            style={{ height: max > 0 ? `${(val / max) * 100}%` : '4px', minHeight: val > 0 ? '4px' : '2px', opacity: val > 0 ? 1 : 0.25 }}
          />
        </div>
      ))}
    </div>
  );
}

export default function Overview({ onNavigate }) {
  const todayShifts = shifts.filter(s => s.date === todayStr);
  const pendingRequests = shifts.filter(s => s.status === 'pending').length;
  const lowStockItems = inventory.filter(i => i.quantity <= i.minQuantity);
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const alerts = notifications.filter(n => !n.isRead);
  const lastReport = dailyReports[0];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Dobrý den!</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {today.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-sm text-text-secondary">Čajovna Zelená</p>
          <p className="text-xs text-text-secondary/60">Praha, Vinohrady</p>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4">
          <h3 className="font-bold text-warning mb-3 flex items-center gap-2 text-sm">
            ⚠️ Upozornění ({alerts.length})
          </h3>
          <div className="space-y-2">
            {alerts.slice(0, 3).map(alert => (
              <div key={alert.id} className="flex items-start gap-3">
                <span className="text-sm flex-shrink-0">
                  {alert.type === 'warning' ? '🔴' : alert.type === 'success' ? '🟢' : '🔵'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{alert.title}</p>
                  <p className="text-xs text-text-secondary">{alert.message}</p>
                </div>
                {alert.link && (
                  <button
                    onClick={() => onNavigate(alert.link === 'shifts' ? 'shifts' : 'inventory')}
                    className="text-xs text-warning hover:underline flex-shrink-0"
                  >
                    Zobrazit →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon="👥" label="Zákazníci (měsíc)" value={statsData.monthCustomers} sub={`Ø ${statsData.avgRevenuePerCustomer} Kč/os`} accent="green" />
        <StatCard icon="💰" label="Tržby (měsíc)" value={`${statsData.monthRevenue.toLocaleString('cs-CZ')} Kč`} sub={`Nejsilnější: ${statsData.bestDay}`} accent="blue" />
        <StatCard icon="📦" label="Nízké zásoby" value={lowStockItems.length} sub="položek vyžaduje doplnění" accent={lowStockItems.length > 0 ? 'orange' : 'green'} />
        <StatCard icon="✅" label="Aktivní úkoly" value={pendingTasks.length} sub="čeká na splnění" accent="blue" />
      </div>

      {/* Two column section */}
      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        {/* Dnešní směny */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm md:text-base">📅 Dnešní směny</h3>
            <button onClick={() => onNavigate('shifts')} className="text-xs text-accent hover:underline">
              Správa →
            </button>
          </div>
          <div className="p-4 space-y-3">
            {todayShifts.length === 0 ? (
              <p className="text-text-secondary text-sm text-center py-4">Dnes nejsou žádné směny</p>
            ) : (
              todayShifts.map(shift => {
                const emp = employees.find(e => e.id === shift.employeeId);
                return (
                  <div key={shift.id} className={`flex items-center gap-3 p-3 rounded-xl ${
                    shift.status === 'ongoing' ? 'bg-accent/10 border border-accent/30' : 'bg-elevated'
                  }`}>
                    <span className="text-xl">{emp?.avatar || '👤'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{emp?.name}</p>
                      <p className="text-xs text-text-secondary">{shift.start} – {shift.end}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      shift.status === 'ongoing'
                        ? 'bg-accent text-black'
                        : 'bg-elevated border border-border text-text-secondary'
                    }`}>
                      {shift.status === 'ongoing' ? 'Probíhá' : 'Nadcházející'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Tržby tento týden */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm md:text-base">📈 Tržby tento týden</h3>
            <span className="text-xs text-text-secondary">Kč</span>
          </div>
          <div className="p-4">
            <div className="mb-3">
              <MiniBar
                data={statsData.weekRevenue}
                max={Math.max(...statsData.weekRevenue)}
              />
              <div className="flex justify-between mt-1">
                {statsData.weekDays.map(d => (
                  <span key={d} className="text-xs text-text-secondary flex-1 text-center">{d}</span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center pt-3 border-t border-border">
              <div>
                <p className="text-base md:text-lg font-bold text-white">
                  {statsData.weekRevenue.reduce((a, b) => a + b, 0).toLocaleString('cs-CZ')} Kč
                </p>
                <p className="text-xs text-text-secondary">Týden celkem</p>
              </div>
              <div>
                <p className="text-base md:text-lg font-bold text-white">
                  {(statsData.weekRevenue.reduce((a, b) => a + b, 0) / statsData.weekRevenue.filter(v => v > 0).length).toFixed(0)} Kč
                </p>
                <p className="text-xs text-text-secondary">Průměr/den</p>
              </div>
              <div>
                <p className="text-base md:text-lg font-bold text-accent">+12%</p>
                <p className="text-xs text-text-secondary">vs. min. týden</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Poslední denní zpráva */}
        {lastReport && (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 md:px-5 py-4 border-b border-border">
              <h3 className="font-bold text-white text-sm md:text-base">📝 Poslední denní zpráva</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {new Date(lastReport.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })}
              </p>
            </div>
            <div className="p-4 space-y-3">
              {[
                ['Zákazníci', lastReport.customers, 'text-white'],
                ['Tržby', `${lastReport.revenue.toLocaleString('cs-CZ')} Kč`, 'text-accent'],
                ['Nejprodávanější', lastReport.topSeller, 'text-white'],
                ['Počasí', lastReport.weather, 'text-white'],
              ].map(([label, val, cls]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-sm text-text-secondary">{label}</span>
                  <span className={`text-sm font-bold ${cls}`}>{val}</span>
                </div>
              ))}
              <div className="mt-2 p-2 bg-elevated rounded-xl">
                <p className="text-xs text-text-secondary italic">"{lastReport.notes}"</p>
              </div>
            </div>
          </div>
        )}

        {/* Nízké zásoby */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
            <h3 className="font-bold text-white text-sm md:text-base">📦 Nízké zásoby</h3>
            <button onClick={() => onNavigate('inventory')} className="text-xs text-accent hover:underline">
              Sklad →
            </button>
          </div>
          <div className="p-4 space-y-2">
            {lowStockItems.length === 0 ? (
              <p className="text-accent text-sm text-center py-4">✅ Vše v pořádku</p>
            ) : (
              lowStockItems.map(item => (
                <div key={item.id} className="flex items-center gap-2 p-2 bg-danger/10 rounded-xl border border-danger/20">
                  <span className="text-sm">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.name}</p>
                    <p className="text-xs text-danger">{item.quantity}{item.unit} / min. {item.minQuantity}{item.unit}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Aktivní úkoly */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
            <h3 className="font-bold text-white text-sm md:text-base">✅ Úkoly</h3>
            <button onClick={() => onNavigate('team')} className="text-xs text-accent hover:underline">
              Tým →
            </button>
          </div>
          <div className="p-4 space-y-2">
            {pendingTasks.slice(0, 4).map(task => {
              const emp = employees.find(e => e.id === task.assignedTo);
              const priorityColor = task.priority === 'high' ? 'text-danger' : task.priority === 'medium' ? 'text-warning' : 'text-accent';
              return (
                <div key={task.id} className="flex items-start gap-2 p-2 hover:bg-elevated rounded-xl transition-colors">
                  <span className={`text-sm mt-0.5 ${priorityColor}`}>
                    {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{task.title}</p>
                    <p className="text-xs text-text-secondary">{emp?.name} · splatnost {new Date(task.dueDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
