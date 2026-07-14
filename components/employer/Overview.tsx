'use client';

import { useState, useEffect } from 'react';
import { Icon } from '../Icons';

interface ShiftItem {
  id: number;
  employeeId: number;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
}

interface TaskItem {
  id: number;
  title: string;
  priority: string;
  status: string;
  dueDate?: string;
}

interface InventoryItem {
  id: number;
  name: string;
  quantity: number;
  minQuantity: number;
  unit: string;
}

interface UserItem {
  id: number;
  name: string;
  avatar?: string;
  jobTitle?: string;
}

interface DailyReport {
  date: string;
  revenue: number;
  customers: number;
}

function StatCard({ icon, label, value, sub, progress = 100, alert = false }: { icon: string; label: string; value: string | number; sub?: string; progress?: number; alert?: boolean }) {
  return (
    <div className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${alert ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-[#C8F542]/10 border-[#C8F542]/20 text-[#C8F542]'}`}>
          <Icon name={icon} size={17} />
        </span>
      </div>
      <p className="text-3xl md:text-4xl font-bold tracking-tight mt-3 text-white">{value}</p>
      {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
      <div className="h-1 rounded-full bg-white/10 mt-4 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${alert ? 'bg-red-400' : 'bg-[#C8F542]'}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}

export default function Overview({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [shifts, setShifts] = useState<{ shifts: ShiftItem[]; requests: any[] }>({ shifts: [], requests: [] });
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [shiftsRes, tasksRes, invRes, usersRes, reportsRes] = await Promise.all([
          fetch('/api/shifts'),
          fetch('/api/tasks'),
          fetch('/api/inventory'),
          fetch('/api/users'),
          fetch('/api/reports'),
        ]);
        const [shiftsData, tasksData, invData, usersData] = await Promise.all([
          shiftsRes.json(),
          tasksRes.json(),
          invRes.json(),
          usersRes.json(),
        ]);
        setShifts(shiftsData);
        setTasks(tasksData);
        setInventory(invData);
        setUsers(usersData.filter((u: any) => u.role === 'employee'));
        if (reportsRes.ok) {
          const rd = await reportsRes.json();
          setReports(rd);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const todayShifts = shifts.shifts?.filter(s => s.date === today) ?? [];
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const lowStock = inventory.filter(i => i.quantity < i.minQuantity);

  const getUserName = (id: number) => users.find(u => u.id === id)?.name ?? `Zaměstnanec #${id}`;

  return (
    <div className="p-6 space-y-6">
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-[#C8F542] animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon="users" label="Zaměstnanci" value={users.length} sub="aktivních" progress={users.length > 0 ? 100 : 0} />
            <StatCard icon="calendar" label="Směny dnes" value={todayShifts.length} sub="naplánovaných" progress={Math.min(100, todayShifts.length * 25)} />
            <StatCard icon="check" label="Aktivní úkoly" value={pendingTasks.length} sub="ke splnění" progress={tasks.length > 0 ? Math.round((pendingTasks.length / tasks.length) * 100) : 0} />
            <StatCard icon="warning" label="Nízké zásoby" value={lowStock.length} sub="položek" progress={inventory.length > 0 ? Math.round((lowStock.length / inventory.length) * 100) : 0} alert={lowStock.length > 0} />
          </div>

          {/* Today's shifts */}
          <div className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold tracking-tight text-white">Dnešní směny</h3>
              <button onClick={() => onNavigate('shifts')} className="text-sm text-[#C8F542] hover:brightness-110 transition-all">Všechny směny →</button>
            </div>
            {todayShifts.length === 0 ? (
              <p className="text-white/40 text-sm">Dnes nejsou žádné naplánované směny.</p>
            ) : (
              <div className="space-y-3">
                {todayShifts.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 bg-white/[0.06] rounded-2xl hover:bg-white/[0.08] transition-all duration-300">
                    <span className="text-2xl">{s.type === 'morning' ? '🌅' : '🌆'}</span>
                    <div>
                      <p className="font-semibold text-white text-sm">{getUserName(s.employeeId)}</p>
                      <p className="text-xs text-white/40">{s.startTime} – {s.endTime} · {s.type === 'morning' ? 'Ranní' : 'Odpolední'} směna</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pending tasks */}
            <div className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold tracking-tight text-white">Aktivní úkoly</h3>
                <button onClick={() => onNavigate('team')} className="text-sm text-[#C8F542] hover:brightness-110 transition-all">Zobrazit →</button>
              </div>
              <div className="space-y-2">
                {pendingTasks.slice(0, 4).map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-white/[0.06] rounded-2xl hover:bg-white/[0.08] transition-all duration-300">
                    <span className="text-lg">{t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{t.title}</p>
                      {t.dueDate && <p className="text-xs text-white/40">Do: {t.dueDate}</p>}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${t.status === 'in_progress' ? 'bg-blue-500/15 text-blue-400' : 'bg-white/10 text-white/60'}`}>
                      {t.status === 'in_progress' ? 'Probíhá' : 'Čeká'}
                    </span>
                  </div>
                ))}
                {pendingTasks.length === 0 && <p className="text-white/40 text-sm">Žádné aktivní úkoly 🎉</p>}
              </div>
            </div>

            {/* Low stock */}
            <div className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold tracking-tight text-white">Nízké zásoby</h3>
                <button onClick={() => onNavigate('inventory')} className="text-sm text-[#C8F542] hover:brightness-110 transition-all">Sklad →</button>
              </div>
              <div className="space-y-2">
                {lowStock.slice(0, 5).map(i => (
                  <div key={i.id} className="flex items-center gap-3 p-3 bg-red-500/10 rounded-2xl hover:bg-red-500/15 transition-all duration-300">
                    <span className="text-lg">📦</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{i.name}</p>
                      <p className="text-xs text-red-400">{i.quantity} {i.unit} / min. {i.minQuantity} {i.unit}</p>
                    </div>
                  </div>
                ))}
                {lowStock.length === 0 && <p className="text-white/40 text-sm">Zásoby jsou v pořádku</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
