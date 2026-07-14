'use client';

import { useState, useEffect } from 'react';

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

function StatCard({ icon, label, value, sub, color = 'matcha' }: { icon: string; label: string; value: string | number; sub?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    matcha: 'bg-matcha-50 border-matcha-200 text-matcha-700',
    tea: 'bg-tea-50 border-tea-200 text-tea-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`rounded-2xl border-2 p-5 ${colorMap[color] ?? colorMap.matcha}`}>
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
          <div className="text-4xl animate-spin">⏳</div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon="👥" label="Zaměstnanci" value={users.length} sub="aktivních" color="matcha" />
            <StatCard icon="📅" label="Směny dnes" value={todayShifts.length} sub="naplánovaných" color="tea" />
            <StatCard icon="✅" label="Aktivní úkoly" value={pendingTasks.length} sub="ke splnění" color="amber" />
            <StatCard icon="⚠️" label="Nízké zásoby" value={lowStock.length} sub="položek" color={lowStock.length > 0 ? 'red' : 'matcha'} />
          </div>

          {/* Today's shifts */}
          <div className="bg-white rounded-2xl border-2 border-tea-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-tea-800 text-lg">📅 Dnešní směny</h3>
              <button onClick={() => onNavigate('shifts')} className="text-sm text-matcha-600 hover:underline">Všechny směny →</button>
            </div>
            {todayShifts.length === 0 ? (
              <p className="text-tea-400 text-sm">Dnes nejsou žádné naplánované směny.</p>
            ) : (
              <div className="space-y-3">
                {todayShifts.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 bg-tea-50 rounded-xl">
                    <span className="text-2xl">{s.type === 'morning' ? '🌅' : '🌆'}</span>
                    <div>
                      <p className="font-semibold text-tea-800 text-sm">{getUserName(s.employeeId)}</p>
                      <p className="text-xs text-tea-500">{s.startTime} – {s.endTime} · {s.type === 'morning' ? 'Ranní' : 'Odpolední'} směna</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pending tasks */}
            <div className="bg-white rounded-2xl border-2 border-tea-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-tea-800">✅ Aktivní úkoly</h3>
                <button onClick={() => onNavigate('team')} className="text-sm text-matcha-600 hover:underline">Zobrazit →</button>
              </div>
              <div className="space-y-2">
                {pendingTasks.slice(0, 4).map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-tea-50 rounded-xl">
                    <span className="text-lg">{t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-tea-800 truncate">{t.title}</p>
                      {t.dueDate && <p className="text-xs text-tea-400">Do: {t.dueDate}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-tea-100 text-tea-600'}`}>
                      {t.status === 'in_progress' ? 'Probíhá' : 'Čeká'}
                    </span>
                  </div>
                ))}
                {pendingTasks.length === 0 && <p className="text-tea-400 text-sm">Žádné aktivní úkoly 🎉</p>}
              </div>
            </div>

            {/* Low stock */}
            <div className="bg-white rounded-2xl border-2 border-tea-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-tea-800">⚠️ Nízké zásoby</h3>
                <button onClick={() => onNavigate('inventory')} className="text-sm text-matcha-600 hover:underline">Sklad →</button>
              </div>
              <div className="space-y-2">
                {lowStock.slice(0, 5).map(i => (
                  <div key={i.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
                    <span className="text-lg">📦</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-tea-800">{i.name}</p>
                      <p className="text-xs text-red-500">{i.quantity} {i.unit} / min. {i.minQuantity} {i.unit}</p>
                    </div>
                  </div>
                ))}
                {lowStock.length === 0 && <p className="text-tea-400 text-sm">Zásoby jsou v pořádku ✅</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
