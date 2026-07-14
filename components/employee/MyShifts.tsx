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

interface Props {
  user: { id?: string; name?: string | null };
}

export default function MyShifts({ user }: Props) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = parseInt(user.id ?? '0');

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/shifts?employeeId=${userId}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setShifts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  const today = new Date().toISOString().split('T')[0];
  const upcoming = shifts.filter(s => s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = shifts.filter(s => s.date < today).sort((a, b) => b.date.localeCompare(a.date));

  const totalHours = shifts.length * 8; // 8h per shift estimate

  const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'short' });

  const shiftLabel = (type: string) => type === 'morning' ? '🌅 Ranní' : type === 'afternoon' ? '🌆 Odpolední' : '🔄 Flexibilní';

  return (
    <div className="p-6 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-matcha-50 border-2 border-matcha-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-matcha-600 font-medium">Nadcházející</p>
          <p className="text-2xl font-bold text-matcha-700 mt-1">{upcoming.length}</p>
        </div>
        <div className="bg-tea-50 border-2 border-tea-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-tea-600 font-medium">Odpracované (odhad)</p>
          <p className="text-2xl font-bold text-tea-700 mt-1">{past.length * 8}h</p>
        </div>
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-amber-600 font-medium">Celkem směn</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{shifts.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="text-4xl animate-spin">⏳</div></div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border-2 border-tea-100 p-5">
            <h3 className="font-bold text-tea-800 mb-4">📅 Nadcházející směny</h3>
            {upcoming.length === 0 ? (
              <p className="text-tea-400 text-sm">Žádné nadcházející směny.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.slice(0, 8).map(s => {
                  const isToday = s.date === today;
                  return (
                    <div key={s.id} className={`flex items-center gap-3 p-3 rounded-xl ${isToday ? 'bg-matcha-50 border-2 border-matcha-200' : 'bg-tea-50'}`}>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isToday ? 'bg-matcha-100' : 'bg-tea-100'}`}>
                        {s.type === 'morning' ? '🌅' : '🌆'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-tea-800 text-sm">{formatDate(s.date)}</p>
                          {isToday && <span className="text-xs bg-matcha-500 text-white px-2 py-0.5 rounded-full font-medium">Dnes</span>}
                        </div>
                        <p className="text-xs text-tea-400">{s.startTime} – {s.endTime} · {shiftLabel(s.type)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {past.length > 0 && (
            <div className="bg-white rounded-2xl border-2 border-tea-100 p-5">
              <h3 className="font-bold text-tea-800 mb-4">📋 Minulé směny</h3>
              <div className="space-y-2">
                {past.slice(0, 5).map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 bg-tea-50 rounded-xl opacity-70">
                    <span className="text-lg">{s.type === 'morning' ? '🌅' : '🌆'}</span>
                    <div className="flex-1">
                      <p className="text-sm text-tea-700 font-medium">{formatDate(s.date)}</p>
                      <p className="text-xs text-tea-400">{s.startTime} – {s.endTime}</p>
                    </div>
                    <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">✓ Splněno</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
