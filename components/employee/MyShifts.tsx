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

  // Client-side iCalendar export of upcoming shifts (opens in Apple/Google Calendar).
  const exportIcs = () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pangea//Smeny//CS', 'CALSCALE:GREGORIAN',
    ];
    for (const s of upcoming) {
      const d = s.date.replace(/-/g, '');
      const st = (s.startTime || '08:00').replace(':', '') + '00';
      const en = (s.endTime || '16:00').replace(':', '') + '00';
      lines.push(
        'BEGIN:VEVENT',
        `UID:pangea-shift-${s.id}@pangea`,
        `DTSTART;TZID=Europe/Prague:${d}T${st}`,
        `DTEND;TZID=Europe/Prague:${d}T${en}`,
        'SUMMARY:Směna — Pangea',
        `DESCRIPTION:${s.startTime}–${s.endTime}`,
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'moje-smeny.ics';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-6 hover:bg-black/[0.05] transition-all duration-300">
          <p className="text-xs uppercase tracking-wider text-black/45">Nadcházející</p>
          <p className="text-3xl font-bold tracking-tight text-[#16181A] mt-2">{upcoming.length}</p>
          <div className="mt-3 h-1 rounded-full bg-black/[0.06] overflow-hidden">
            <div className="h-1 rounded-full bg-[#C8F542]" style={{ width: `${shifts.length ? Math.min(100, (upcoming.length / shifts.length) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="glass-card p-6 hover:bg-black/[0.05] transition-all duration-300">
          <p className="text-xs uppercase tracking-wider text-black/45">Odpracované (odhad)</p>
          <p className="text-3xl font-bold tracking-tight text-[#16181A] mt-2">{past.length * 8}h</p>
          <div className="mt-3 h-1 rounded-full bg-black/[0.06] overflow-hidden">
            <div className="h-1 rounded-full bg-[#C8F542]" style={{ width: `${totalHours ? Math.min(100, ((past.length * 8) / totalHours) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="glass-card p-6 hover:bg-black/[0.05] transition-all duration-300">
          <p className="text-xs uppercase tracking-wider text-black/45">Celkem směn</p>
          <p className="text-3xl font-bold tracking-tight text-[#16181A] mt-2">{shifts.length}</p>
          <div className="mt-3 h-1 rounded-full bg-black/[0.06] overflow-hidden">
            <div className="h-1 rounded-full bg-[#C8F542]" style={{ width: shifts.length ? '100%' : '0%' }} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : (
        <>
          <div className="glass-card p-6 hover:bg-black/[0.05] transition-all duration-300">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <h3 className="font-bold tracking-tight text-[#16181A]">📅 Nadcházející směny</h3>
              {upcoming.length > 0 && (
                <button onClick={exportIcs}
                  className="rounded-full glass border border-black/10 text-[#16181A] px-4 py-2 text-xs font-medium hover:bg-black/[0.05] transition whitespace-nowrap shrink-0">
                  Do kalendáře (.ics) ↓
                </button>
              )}
            </div>
            {upcoming.length === 0 ? (
              <p className="text-black/45 text-sm">Žádné nadcházející směny.</p>
            ) : (
              <div className="divide-y divide-black/[0.06]">
                {upcoming.slice(0, 8).map(s => {
                  const isToday = s.date === today;
                  return (
                    <div key={s.id} className={`flex items-center gap-3 p-3 rounded-2xl transition-colors hover:bg-black/[0.03] ${isToday ? 'bg-[#C8F542]/10' : ''}`}>
                      <div className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-lg ${isToday ? 'bg-[#C8F542]/15' : 'bg-black/[0.04]'}`}>
                        {s.type === 'morning' ? '🌅' : '🌆'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-[#16181A] text-sm truncate min-w-0">{formatDate(s.date)}</p>
                          {isToday && <span className="flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium bg-[#C8F542]/15 text-[#5B7A08]">Dnes</span>}
                        </div>
                        <p className="text-xs text-black/45 truncate">{s.startTime} – {s.endTime} · {shiftLabel(s.type)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {past.length > 0 && (
            <div className="glass-card p-6 hover:bg-black/[0.05] transition-all duration-300">
              <h3 className="font-bold tracking-tight text-[#16181A] mb-4">📋 Minulé směny</h3>
              <div className="divide-y divide-black/[0.06]">
                {past.slice(0, 5).map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl opacity-70 transition-colors hover:bg-black/[0.03]">
                    <span className="text-lg flex-shrink-0">{s.type === 'morning' ? '🌅' : '🌆'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#16181A] font-medium truncate">{formatDate(s.date)}</p>
                      <p className="text-xs text-black/45 truncate">{s.startTime} – {s.endTime}</p>
                    </div>
                    <span className="flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium bg-[#C8F542]/15 text-[#5B7A08]">✓ Splněno</span>
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
