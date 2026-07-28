'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../Icons';
import { useCurrency } from '../CurrencyProvider';
import ShiftReviewModal from './ShiftReviewModal';

interface Staff { id: number; name: string; avatar: string | null; reviewed: boolean; rating: number; flagged: boolean }
interface Day { date: string; staff: Staff[]; pending: number }

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const WD_MON = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const WD_SUN = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const pad = (n: number) => String(n).padStart(2, '0');

// Month view of who worked each day and whether their shift is already rated.
// Clicking a day lists that day's staff; clicking a person opens the review.
export default function ShiftReviewCalendar({ onSaved }: { onSaved?: () => void }) {
  const { weekStart } = useCurrency();
  const [month, setMonth] = useState(ymOf(new Date()));
  const [days, setDays] = useState<Record<string, Day>>({});
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [rating, setRating] = useState<{ person: Staff; date: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch(`/api/shift-reviews?month=${month}`).then(r => r.json());
      const map: Record<string, Day> = {};
      if (Array.isArray(d?.days)) d.days.forEach((x: Day) => { map[x.date] = x; });
      setDays(map);
    } catch { setDays({}); }
    setLoading(false);
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const [y, m] = month.split('-').map(Number);
  const wd = weekStart === 0 ? WD_SUN : WD_MON;
  const firstDow = new Date(y, m - 1, 1).getDay();
  const lead = (firstDow - weekStart + 7) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const step = (delta: number) => { setSel(null); setMonth(ymOf(new Date(y, m - 1 + delta, 1))); };
  const detail = sel ? days[sel] : null;
  const dayFlagged = (d: Day) => d.staff.some(s => s.flagged);

  return (
    <div className="glass-card p-4 sm:p-5">
      {/* Header + month nav */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <button onClick={() => step(-1)} className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.05] transition" aria-label="Předchozí měsíc">
          <Icon name="chevron" size={16} className="rotate-90" />
        </button>
        <h3 className="font-bold tracking-tight text-[#16181A] capitalize">{MONTHS[m - 1]} {y}</h3>
        <button onClick={() => step(1)} className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.05] transition" aria-label="Další měsíc">
          <Icon name="chevron" size={16} className="-rotate-90" />
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] text-black/50">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#C8F542]" /> Ohodnoceno</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Čeká na hodnocení</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Něco je špatně</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-56"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {wd.map(w => <div key={w} className="text-center text-[11px] font-semibold text-black/35 pb-1">{w}</div>)}
            {cells.map((date, i) => {
              if (!date) return <div key={i} />;
              const day = days[date];
              const dnum = parseInt(date.slice(8, 10));
              const isToday = date === todayStr;
              const flagged = day ? dayFlagged(day) : false;
              const tone = !day
                ? 'bg-black/[0.015] border-transparent'
                : flagged
                  ? 'bg-red-500/[0.08] border-red-500/30'
                  : day.pending > 0
                    ? 'bg-amber-500/[0.08] border-amber-500/30'
                    : 'bg-[#C8F542]/[0.12] border-[#C8F542]/40';
              const active = sel === date;
              return (
                <button key={i} onClick={() => day ? setSel(active ? null : date) : undefined}
                  className={`aspect-square rounded-xl border p-1 flex flex-col items-center justify-start gap-0.5 transition ${tone} ${active ? 'ring-2 ring-[#16181A]/40' : ''} ${day ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}>
                  <span className={`text-[11px] font-semibold leading-none mt-0.5 ${isToday ? 'text-[#16181A] underline underline-offset-2' : 'text-black/55'}`}>{dnum}</span>
                  {day && (
                    <div className="flex flex-wrap justify-center gap-0.5 leading-none">
                      {day.staff.slice(0, 3).map(p => (
                        <span key={p.id} className="text-[11px]" title={`${p.name}${p.reviewed ? ` · ${p.rating}★` : ' · nehodnoceno'}`}>{p.avatar || '👤'}</span>
                      ))}
                      {day.staff.length > 3 && <span className="text-[9px] text-black/40">+{day.staff.length - 3}</span>}
                    </div>
                  )}
                  {day && (
                    <span className={`mt-auto w-1.5 h-1.5 rounded-full ${flagged ? 'bg-red-500' : day.pending > 0 ? 'bg-amber-500' : 'bg-[#8FB811]'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Day detail — pick a person to rate */}
          {detail && sel && (
            <div className="mt-4 rounded-2xl bg-black/[0.02] border border-black/[0.06] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-bold tracking-tight text-[#16181A] capitalize">
                  {new Date(sel + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <span className={`text-xs font-medium ${detail.pending > 0 ? 'text-amber-600' : 'text-[#5B7A08]'}`}>
                  {detail.pending > 0 ? `${detail.pending} k ohodnocení` : 'Vše ohodnoceno'}
                </span>
              </div>
              <div className="space-y-2">
                {detail.staff.map(p => (
                  <button key={p.id} onClick={() => setRating({ person: p, date: sel })}
                    className={`w-full flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition hover:bg-black/[0.03] ${p.flagged ? 'border-red-500/40 bg-red-500/[0.06]' : 'border-black/[0.06] bg-white/40'}`}>
                    <span className="text-lg flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60 shrink-0">{p.avatar || '👤'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-[#16181A] truncate">{p.name}</span>
                      <span className={`block text-xs ${p.reviewed ? 'text-black/45' : 'text-amber-600'}`}>
                        {p.reviewed ? `Ohodnoceno${p.rating ? ` · ${p.rating}★` : ''}` : 'Čeká na hodnocení'}
                      </span>
                    </span>
                    {p.flagged && <Icon name="warning" size={15} className="text-red-600 shrink-0" />}
                    {p.reviewed && !p.flagged && <Icon name="check" size={15} className="text-[#5B7A08] shrink-0" />}
                    <Icon name="chevron" size={15} className="-rotate-90 text-black/30 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && Object.keys(days).length === 0 && (
            <p className="mt-4 text-sm text-black/40 text-center">V tomto měsíci zatím nikdo neměl směnu.</p>
          )}
        </>
      )}

      {rating && (
        <ShiftReviewModal
          employee={{ id: rating.person.id, name: rating.person.name, avatar: rating.person.avatar ?? undefined }}
          initialDate={rating.date}
          onClose={() => setRating(null)}
          onSaved={() => { setRating(null); load(); onSaved?.(); }}
        />
      )}
    </div>
  );
}
