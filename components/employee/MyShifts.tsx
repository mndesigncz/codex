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
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
          <p className="text-xs uppercase tracking-wider text-white/40">Nadcházející</p>
          <p className="text-3xl font-bold tracking-tight text-white mt-2">{upcoming.length}</p>
          <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-1 rounded-full bg-[#C8F542]" style={{ width: `${shifts.length ? Math.min(100, (upcoming.length / shifts.length) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
          <p className="text-xs uppercase tracking-wider text-white/40">Odpracované (odhad)</p>
          <p className="text-3xl font-bold tracking-tight text-white mt-2">{past.length * 8}h</p>
          <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-1 rounded-full bg-[#C8F542]" style={{ width: `${totalHours ? Math.min(100, ((past.length * 8) / totalHours) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
          <p className="text-xs uppercase tracking-wider text-white/40">Celkem směn</p>
          <p className="text-3xl font-bold tracking-tight text-white mt-2">{shifts.length}</p>
          <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-1 rounded-full bg-[#C8F542]" style={{ width: shifts.length ? '100%' : '0%' }} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="text-4xl animate-spin">⏳</div></div>
      ) : (
        <>
          <div className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
            <h3 className="font-bold tracking-tight text-white mb-4">📅 Nadcházející směny</h3>
            {upcoming.length === 0 ? (
              <p className="text-white/40 text-sm">Žádné nadcházející směny.</p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {upcoming.slice(0, 8).map(s => {
                  const isToday = s.date === today;
                  return (
                    <div key={s.id} className={`flex items-center gap-3 p-3 rounded-2xl transition-colors hover:bg-white/[0.04] ${isToday ? 'bg-[#C8F542]/10' : ''}`}>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isToday ? 'bg-[#C8F542]/15' : 'bg-white/[0.06]'}`}>
                        {s.type === 'morning' ? '🌅' : '🌆'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white text-sm">{formatDate(s.date)}</p>
                          {isToday && <span className="rounded-full px-3 py-1 text-xs font-medium bg-[#C8F542]/15 text-[#C8F542]">Dnes</span>}
                        </div>
                        <p className="text-xs text-white/40">{s.startTime} – {s.endTime} · {shiftLabel(s.type)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {past.length > 0 && (
            <div className="glass-card p-6 hover:bg-white/[0.08] transition-all duration-300">
              <h3 className="font-bold tracking-tight text-white mb-4">📋 Minulé směny</h3>
              <div className="divide-y divide-white/[0.06]">
                {past.slice(0, 5).map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl opacity-70 transition-colors hover:bg-white/[0.04]">
                    <span className="text-lg">{s.type === 'morning' ? '🌅' : '🌆'}</span>
                    <div className="flex-1">
                      <p className="text-sm text-white font-medium">{formatDate(s.date)}</p>
                      <p className="text-xs text-white/40">{s.startTime} – {s.endTime}</p>
                    </div>
                    <span className="rounded-full px-3 py-1 text-xs font-medium bg-[#C8F542]/15 text-[#C8F542]">✓ Splněno</span>
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
