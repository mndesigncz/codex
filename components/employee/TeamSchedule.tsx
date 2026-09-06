'use client';

// Kdo má kdy směnu — náhled pro zaměstnance.
//
// Doteď viděl každý jen sebe, takže „kdo se mnou zítra je?" se řešilo přes
// chat nebo vůbec. Tady je to vidět rovnou: den po dni, kdo nastupuje a kdy,
// se svojí směnou zvýrazněnou.
//
// Vidí se jen jména, časy a typ směny. Sazby, hodiny ani cokoli, co je věcí
// vedení, tudy neprochází — a celý náhled jde v nastavení směn vypnout.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { pragueToday, dayPlus } from '@/lib/pragueTime';

interface TeamShift {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeAvatar: string | null;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  typeLabel?: string;
  typeColor?: string;
  isMine: boolean;
}

const DAYS_AHEAD = 13;

export default function TeamSchedule() {
  const [shifts, setShifts] = useState<TeamShift[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/shifts?team=1')
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        if (d?.enabled === false) { setEnabled(false); setShifts([]); return; }
        setShifts(Array.isArray(d?.shifts) ? d.shifts : []);
      })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, []);

  const today = pragueToday();

  // Čtrnáct dní dopředu. Dál dopředu se rozvrh stejně ještě mění, a delší
  // seznam se na telefonu nedá projít.
  const days = useMemo(() => {
    const last = dayPlus(today, DAYS_AHEAD);
    const byDay = new Map<string, TeamShift[]>();
    for (const s of shifts ?? []) {
      if (s.date < today || s.date > last) continue;
      const list = byDay.get(s.date) ?? [];
      list.push(s);
      byDay.set(s.date, list);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({
        date,
        list: list.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')),
      }));
  }, [shifts, today]);

  if (!enabled || err) return null;

  const label = (d: string) => {
    if (d === today) return 'Dnes';
    if (d === dayPlus(today, 1)) return 'Zítra';
    return new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'short' });
  };

  return (
    <section className="glass-card p-4 sm:p-5">
      <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap mb-3 min-w-0">
        <Icon name="users" size={16} className="text-black/45 shrink-0 translate-y-0.5" />
        <h3 className="font-bold tracking-tight text-[#16181A] shrink-0">Kdo má směnu</h3>
        <p className="text-xs text-black/40 min-w-0 basis-full sm:basis-auto">Nejbližší dva týdny</p>
      </div>

      {shifts === null && <p className="text-sm text-black/40 py-4 text-center">Načítám…</p>}
      {shifts !== null && days.length === 0 && (
        <p className="text-sm text-black/45 py-4 text-center">Na nejbližší dva týdny zatím není rozvrh.</p>
      )}

      <div className="divide-y divide-black/[0.06]">
        {days.map(({ date, list }) => (
          <div key={date} className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
            <p className={`shrink-0 sm:w-32 text-xs font-semibold ${date === today ? 'text-[#5B7A08]' : 'text-black/45'}`}>
              {label(date)}
            </p>
            <div className="flex flex-wrap gap-1.5 min-w-0">
              {list.map(s => (
                <span key={s.id}
                  className={`tap-target-sm inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs max-w-full ${
                    s.isMine
                      ? 'bg-[#C8F542]/25 text-[#3E5406] font-semibold ring-1 ring-[#C8F542]/50'
                      : 'bg-black/[0.045] text-black/65'}`}>
                  <span className="shrink-0">{s.employeeAvatar ?? '👤'}</span>
                  <span className="truncate min-w-0">{s.isMine ? 'Ty' : s.employeeName}</span>
                  <span className="shrink-0 tabular-nums opacity-70 whitespace-nowrap">{s.startTime}–{s.endTime}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
