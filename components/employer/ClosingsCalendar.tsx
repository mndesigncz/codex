'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../Icons';
import { useCurrency, useMoney } from '../CurrencyProvider';

type Person = { id: number; name: string; avatar: string | null; hadClosing?: boolean };
type Day = {
  onShift: Person[];
  closedBy: Person[];
  hasClosing: boolean;
  missing: boolean;
  revenue?: number;
};
type Days = Record<string, Day>;

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const WD_MON = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const WD_SUN = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const pad = (n: number) => String(n).padStart(2, '0');

// A day cell is tiny — show revenue as "12,4k" instead of a full money string.
const compact = (n: number) => {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return String(Math.round(n));
};

type State = 'done' | 'missing' | 'pending' | 'idle';

const stateOf = (day: Day | undefined, date: string, today: string): State => {
  if (!day) return 'idle';
  if (day.hasClosing) return 'done';
  if (day.onShift.length === 0) return 'idle';
  return date < today ? 'missing' : 'pending';
};

const TONE: Record<State, string> = {
  done: 'bg-[#C8F542]/[0.14] border-[#C8F542]/45 hover:brightness-95',
  missing: 'bg-red-500/[0.08] border-red-500/30 hover:brightness-95',
  pending: 'bg-amber-500/[0.10] border-amber-500/30 hover:brightness-95',
  idle: 'bg-black/[0.015] border-transparent',
};

const DOT: Record<State, string> = {
  done: 'bg-[#8FB811]',
  missing: 'bg-red-500',
  pending: 'bg-amber-500',
  idle: 'bg-transparent',
};

// Month grid of closings: which days are done, which are missing though someone
// worked, and how much each day took. Selecting a day lifts it to the parent so
// the closings list can scope itself to it.
export default function ClosingsCalendar({ selectedDate, onSelectDate, reloadKey = 0 }: {
  selectedDate?: string | null;
  onSelectDate: (date: string) => void;
  reloadKey?: number;
}) {
  const { weekStart } = useCurrency();
  const money = useMoney();
  const [month, setMonth] = useState(ymOf(new Date()));
  const [days, setDays] = useState<Days>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch(`/api/closings/calendar?month=${month}`).then(r => r.json());
      setDays(d.days && typeof d.days === 'object' ? d.days : {});
    } catch { setDays({}); }
    setLoading(false);
  }, [month, reloadKey]);
  useEffect(() => { load(); }, [load]);

  // Keep the grid on the month of whatever day the parent has selected.
  useEffect(() => {
    if (selectedDate && selectedDate.slice(0, 7) !== month) setMonth(selectedDate.slice(0, 7));
  }, [selectedDate, month]);

  const [y, m] = month.split('-').map(Number);
  const wd = weekStart === 0 ? WD_SUN : WD_MON;
  const firstDow = new Date(y, m - 1, 1).getDay();            // 0=Sun..6=Sat
  const lead = (firstDow - weekStart + 7) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const step = (delta: number) => setMonth(ymOf(new Date(y, m - 1 + delta, 1)));

  const dates = Object.keys(days).filter(d => d.slice(0, 7) === month);
  const doneCount = dates.filter(d => days[d].hasClosing).length;
  const missingCount = dates.filter(d => stateOf(days[d], d, today) === 'missing').length;
  const monthRevenue = dates.reduce((s, d) => s + (days[d].revenue ?? 0), 0);

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <button onClick={() => step(-1)} aria-label="Předchozí měsíc"
          className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.05] transition">
          <Icon name="chevron" size={16} className="rotate-90" />
        </button>
        <h3 className="font-bold tracking-tight text-[#16181A] capitalize truncate">{MONTHS[m - 1]} {y}</h3>
        <button onClick={() => step(1)} aria-label="Další měsíc"
          className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.05] transition">
          <Icon name="chevron" size={16} className="-rotate-90" />
        </button>
      </div>

      <p className="text-center text-[11px] text-black/45 mb-3 tabular-nums">
        {doneCount} {doneCount === 1 ? 'uzávěrka' : doneCount >= 2 && doneCount <= 4 ? 'uzávěrky' : 'uzávěrek'}
        {missingCount > 0 && <span className="text-red-600 font-semibold"> · {missingCount} chybí</span>}
        {monthRevenue > 0 && <span> · tržba {money(monthRevenue)}</span>}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] text-black/50">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#C8F542]" /> Hotová</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Chybí</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Čeká</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-56">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {wd.map(w => <div key={w} className="text-center text-[11px] font-semibold text-black/35 pb-1">{w}</div>)}
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const day = days[date];
            const state = stateOf(day, date, today);
            const dnum = parseInt(date.slice(8, 10), 10);
            const isToday = date === today;
            const active = selectedDate === date;
            const revenue = day?.revenue ?? 0;
            const title = day
              ? `${dnum}. ${m}. — ${state === 'done' ? `uzávěrka hotová${revenue > 0 ? `, tržba ${money(revenue)}` : ''}` : state === 'missing' ? 'chybí uzávěrka' : state === 'pending' ? 'uzávěrka zatím nevyplněná' : 'bez směny'}`
              : undefined;
            return (
              <button
                key={i}
                type="button"
                title={title}
                onClick={() => onSelectDate(date)}
                className={`aspect-square min-w-0 rounded-xl border p-1 flex flex-col items-center justify-start gap-0.5 transition ${TONE[state]} ${active ? 'ring-2 ring-[#16181A]/40' : ''}`}
              >
                <span className={`text-[11px] font-semibold leading-none mt-0.5 ${isToday ? 'text-[#16181A] underline underline-offset-2' : 'text-black/55'}`}>
                  {dnum}
                </span>
                {state === 'done' && revenue > 0 && (
                  <span className="text-[9px] leading-none font-semibold text-[#5B7A08] tabular-nums truncate max-w-full">{compact(revenue)}</span>
                )}
                {day && day.onShift.length > 0 && state !== 'done' && (
                  <span className="text-[9px] leading-none text-black/40 tabular-nums">{day.onShift.length}×</span>
                )}
                <span className={`mt-auto w-1.5 h-1.5 rounded-full ${DOT[state]}`} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
