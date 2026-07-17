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

export default function EmployeeDashboard({ user, onNavigate }: Props) {
  const meId = parseInt(user.id ?? '0');
  const [shifts, setShifts] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [availabilitySubmitted, setAvailabilitySubmitted] = useState<boolean | null>(null);
  const [unreadChats, setUnreadChats] = useState(0);
  const [closingsDue, setClosingsDue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [sh, tk, inv, av, conv, cl] = await Promise.all([
          fetch('/api/shifts').then(r => r.json()).catch(() => ({})),
          fetch(`/api/tasks?assignedTo=${meId}`).then(r => r.json()).catch(() => []),
          fetch('/api/inventory').then(r => r.json()).catch(() => []),
          fetch(`/api/availability?month=${nextMonthStr()}`).then(r => r.json()).catch(() => null),
          fetch('/api/conversations').then(r => r.json()).catch(() => []),
          fetch('/api/closings').then(r => r.json()).catch(() => ({})),
        ]);
        const allShifts = Array.isArray(sh?.shifts) ? sh.shifts : Array.isArray(sh) ? sh : [];
        setShifts(allShifts.filter((s: any) => s.employeeId === meId || s.employee_id === meId));
        setTasks(Array.isArray(tk) ? tk : []);
        setInventory(Array.isArray(inv) ? inv : []);
        setAvailabilitySubmitted(av && !av.error ? !!av : false);
        const convs = Array.isArray(conv) ? conv : conv?.conversations ?? [];
        setUnreadChats(convs.reduce((s: number, c: any) => s + (c.unreadCount || 0), 0));
        setClosingsDue(Array.isArray(cl?.eligibleShifts) ? cl.eligibleShifts : []);
      } catch {}
      setLoading(false);
    })();
  }, [meId]);

  const today = new Date().toISOString().split('T')[0];
  const upcoming = shifts
    .filter(s => (s.date ?? '') >= today)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const nextShift = upcoming[0];
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const lowStock = inventory.filter(i => i.quantity <= i.minQuantity);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 10) return 'Dobré ráno';
    if (h < 18) return 'Dobrý den';
    return 'Dobrý večer';
  })();

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <span className="text-3xl flex h-14 w-14 items-center justify-center rounded-full ring-1 ring-black/10 bg-black/[0.05]">{user.avatar ?? '👤'}</span>
        <div>
          <p className="text-black/45 text-sm">{greeting},</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#16181A]">{user.name}</h1>
        </div>
      </div>

      {/* Next shift — hero card */}
      <button onClick={() => onNavigate('my-shifts')} className="w-full text-left glass-card p-6 hover:bg-black/[0.05] transition-all duration-300">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-wider text-black/45">Nejbližší směna</p>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#C8F542]/12 text-[#5B7A08]"><Icon name="calendar" size={17} /></span>
        </div>
        {nextShift ? (
          <div>
            <p className="text-3xl font-bold tracking-tight text-[#16181A]">
              {new Date((nextShift.date) + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <p className="text-black/55 mt-1">{(nextShift.startTime ?? nextShift.start_time)} – {(nextShift.endTime ?? nextShift.end_time)} · {nextShift.type === 'morning' ? 'Ranní' : nextShift.type === 'afternoon' ? 'Odpolední' : 'Směna'}</p>
          </div>
        ) : (
          <p className="text-black/45">Žádná nadcházející směna.</p>
        )}
      </button>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => onNavigate('tasks')} className="text-left glass-card p-5 hover:bg-black/[0.05] transition-all duration-300">
          <p className="text-xs uppercase tracking-wider text-black/45">Moje úkoly</p>
          <p className="text-3xl font-bold tracking-tight text-[#16181A] mt-2">{activeTasks.length}</p>
          <p className="text-xs text-black/45 mt-1">aktivních</p>
        </button>
        <button onClick={() => onNavigate('chat')} className="text-left glass-card p-5 hover:bg-black/[0.05] transition-all duration-300">
          <p className="text-xs uppercase tracking-wider text-black/45">Nepřečtené zprávy</p>
          <p className="text-3xl font-bold tracking-tight text-[#16181A] mt-2">{unreadChats}</p>
          <p className="text-xs text-black/45 mt-1">v chatu</p>
        </button>
      </div>

      {/* End-of-shift closing quick action — highlighted when a shift is unclosed */}
      {closingsDue.length > 0 ? (
        <button onClick={() => onNavigate('closing')} className="w-full text-left rounded-3xl bg-[#C8F542]/15 border border-[#C8F542]/30 p-5 hover:bg-[#C8F542]/20 transition-all">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#16181A] text-[#C8F542] shrink-0"><Icon name="trend" size={18} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#16181A]">
                {closingsDue.length === 1 ? 'Vyplň uzávěrku ze své směny' : `Máš ${closingsDue.length} neuzavřené směny`}
              </p>
              <p className="text-sm text-[#5B7A08]">Spočítej kasu a odešli uzávěrku — vedení ji uvidí hned.</p>
            </div>
            <Icon name="chevron" size={16} className="text-[#5B7A08] -rotate-90 shrink-0" />
          </div>
        </button>
      ) : (
        <button onClick={() => onNavigate('closing')} className="w-full text-left glass-card p-5 hover:bg-black/[0.05] transition-all duration-300">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#16181A] text-[#C8F542] shrink-0"><Icon name="trend" size={18} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#16181A]">Uzávěrka směny</p>
              <p className="text-sm text-black/55">Na konci směny spočítej kasu a odešli uzávěrku.</p>
            </div>
            <Icon name="chevron" size={16} className="text-black/35 -rotate-90 shrink-0" />
          </div>
        </button>
      )}

      {/* Availability reminder */}
      {availabilitySubmitted === false && (
        <button onClick={() => onNavigate('availability')} className="w-full text-left rounded-3xl bg-[#C8F542]/10 border border-[#C8F542]/25 p-5 hover:bg-[#C8F542]/15 transition-all">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#C8F542]/20 text-[#5B7A08]"><Icon name="calendar" size={18} /></span>
            <div>
              <p className="font-semibold text-[#16181A]">Zadejte dostupnost na příští měsíc</p>
              <p className="text-sm text-black/55">Dejte vedení vědět, kdy nemůžete — sestaví podle toho rozvrh.</p>
            </div>
          </div>
        </button>
      )}

      {/* Low stock to watch */}
      {lowStock.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold tracking-tight text-[#16181A]">Zásoby, které docházejí</h3>
            <button onClick={() => onNavigate('inventory')} className="text-sm text-[#5B7A08] hover:brightness-110">Sklad →</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.slice(0, 8).map(i => (
              <span key={i.id} className="rounded-full px-3 py-1 text-xs font-medium bg-orange-500/15 text-orange-600">{i.name} · {i.quantity} {i.unit}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
