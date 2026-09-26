'use client';

// Kalendář směn a uzávěrek — záložka „Kalendář" v plánovači Rozvrhu.
//
// Měsíc po dnech: kdo měl směnu, jestli je uzávěrka hotová, chybí, nebo se
// ještě čeká. Kolo 69 (balík B1): kostra místo kolečka, ruční štítky na
// `t-label`, „✓" za jménem na ikonu, přepínač měsíce sdílený (MonthNav)
// a výpadek načtení poctivě jako chyba — dřív tichý catch nakreslil prázdný
// měsíc, který vypadal jako „nikdo nepracoval".
//
// Vlastní kalendář zaměstnance (scope „me") nahradil v Mých směnách widget
// „Kalendář uzávěrek" (uzaverky.kalendar, rozsah Moje). EmployeeLayout ho
// ale pořád připojuje (patří balíku B8), proto se se `scope="me"` nekreslí —
// jinak by na stránce byl dvakrát. Integrace kola 69 řádek z layoutu smaže.

import { useState, useEffect, useCallback, useRef } from 'react';
import { zkratkyDnu, zacatekTydne } from '@/lib/week';
import { Icon } from '../Icons';
import { Card, ErrorState, MonthNav, Skeleton, Well } from '../ui';
import { useCurrency } from '../CurrencyProvider';
import { PersonLink } from '../employer/ProfileLinkProvider';
import { pragueToday } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';

type Person = { id: number; name: string; avatar: string | null; startTime?: string; endTime?: string; hadClosing?: boolean };
type Day = { onShift: Person[]; closedBy: Person[]; hasClosing: boolean; missing: boolean };
type Days = Record<string, Day>;

const pad = (n: number) => String(n).padStart(2, '0');

export default function ShiftCalendar({ scope, initialMonth }: { scope?: 'me'; initialMonth?: string }) {
  if (scope === 'me') return null;
  return <KalendarSmen initialMonth={initialMonth} />;
}

function KalendarSmen({ initialMonth }: { initialMonth?: string }) {
  const { weekStart } = useCurrency();
  const [month, setMonth] = useState(initialMonth ?? pragueToday().slice(0, 7));
  const [days, setDays] = useState<Days>({});
  const [loading, setLoading] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  // Rychlé ťukání do šipek pouští dotazy přes sebe; kreslit smí jen ten nejnovější.
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const req = ++reqRef.current;
    setLoading(true); setChyba(null);
    try {
      const d = await fetch(`/api/closings/calendar?month=${month}`).then(okJson);
      if (req !== reqRef.current) return;
      setDays(d.days && typeof d.days === 'object' ? d.days : {});
    } catch (e) {
      if (req === reqRef.current) { setDays({}); setChyba(apiMessage(e, 'Kalendář se nenačetl.')); }
    }
    if (req === reqRef.current) setLoading(false);
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const [y, m] = month.split('-').map(Number);
  const wd = zkratkyDnu(zacatekTydne(weekStart));
  const firstDow = new Date(y, m - 1, 1).getDay();            // 0 = neděle … 6 = sobota
  const lead = (firstDow - weekStart + 7) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayStr = pragueToday();

  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const detail = sel ? days[sel] : null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <MonthNav value={month} onChange={v => { setSel(null); setMonth(v); }} />
        {/* Legenda: stav nese tón (ok / bad), ne limetka — limetka bez záře by byla „stav" jen napůl. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 t-meta">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-ok" /> Uzávěrka hotová</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-bad" /> Chybí uzávěrka</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-black/20" /> Směna</span>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-56" />
      ) : chyba ? (
        <ErrorState compact title="Kalendář se nenačetl" onRetry={load} detail={chyba} />
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
                  ? 'bg-bad/[0.08] border-bad/30'
                  : day.hasClosing
                    ? 'bg-ok/10 border-ok/30'
                    : day.onShift.length > 0
                      ? 'bg-black/[0.03] border-black/[0.08]'
                      : 'bg-black/[0.015] border-transparent';
              const active = sel === date;
              return (
                <button key={i} type="button" onClick={() => day ? setSel(active ? null : date) : undefined}
                  aria-pressed={day ? active : undefined}
                  aria-label={`${dnum}. ${day?.missing ? '— chybí uzávěrka' : day?.hasClosing ? '— uzávěrka hotová' : ''}`}
                  className={`tap-target-sm aspect-square rounded-xl border p-1 flex flex-col items-center justify-start gap-0.5 transition-colors ${tone} ${active ? 'ring-2 ring-[#16181A]/40' : ''} ${day ? 'cursor-pointer hover:border-black/20' : 'cursor-default'}`}>
                  <span className={`text-[11px] font-semibold leading-none mt-0.5 ${isToday ? 'text-[#16181A] underline underline-offset-2' : 'text-black/55'}`}>{dnum}</span>
                  {day && day.onShift.length > 0 && (
                    <span className="flex flex-wrap justify-center gap-0.5 leading-none" aria-hidden>
                      {day.onShift.slice(0, 3).map(p => <span key={p.id} className="text-[11px]" title={p.name}>{p.avatar ?? '👤'}</span>)}
                      {day.onShift.length > 3 && <span className="text-[11px] text-black/40">+{day.onShift.length - 3}</span>}
                    </span>
                  )}
                  {day && (
                    <span aria-hidden className={`mt-auto w-1.5 h-1.5 rounded-full ${day.missing ? 'bg-bad' : day.hasClosing ? 'bg-ok' : day.onShift.length > 0 ? 'bg-black/20' : 'bg-transparent'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Detail dne */}
          {detail && sel && (
            <Well className="mt-4 space-y-3">
              <h3 className="t-card cz-sentence">
                {new Date(sel + 'T12:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <div>
                <p className="t-label mb-1.5">Na směně</p>
                {detail.onShift.length === 0 ? (
                  <p className="t-meta">Nikdo neměl směnu.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.onShift.map(p => (
                      <PersonLink key={p.id} id={p.id} className={`chip ${p.hadClosing ? 'chip-ok' : detail.missing ? 'chip-bad' : 'chip-muted'}`}>
                        <span aria-hidden>{p.avatar ?? '👤'}</span> {p.name}
                        {p.startTime && <span className="opacity-60 tabular-nums">{p.startTime}–{p.endTime}</span>}
                        {p.hadClosing && <Icon name="check" size={13} className="shrink-0" />}
                      </PersonLink>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="t-label mb-1.5">Uzávěrku udělal</p>
                {detail.closedBy.length === 0 ? (
                  <p className={detail.missing ? 'text-sm text-bad-ink font-medium' : 't-meta'}>{detail.missing ? 'Nikdo — uzávěrka chybí.' : 'Zatím nikdo.'}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.closedBy.map(p => (
                      <PersonLink key={p.id} id={p.id} className="chip chip-ok">
                        <span aria-hidden>{p.avatar ?? '👤'}</span> {p.name}
                      </PersonLink>
                    ))}
                  </div>
                )}
              </div>
            </Well>
          )}
        </>
      )}
    </Card>
  );
}
