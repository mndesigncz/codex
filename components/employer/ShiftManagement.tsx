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
    <div className="p-6 space-y-5">
      {/* Tabs */}
      <div className="flex gap-2 bg-tea-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('shifts')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'shifts' ? 'bg-white shadow text-tea-800' : 'text-tea-500 hover:text-tea-700'}`}
        >
          📅 Směny ({shifts.length})
        </button>
        <button
          onClick={() => setTab('requests')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'requests' ? 'bg-white shadow text-tea-800' : 'text-tea-500 hover:text-tea-700'}`}
        >
          📨 Žádosti ({requests.filter(r => r.status === 'pending').length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-4xl animate-spin">⏳</div>
        </div>
      ) : tab === 'shifts' ? (
        <div className="space-y-4">
          {Object.keys(grouped).slice(0, 7).map(date => (
            <div key={date} className="bg-white rounded-2xl border-2 border-tea-100 p-5">
              <h3 className="font-bold text-tea-800 mb-3 capitalize">{formatDate(date)}</h3>
              <div className="space-y-2">
                {grouped[date].map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 bg-tea-50 rounded-xl">
                    <span className="text-xl">{getUserAvatar(s.employeeId)}</span>
                    <div className="flex-1">
                      <p className="font-medium text-tea-800 text-sm">{getUserName(s.employeeId)}</p>
                      <p className="text-xs text-tea-400">{s.startTime} – {s.endTime}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.type === 'morning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {s.type === 'morning' ? '🌅 Ranní' : '🌆 Odpolední'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
            <div className="bg-white rounded-2xl border-2 border-tea-100 p-8 text-center">
              <p className="text-tea-400">Žádné nadcházející směny.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-tea-100 p-8 text-center">
              <p className="text-tea-400">Žádné žádosti ke schválení.</p>
            </div>
          ) : requests.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border-2 border-tea-100 p-5">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{getUserAvatar(r.employeeId)}</span>
                <div className="flex-1">
                  <p className="font-semibold text-tea-800">{getUserName(r.employeeId)}</p>
                  <p className="text-sm text-tea-500 mt-0.5">
                    {r.requestType === 'day_off' ? 'Volno' : r.requestType === 'swap' ? 'Výměna směny' : 'Extra směna'} · {r.date}
                  </p>
                  {r.note && <p className="text-sm text-tea-600 mt-2 bg-tea-50 p-2 rounded-lg">{r.note}</p>}
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  r.status === 'approved' ? 'bg-green-100 text-green-700' :
                  r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'
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
