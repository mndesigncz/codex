'use client';

import { useState, useEffect } from 'react';

interface Shift {
  id: number;
  employeeId: number;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
}

interface ShiftRequest {
  id: number;
  employeeId: number;
  requestType: string;
  date: string;
  note?: string;
  status: string;
}

interface User {
  id: number;
  name: string;
  avatar?: string;
}

export default function ShiftManagement() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'shifts' | 'requests'>('shifts');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [shiftsRes, usersRes] = await Promise.all([
          fetch('/api/shifts'),
          fetch('/api/users'),
        ]);
        const [shiftsData, usersData] = await Promise.all([shiftsRes.json(), usersRes.json()]);
        setShifts(shiftsData.shifts ?? []);
        setRequests(shiftsData.requests ?? []);
        setUsers(usersData.filter((u: any) => u.role === 'employee'));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const getUserName = (id: number) => users.find(u => u.id === id)?.name ?? `Zaměstnanec #${id}`;
  const getUserAvatar = (id: number) => users.find(u => u.id === id)?.avatar ?? '👤';

  // Group shifts by date
  const today = new Date();
  const upcoming = shifts.filter(s => s.date >= new Date().toISOString().split('T')[0])
    .sort((a, b) => a.date.localeCompare(b.date));

  const grouped: Record<string, Shift[]> = {};
  upcoming.forEach(s => {
    if (!grouped[s.date]) grouped[s.date] = [];
    grouped[s.date].push(s);
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 glass rounded-full p-1 w-fit">
        <button
          onClick={() => setTab('shifts')}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${tab === 'shifts' ? 'bg-[#C8F542] text-black font-semibold' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
        >
          📅 Směny ({shifts.length})
        </button>
        <button
          onClick={() => setTab('requests')}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${tab === 'requests' ? 'bg-[#C8F542] text-black font-semibold' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
        >
          📨 Žádosti ({requests.filter(r => r.status === 'pending').length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-[#C8F542] animate-spin" />
        </div>
      ) : tab === 'shifts' ? (
        <div className="space-y-4">
          {Object.keys(grouped).slice(0, 7).map(date => (
            <div key={date} className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
              <h3 className="font-bold tracking-tight text-white mb-3 capitalize">{formatDate(date)}</h3>
              <div className="divide-y divide-white/[0.06]">
                {grouped[date].map(s => (
                  <div key={s.id} className="flex items-center gap-3 py-3 px-2 rounded-xl hover:bg-white/[0.04] transition-all duration-300">
                    <span className="text-xl">{getUserAvatar(s.employeeId)}</span>
                    <div className="flex-1">
                      <p className="font-medium text-white text-sm">{getUserName(s.employeeId)}</p>
                      <p className="text-xs text-white/40">{s.startTime} – {s.endTime}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${s.type === 'morning' ? 'bg-orange-500/15 text-orange-400' : 'bg-blue-500/15 text-blue-400'}`}>
                      {s.type === 'morning' ? '🌅 Ranní' : '🌆 Odpolední'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
            <div className="glass-card p-8 text-center">
              <p className="text-white/40">Žádné nadcházející směny.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-white/40">Žádné žádosti ke schválení.</p>
            </div>
          ) : requests.map(r => (
            <div key={r.id} className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{getUserAvatar(r.employeeId)}</span>
                <div className="flex-1">
                  <p className="font-semibold text-white">{getUserName(r.employeeId)}</p>
                  <p className="text-sm text-white/60 mt-0.5">
                    {r.requestType === 'day_off' ? 'Volno' : r.requestType === 'swap' ? 'Výměna směny' : 'Extra směna'} · {r.date}
                  </p>
                  {r.note && <p className="text-sm text-white/60 mt-2 bg-white/[0.06] p-3 rounded-2xl">{r.note}</p>}
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  r.status === 'approved' ? 'bg-[#C8F542]/15 text-[#C8F542]' :
                  r.status === 'rejected' ? 'bg-red-500/15 text-red-400' :
                  'bg-orange-500/15 text-orange-400'
                }`}>
                  {r.status === 'approved' ? '✅ Schváleno' : r.status === 'rejected' ? '❌ Zamítnuto' : '⏳ Čeká'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
