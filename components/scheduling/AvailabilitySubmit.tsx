'use client';

import { useState, useEffect, useMemo } from 'react';
import { Icon } from '../Icons';

interface Props {
  user: { id?: string; name?: string | null; avatar?: string; role?: string };
}

type DayState = string; // 'available' | 'off' | legacy 'morning'/'afternoon' | 'type:<id>'

const CZ_DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const SHIFTS = [
  { id: 'morning', label: 'Ranní' },
  { id: 'afternoon', label: 'Odpolední' },
  { id: 'flexible', label: 'Flexibilní' },
];

// One tone per shift type, cycled by position — the day choices mirror the
// team's OWN shift types, nothing is hard-coded to "ranní/odpolední".
const TYPE_TONES = [
  { cls: 'bg-[#C8F542]/25 border-[#C8F542]/50 text-[#5B7A08] hover:bg-[#C8F542]/35', dot: 'bg-[#C8F542] ring-1 ring-[#C8F542]/60' },
  { cls: 'bg-blue-500/20 border-blue-500/40 text-blue-700 hover:bg-blue-500/30', dot: 'bg-blue-500 ring-1 ring-blue-500/50' },
  { cls: 'bg-purple-500/20 border-purple-500/40 text-purple-700 hover:bg-purple-500/30', dot: 'bg-purple-500 ring-1 ring-purple-500/50' },
  { cls: 'bg-amber-500/20 border-amber-500/40 text-amber-700 hover:bg-amber-500/30', dot: 'bg-amber-500 ring-1 ring-amber-500/50' },
  { cls: 'bg-teal-500/20 border-teal-500/40 text-teal-700 hover:bg-teal-500/30', dot: 'bg-teal-500 ring-1 ring-teal-500/50' },
];
const AVAILABLE_META = {
  label: 'Dostupný',
  cls: 'bg-black/[0.03] border-black/[0.10] text-[#16181A] hover:bg-black/[0.06]',
  dot: 'bg-black/15 ring-1 ring-black/20',
};
const OFF_META = {
  label: 'Nemůžu',
  cls: 'bg-red-500/20 border-red-500/40 text-red-600 line-through hover:bg-red-500/30',
  dot: 'bg-red-500 ring-1 ring-red-500/50',
};

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
}
function buildGrid(month: string) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function AvailabilitySubmit({ user }: Props) {
  const now = new Date();
  const currentMonth = ym(now);
  const nextMonth = ym(new Date(now.getFullYear(), now.getMonth() + 1, 1));

  const [month, setMonth] = useState(nextMonth);
  const [dayStates, setDayStates] = useState<Record<string, DayState>>({});
  const [preferredShift, setPreferredShift] = useState<string>('flexible');
  const [maxShifts, setMaxShifts] = useState<string>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [existing, setExisting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const [types, setTypes] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/shift-types').then((r) => r.json())
      .then((d) => setTypes((d.shiftTypes ?? []).map((t: any) => ({ id: t.id, name: t.name }))))
      .catch(() => {});
  }, []);
  // The tap cycle follows the team's shift types; legacy binary only when none exist.
  const stateList: DayState[] = useMemo(
    () => (types.length
      ? ['available', ...types.map((t) => `type:${t.id}`), 'off']
      : ['available', 'morning', 'afternoon', 'off']),
    [types],
  );
  const metaOf = (st: DayState) => {
    if (st === 'available') return AVAILABLE_META;
    if (st === 'off') return OFF_META;
    if (st === 'morning') return { ...TYPE_TONES[0], label: 'Jen ranní' };
    if (st === 'afternoon') return { ...TYPE_TONES[1], label: 'Jen odpolední' };
    const id = parseInt(st.slice(5));
    const idx = types.findIndex((t) => t.id === id);
    return {
      ...TYPE_TONES[(idx < 0 ? 0 : idx) % TYPE_TONES.length],
      label: `Jen ${types.find((t) => t.id === id)?.name ?? 'směna'}`,
    };
  };

  const grid = useMemo(() => buildGrid(month), [month]);
  const todayStr = ym(now) === month ? `${month}-${String(now.getDate()).padStart(2, '0')}` : null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setConfirmed(false);
    fetch(`/api/availability?mine=1&month=${month}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (data && data.id) {
          setExisting(true);
          const map: Record<string, DayState> = {};
          const dp = (data.dayPreferences ?? {}) as Record<string, string>;
          Object.entries(dp).forEach(([date, v]) => {
            if (v === 'morning' || v === 'afternoon' || v === 'off' || /^type:\d+$/.test(v)) map[date] = v;
          });
          (data.unavailableDates ?? []).forEach((date: string) => {
            if (!map[date]) map[date] = 'off';
          });
          setDayStates(map);
          setPreferredShift(data.preferredShift ?? 'flexible');
          setMaxShifts(data.maxShifts != null ? String(data.maxShifts) : '');
          setNote(data.note ?? '');
        } else {
          setExisting(false);
          setDayStates({});
          setPreferredShift('flexible');
          setMaxShifts('');
          setNote('');
        }
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month]);

  const stateOf = (date: string): DayState => dayStates[date] ?? 'available';

  const cycleDay = (date: string) => {
    setConfirmed(false);
    setDayStates((prev) => {
      const cur = prev[date] ?? 'available';
      const i = stateList.indexOf(cur);
      const next = stateList[(i < 0 ? 0 : i + 1) % stateList.length];
      const copy = { ...prev };
      if (next === 'available') delete copy[date];
      else copy[date] = next;
      return copy;
    });
  };

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      // day_preferences: full map of non-default states
      const dayPreferences: Record<string, string> = { ...dayStates };
      const unavailableDates = Object.entries(dayStates)
        .filter(([, v]) => v === 'off')
        .map(([d]) => d)
        .sort();
      const res = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          unavailableDates,
          dayPreferences,
          preferredShift,
          maxShifts: maxShifts === '' ? null : parseInt(maxShifts),
          note: note.trim() || null,
        }),
      });
      if (res.ok) {
        setExisting(true);
        setConfirmed(true);
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || 'Dostupnost se nepodařilo odeslat.');
      }
    } catch {
      setErr('Nepodařilo se spojit se serverem.');
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    grid.forEach((cell) => {
      if (!cell) return;
      const st = dayStates[cell] ?? 'available';
      c.set(st, (c.get(st) ?? 0) + 1);
    });
    return c;
  }, [grid, dayStates]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A]">Moje dostupnost</h1>
        <p className="text-black/45 mt-1">
          Klepnutím na den cyklicky nastav:{' '}
          <span className="text-black/70 font-medium">
            {stateList.map((st) => metaOf(st).label.toLowerCase()).join(' → ')}
          </span>.
        </p>
      </div>

      {/* Month selector — navigate freely into the future (no limit), but not
          before the current month (submitting availability for the past makes
          no sense). */}
      {(() => {
        const [my, mm] = month.split('-').map(Number);
        const prevM = ym(new Date(my, mm - 2, 1));
        const nextM = ym(new Date(my, mm, 1));
        const atFloor = month <= currentMonth;
        return (
          <div className="flex items-center gap-1 glass rounded-full p-1 w-fit">
            <button
              onClick={() => !atFloor && setMonth(prevM)}
              disabled={atFloor}
              aria-label="Předchozí měsíc"
              className="rounded-full w-9 h-9 flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <Icon name="chevron" size={16} className="rotate-90" />
            </button>
            <span className="px-3 min-w-[9.5rem] text-center text-sm font-semibold capitalize text-[#16181A]">{monthLabel(month)}</span>
            <button
              onClick={() => setMonth(nextM)}
              aria-label="Další měsíc"
              className="rounded-full w-9 h-9 flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.06] transition"
            >
              <Icon name="chevron" size={16} className="-rotate-90" />
            </button>
          </div>
        );
      })()}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : (
        <>
          {/* Calendar */}
          <div className="glass-card p-3 sm:p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-bold text-[#16181A] capitalize flex items-center gap-2">
                <Icon name="calendar" size={20} />
                {monthLabel(month)}
              </h2>
              <div className="flex items-center gap-3 text-xs flex-wrap">
                {stateList.map((st) => (
                  <span key={st} className="flex items-center gap-1.5 text-black/55">
                    <span className={`h-3 w-3 rounded-md ${metaOf(st).dot}`} /> {metaOf(st).label}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-black/40 mb-2">
              Denní volby jsou závazné — „Jen …" a „Nemůžu" generátor vždy dodrží.
              Typy směn se berou z nastavení rozvrhu; celková preference níže je jen orientační.
            </p>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
              {CZ_DAYS.map((d) => (
                <div key={d} className="text-center text-[11px] font-medium text-black/35 py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {grid.map((cell, i) => {
                if (!cell) return <div key={i} />;
                const day = parseInt(cell.split('-')[2]);
                const s = stateOf(cell);
                const meta = metaOf(s);
                const isToday = cell === todayStr;
                return (
                  <button
                    key={cell}
                    onClick={() => cycleDay(cell)}
                    title={meta.label}
                    className={`tap-target-sm aspect-square rounded-xl text-sm font-medium flex items-center justify-center transition-all duration-200 border ${meta.cls} ${
                      isToday ? 'ring-2 ring-[#C8F542]/60' : ''
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-black/45 mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {stateList.map((st) => (
                <span key={st}>
                  {metaOf(st).label}: <span className="text-black/70 font-medium">{counts.get(st) ?? (st === 'available' ? grid.filter(Boolean).length - Array.from(counts.values()).reduce((a, b) => a + b, 0) : 0)}</span>
                </span>
              ))}
            </p>
          </div>

          {/* Preferences */}
          <div className="glass-card p-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-black/70 mb-2">Preferovaná směna (obecně — nezávazné)</label>
              <div className="flex gap-1 glass rounded-full p-1 w-fit max-w-full overflow-x-auto">
                {SHIFTS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setPreferredShift(s.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                      preferredShift === s.id
                        ? 'bg-[#C8F542] text-black font-semibold'
                        : 'text-black/60 hover:text-black hover:bg-black/[0.06]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-2">
                Maximální počet směn <span className="text-black/35">(nepovinné)</span>
              </label>
              <input
                type="number" inputMode="numeric"
                min={0}
                value={maxShifts}
                onChange={(e) => setMaxShifts(e.target.value)}
                placeholder="např. 12"
                className="w-40 max-w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black/70 mb-2">
                Poznámka <span className="text-black/35">(nepovinné)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Např. preferuji víkendy, ve středu mám školu…"
                className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-colors resize-none"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex flex-wrap items-center gap-3">
            {err && (
              <p className="w-full text-sm font-medium text-red-600 flex items-center gap-1.5 mb-2">
                <Icon name="warning" size={15} /> {err}
              </p>
            )}
            <button
              onClick={submit}
              disabled={saving}
              className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2.5 whitespace-nowrap hover:brightness-105 transition disabled:opacity-50"
            >
              {saving ? 'Ukládám…' : existing ? 'Aktualizovat dostupnost' : 'Odeslat dostupnost'}
            </button>
            {confirmed && (
              <span className="flex items-center gap-1.5 text-[#5B7A08] text-sm font-medium">
                <Icon name="check" size={18} /> Uloženo!
              </span>
            )}
            {existing && !confirmed && (
              <span className="text-black/45 text-sm">Dostupnost už jsi odeslal/a — můžeš ji upravit.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
