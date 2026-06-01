import { useState } from 'react';
import { employees, shifts, tasks, inventory, dailyReports, statsData, notifications } from '../../data/mockData.js';

const today = new Date();
const fmt = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
const todayStr = fmt(today);

function StatCard({ icon, label, value, sub, color = 'matcha' }) {
  const colorMap = {
    matcha: 'bg-matcha-50 border-matcha-200 text-matcha-700',
    tea: 'bg-tea-50 border-tea-200 text-tea-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`rounded-2xl border-2 p-5 ${colorMap[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium opacity-70">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}

function MiniBar({ data, max, labels, color = 'matcha' }) {
  const colorClass = color === 'matcha' ? 'bg-matcha-500' : 'bg-tea-400';
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((val, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={`w-full rounded-t ${colorClass} transition-all`}
            style={{ height: max > 0 ? `${(val / max) * 100}%` : '4px', minHeight: val > 0 ? '4px' : '2px', opacity: val > 0 ? 1 : 0.25 }}
          />
          <span className="text-xs text-tea-400">{labels[i]}</span>
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

  const upcomingShifts = shifts
    .filter(s => s.date >= todayStr && s.status !== 'completed')
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tea-800">Dobrý den! 👋</h1>
          <p className="text-tea-500 text-sm mt-0.5">
            {today.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-tea-500">Čajovna Zelená</p>
          <p className="text-xs text-tea-400">Praha, Vinohrady</p>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
          <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2">
            ⚠️ Upozornění ({alerts.length})
          </h3>
          <div className="space-y-2">
            {alerts.slice(0, 3).map(alert => (
              <div key={alert.id} className="flex items-start gap-3">
                <span className="text-sm">
                  {alert.type === 'warning' ? '🔴' : alert.type === 'success' ? '🟢' : '🔵'}
                </span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">{alert.title}</p>
                  <p className="text-xs text-amber-700">{alert.message}</p>
                </div>
                {alert.link && (
                  <button
                    onClick={() => onNavigate(alert.link === 'shifts' ? 'shifts' : 'inventory')}
                    className="ml-auto text-xs text-amber-600 hover:underline flex-shrink-0"
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="👥" label="Zákazníci (měsíc)" value={statsData.monthCustomers} sub={`Ø ${statsData.avgRevenuePerCustomer} Kč/os`} color="matcha" />
        <StatCard icon="💰" label="Tržby (měsíc)" value={`${statsData.monthRevenue.toLocaleString('cs-CZ')} Kč`} sub={`Nejsilnější: ${statsData.bestDay}`} color="tea" />
        <StatCard icon="📦" label="Nízké zásoby" value={lowStockItems.length} sub="položek vyžaduje doplnění" color={lowStockItems.length > 0 ? 'amber' : 'matcha'} />
        <StatCard icon="✅" label="Aktivní úkoly" value={pendingTasks.length} sub="čeká na splnění" color="tea" />
      </div>

      {/* Two column section */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Dnešní směny */}
        <div className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-tea-100">
            <h3 className="font-bold text-tea-800 flex items-center gap-2">📅 Dnešní směny</h3>
            <button onClick={() => onNavigate('shifts')} className="text-xs text-matcha-600 hover:underline">
              Správa směn →
            </button>
          </div>
          <div className="p-4 space-y-3">
            {todayShifts.length === 0 ? (
              <p className="text-tea-400 text-sm text-center py-4">Dnes nejsou žádné směny</p>
            ) : (
              todayShifts.map(shift => {
                const emp = employees.find(e => e.id === shift.employeeId);
                return (
                  <div key={shift.id} className={`flex items-center gap-3 p-3 rounded-xl ${
                    shift.status === 'ongoing' ? 'bg-matcha-50 border border-matcha-200' : 'bg-tea-50'
                  }`}>
                    <span className="text-xl">{emp?.avatar || '👤'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-tea-800 truncate">{emp?.name}</p>
                      <p className="text-xs text-tea-500">{shift.start} – {shift.end}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      shift.status === 'ongoing'
                        ? 'bg-matcha-500 text-white'
                        : 'bg-tea-200 text-tea-700'
                    }`}>
                      {shift.status === 'ongoing' ? '▶ Probíhá' : '⏳ Nadcházející'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Tržby tento týden */}
        <div className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-tea-100">
            <h3 className="font-bold text-tea-800 flex items-center gap-2">📈 Tržby tento týden</h3>
            <span className="text-xs text-tea-400">Kč</span>
          </div>
          <div className="p-4">
            <div className="mb-4">
              <MiniBar
                data={statsData.weekRevenue}
                max={Math.max(...statsData.weekRevenue)}
                labels={statsData.weekDays}
                color="matcha"
              />
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-tea-800">
                  {statsData.weekRevenue.reduce((a, b) => a + b, 0).toLocaleString('cs-CZ')} Kč
                </p>
                <p className="text-xs text-tea-400">Týden celkem</p>
              </div>
              <div>
                <p className="text-lg font-bold text-tea-800">
                  {(statsData.weekRevenue.reduce((a, b) => a + b, 0) / statsData.weekRevenue.filter(v => v > 0).length).toFixed(0)} Kč
                </p>
                <p className="text-xs text-tea-400">Průměr/den</p>
              </div>
              <div>
                <p className="text-lg font-bold text-matcha-600">
                  +12%
                </p>
                <p className="text-xs text-tea-400">vs. min. týden</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Poslední denní zpráva */}
        {lastReport && (
          <div className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-tea-100">
              <h3 className="font-bold text-tea-800">📝 Poslední denní zpráva</h3>
              <p className="text-xs text-tea-400 mt-0.5">
                {new Date(lastReport.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })}
              </p>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-tea-500">Zákazníci</span>
                <span className="text-sm font-bold text-tea-800">{lastReport.customers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-tea-500">Tržby</span>
                <span className="text-sm font-bold text-matcha-700">{lastReport.revenue.toLocaleString('cs-CZ')} Kč</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-tea-500">Nejprodávanější</span>
                <span className="text-sm font-semibold text-tea-800 text-right">{lastReport.topSeller}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-tea-500">Počasí</span>
                <span className="text-sm text-tea-800">{lastReport.weather}</span>
              </div>
              <div className="mt-2 p-2 bg-tea-50 rounded-lg">
                <p className="text-xs text-tea-600 italic">"{lastReport.notes}"</p>
              </div>
            </div>
          </div>
        )}

        {/* Nízké zásoby */}
        <div className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-tea-100">
            <h3 className="font-bold text-tea-800">📦 Nízké zásoby</h3>
            <button onClick={() => onNavigate('inventory')} className="text-xs text-matcha-600 hover:underline">
              Sklad →
            </button>
          </div>
          <div className="p-4 space-y-2">
            {lowStockItems.length === 0 ? (
              <p className="text-matcha-600 text-sm text-center py-4">✅ Vše v pořádku</p>
            ) : (
              lowStockItems.map(item => (
                <div key={item.id} className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-100">
                  <span className="text-sm">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-tea-800 truncate">{item.name}</p>
                    <p className="text-xs text-red-500">{item.quantity}{item.unit} / min. {item.minQuantity}{item.unit}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Aktivní úkoly */}
        <div className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-tea-100">
            <h3 className="font-bold text-tea-800">✅ Úkoly</h3>
            <button onClick={() => onNavigate('team')} className="text-xs text-matcha-600 hover:underline">
              Tým →
            </button>
          </div>
          <div className="p-4 space-y-2">
            {pendingTasks.slice(0, 4).map(task => {
              const emp = employees.find(e => e.id === task.assignedTo);
              const priorityColor = task.priority === 'high' ? 'text-red-500' : task.priority === 'medium' ? 'text-amber-500' : 'text-tea-400';
              return (
                <div key={task.id} className="flex items-start gap-2 p-2 hover:bg-tea-50 rounded-lg">
                  <span className={`text-sm mt-0.5 ${priorityColor}`}>
                    {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-tea-800 truncate">{task.title}</p>
                    <p className="text-xs text-tea-400">{emp?.name} · splatnost {new Date(task.dueDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}</p>
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
