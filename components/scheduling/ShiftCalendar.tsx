'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../Icons';
import { useCurrency } from '../CurrencyProvider';

type Person = { id: number; name: string; avatar: string | null; startTime?: string; endTime?: string; hadClosing?: boolean };
type Day = { onShift: Person[]; closedBy: Person[]; hasClosing: boolean; missing: boolean };
type Days = Record<string, Day>;

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const WD_MON = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const WD_SUN = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const pad = (n: number) => String(n).padStart(2, '0');

// A month grid showing who was on shift each day and whether the closing is
// done, missing, or still pending. scope='me' limits it to the current user.
export default function ShiftCalendar({ scope, initialMonth }: { scope?: 'me'; initialMonth?: string }) {
  const { weekStart } = useCurrency();
  const [month, setMonth] = useState(initialMonth ?? ymOf(new Date()));
  const [days, setDays] = useState<Days>({});
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = `month=${month}${scope === 'me' ? '&scope=me' : ''}`;
      const d = await fetch(`/api/closings/calendar?${q}`).then(r => r.json());
      setDays(d.days && typeof d.days === 'object' ? d.days : {});
    } catch { setDays({}); }
    setLoading(false);
  }, [month, scope]);
  useEffect(() => { load(); }, [load]);

  const [y, m] = month.split('-').map(Number);
  const wd = weekStart === 0 ? WD_SUN : WD_MON;
  const firstDow = new Date(y, m - 1, 1).getDay();            // 0=Sun..6=Sat
  const lead = (firstDow - weekStart + 7) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const step = (delta: number) => { setSel(null); setMonth(ymOf(new Date(y, m - 1 + delta, 1))); };
  const detail = sel ? days[sel] : null;

  return (
    <div className="glass-card p-4 sm:p-5">
      {/* Header + month nav */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <button onClick={() => step(-1)} className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.05] transition">
          <Icon name="chevron" size={16} className="rotate-90" />
        </button>
        <h3 className="font-bold tracking-tight text-[#16181A] capitalize">{MONTHS[m - 1]} {y}</h3>
        <button onClick={() => step(1)} className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.05] transition">
          <Icon name="chevron" size={16} className="-rotate-90" />
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] text-black/50">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#C8F542]" /> Uzávěrka hotová</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Chybí uzávěrka</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-black/20" /> Směna</span>
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
              const tone = !day
                ? 'bg-black/[0.015] border-transparent'
                : day.missing
                  ? 'bg-red-500/[0.08] border-red-500/30'
                  : day.hasClosing
                    ? 'bg-[#C8F542]/[0.12] border-[#C8F542]/40'
                    : day.onShift.length > 0
                      ? 'bg-black/[0.03] border-black/[0.08]'
                      : 'bg-black/[0.015] border-transparent';
              const active = sel === date;
              return (
                <button key={i} onClick={() => day ? setSel(active ? null : date) : undefined}
                  className={`aspect-square rounded-xl border p-1 flex flex-col items-center justify-start gap-0.5 transition ${tone} ${active ? 'ring-2 ring-[#16181A]/40' : ''} ${day ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}>
                  <span className={`text-[11px] font-semibold leading-none mt-0.5 ${isToday ? 'text-[#16181A] underline underline-offset-2' : 'text-black/55'}`}>{dnum}</span>
                  {day && day.onShift.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-0.5 leading-none">
                      {day.onShift.slice(0, 3).map(p => <span key={p.id} className="text-[11px]" title={p.name}>{p.avatar ?? '👤'}</span>)}
                      {day.onShift.length > 3 && <span className="text-[9px] text-black/40">+{day.onShift.length - 3}</span>}
                    </div>
                  )}
                  {day && (
                    <span className={`mt-auto w-1.5 h-1.5 rounded-full ${day.missing ? 'bg-red-500' : day.hasClosing ? 'bg-[#8FB811]' : day.onShift.length > 0 ? 'bg-black/20' : 'bg-transparent'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Day detail */}
          {detail && sel && (
            <div className="mt-4 rounded-2xl bg-black/[0.02] border border-black/[0.06] p-4 space-y-3">
              <p className="font-bold tracking-tight text-[#16181A] capitalize">
                {new Date(sel + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-1.5">Na směně</p>
                {detail.onShift.length === 0 ? (
                  <p className="text-sm text-black/40">Nikdo neměl směnu.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.onShift.map(p => (
                      <span key={p.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${p.hadClosing ? 'bg-[#C8F542]/15 text-[#5B7A08]' : detail.missing ? 'bg-red-500/10 text-red-600' : 'bg-black/[0.05] text-black/60'}`}>
                        <span>{p.avatar ?? '👤'}</span> {p.name}
                        {p.startTime && <span className="opacity-60 tabular-nums">{p.startTime}–{p.endTime}</span>}
                        {p.hadClosing ? ' ✓' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-1.5">Uzávěrku udělal</p>
                {detail.closedBy.length === 0 ? (
                  <p className={`text-sm ${detail.missing ? 'text-red-600 font-medium' : 'text-black/40'}`}>{detail.missing ? 'Nikdo — uzávěrka chybí.' : 'Zatím nikdo.'}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.closedBy.map(p => (
                      <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-[#16181A] text-white px-2.5 py-1 text-xs font-medium">
                        <span>{p.avatar ?? '👤'}</span> {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
