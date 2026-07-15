'use client';

import { useState, useEffect } from 'react';
import { Icon } from '../Icons';

interface Props {
  user: { id?: string; name?: string | null; avatar?: string };
  onNavigate: (view: string) => void;
}

function nextMonthStr() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function StatCard({ icon, label, value, onClick, alert = false }: { icon: string; label: string; value: number | string; onClick?: () => void; alert?: boolean }) {
  return (
    <button onClick={onClick} className="text-left glass-card p-5 hover:bg-black/[0.05] transition-all duration-300">
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-wider text-black/45">{label}</p>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${alert ? 'bg-red-500/10 border-red-500/20 text-red-600' : 'bg-[#C8F542]/10 border-[#C8F542]/20 text-[#5B7A08]'}`}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <p className="text-3xl font-bold tracking-tight text-[#16181A] mt-3">{value}</p>
    </button>
  );
}

export default function EmployerDashboard({ user, onNavigate }: Props) {
  const [members, setMembers] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [unreadChats, setUnreadChats] = useState(0);
  const [loading, setLoading] = useState(true);

  const month = nextMonthStr();

  useEffect(() => {
    (async () => {
      try {
        const [team, sh, tk, inv, av, conv] = await Promise.all([
          fetch('/api/teams').then(r => r.json()).catch(() => ({})),
          fetch('/api/shifts').then(r => r.json()).catch(() => ({})),
          fetch('/api/tasks').then(r => r.json()).catch(() => []),
          fetch('/api/inventory').then(r => r.json()).catch(() => []),
          fetch(`/api/availability?month=${month}`).then(r => r.json()).catch(() => []),
          fetch('/api/conversations').then(r => r.json()).catch(() => []),
        ]);
        setMembers((team?.members ?? []).filter((m: any) => m.role === 'employee'));
        const allShifts = Array.isArray(sh?.shifts) ? sh.shifts : Array.isArray(sh) ? sh : [];
        setShifts(allShifts);
        setTasks(Array.isArray(tk) ? tk : []);
        setInventory(Array.isArray(inv) ? inv : []);
        setAvailability(Array.isArray(av) ? av : []);
        const convs = Array.isArray(conv) ? conv : conv?.conversations ?? [];
        setUnreadChats(convs.reduce((s: number, c: any) => s + (c.unreadCount || 0), 0));
      } catch {}
      setLoading(false);
    })();
  }, [month]);

  const today = new Date().toISOString().split('T')[0];
  const todayShifts = shifts.filter(s => (s.date ?? '') === today);
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const lowStock = inventory.filter(i => i.quantity <= i.minQuantity);
  const critical = inventory.filter(i => i.quantity <= (i.criticalQuantity ?? i.critical_quantity ?? 0));
  const submittedIds = new Set(availability.map((a: any) => a.employeeId ?? a.employee_id));
  const notSubmitted = members.filter(m => !submittedIds.has(m.id));

  const monthLabel = new Date(month + '-01T00:00:00').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-black/45 text-sm">Přehled podniku</p>
        <h1 className="text-2xl font-bold tracking-tight text-[#16181A]">Vítejte zpět, {user.name}</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="users" label="Zaměstnanci" value={members.length} onClick={() => onNavigate('team')} />
        <StatCard icon="calendar" label="Směny dnes" value={todayShifts.length} onClick={() => onNavigate('shifts')} />
        <StatCard icon="check" label="Aktivní úkoly" value={activeTasks.length} onClick={() => onNavigate('team')} />
        <StatCard icon="warning" label="Kriticky málo" value={critical.length} onClick={() => onNavigate('inventory')} alert={critical.length > 0} />
      </div>

      {/* Availability status for next month */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold tracking-tight text-[#16181A]">Dostupnost — {monthLabel}</h3>
            <p className="text-sm text-black/45">{submittedIds.size} z {members.length} zaměstnanců zadalo dostupnost</p>
          </div>
          <button onClick={() => onNavigate('schedule')} className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2 text-sm hover:brightness-110">Sestavit rozvrh</button>
        </div>
        {notSubmitted.length > 0 ? (
          <div>
            <p className="text-xs uppercase tracking-wider text-black/45 mb-2">Ještě nezadali</p>
            <div className="flex flex-wrap gap-2">
              {notSubmitted.map(m => (
                <span key={m.id} className="rounded-full px-3 py-1 text-xs font-medium bg-black/[0.05] text-black/60">{m.avatar} {m.name}</span>
              ))}
            </div>
          </div>
        ) : members.length > 0 ? (
          <p className="text-sm text-[#5B7A08]">Všichni zadali dostupnost — můžete sestavit rozvrh.</p>
        ) : (
          <p className="text-sm text-black/45">Zatím žádní zaměstnanci. Pozvěte tým v sekci Nastavení.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Low stock */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold tracking-tight text-[#16181A]">Nízké zásoby</h3>
            <button onClick={() => onNavigate('inventory')} className="text-sm text-[#5B7A08] hover:brightness-110">Sklad →</button>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-black/45">Zásoby jsou v pořádku.</p>
          ) : (
            <div className="space-y-2">
              {lowStock.slice(0, 5).map(i => {
                const isCritical = i.quantity <= (i.criticalQuantity ?? i.critical_quantity ?? 0);
                return (
                  <div key={i.id} className="flex items-center justify-between p-3 rounded-2xl bg-black/[0.04]">
                    <span className="text-sm text-[#16181A]">{i.name}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${isCritical ? 'bg-red-500/15 text-red-600' : 'bg-orange-500/15 text-orange-600'}`}>{i.quantity} {i.unit}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Today's shifts */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold tracking-tight text-[#16181A]">Dnešní směny</h3>
            <button onClick={() => onNavigate('shifts')} className="text-sm text-[#5B7A08] hover:brightness-110">Rozvrh →</button>
          </div>
          {todayShifts.length === 0 ? (
            <p className="text-sm text-black/45">Dnes nejsou naplánované žádné směny.</p>
          ) : (
            <div className="space-y-2">
              {todayShifts.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl bg-black/[0.04]">
                  <span className="text-lg"><Icon name={s.type === 'morning' ? 'sun' : 'moon'} size={16} className={s.type === 'morning' ? 'text-orange-500' : 'text-[#0A6FE0]'} /></span>
                  <div>
                    <p className="text-sm font-medium text-[#16181A]">{s.employeeName ?? s.employee_name ?? 'Zaměstnanec'}</p>
                    <p className="text-xs text-black/45">{(s.startTime ?? s.start_time)} – {(s.endTime ?? s.end_time)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
