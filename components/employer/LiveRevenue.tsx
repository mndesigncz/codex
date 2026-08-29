'use client';

// Kolik se dnes protočilo — živě z pokladny.
//
// Nejdůležitější čísla podniku nemají čekat na uzávěrku ani na měsíční
// přehled. Tenhle panel se ptá pokladny na vybrané období a hned pod součty
// říká, jestli si data sedí — a když ne, čím to je. Číslo bez vysvětlení je
// horší než žádné, protože se podle něj rozhoduje.

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import { dbTimeHM } from '@/lib/pragueTime';

type Note = { tone: 'good' | 'warn' | 'info'; title: string; text: string };
type Day = {
  day: string; bills: number; cash: number; card: number; other: number; total: number;
  tips: number; tipsCash: number; tipsCard: number; refundCount: number; refundTotal: number;
  closings: number; declared: number | null; diff: number | null;
};
type Item = { productId: string; name: string; category: string | null; qty: number; price: number | null; revenue: number | null };
type Data = {
  connected: boolean; error?: string;
  from: string; to: string; today: string; placeName?: string | null; lastSyncAt?: string | null;
  totals: { bills: number; total: number; cash: number; card: number; other: number; tips: number;
    tipsCash: number; tipsCard: number; discounts: number; refundCount: number; refundTotal: number;
    avgBill: number; soldQty: number; productRevenue: number };
  days: Day[]; hours: number[]; byPerson: { name: string; total: number; bills: number }[];
  items: Item[]; notes: Note[]; note: string;
};

const toneCls: Record<Note['tone'], string> = {
  good: 'bg-[#C8F542]/10 border-[#C8F542]/30 text-[#5B7A08]',
  warn: 'bg-amber-500/10 border-amber-500/25 text-amber-800',
  info: 'bg-black/[0.03] border-black/[0.07] text-black/60',
};
const toneIcon: Record<Note['tone'], string> = { good: 'check', warn: 'warning', info: 'bulb' };

const iso = (d: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);
const shift = (days: number) => iso(new Date(Date.now() + days * 86400000));
const csDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });

export default function LiveRevenue() {
  const money = useMoney();
  const [from, setFrom] = useState(shift(0));
  const [to, setTo] = useState(shift(0));
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [openDays, setOpenDays] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/pos/daily?from=${from}&to=${to}`).then(x => x.json());
      if (r?.error) setErr(r.error);
      setD(r?.connected ? r : null);
    } catch { setErr('Data se nepodařilo načíst.'); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // Dnešek se mění pod rukama — když je vybraný, ať se čísla obnovují sama.
  useEffect(() => {
    if (!(from === to && from === shift(0))) return;
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [from, to, load]);

  const preset = (a: string, b: string) => { setFrom(a); setTo(b); };
  const isPreset = (a: string, b: string) => from === a && to === b;

  const presets: [string, string, string][] = [
    ['Dnes', shift(0), shift(0)],
    ['Včera', shift(-1), shift(-1)],
    ['7 dní', shift(-6), shift(0)],
    ['30 dní', shift(-29), shift(0)],
  ];

  if (!loading && !d && !err) {
    return (
      <div className="glass-card p-6 text-center text-black/45 text-sm">
        Pokladna není připojená — živý přehled se zapne po propojení se Storyous.
      </div>
    );
  }

  const t = d?.totals;
  const maxHour = d ? Math.max(...d.hours, 0) : 0;

  return (
    <div className="glass-card p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold tracking-tight text-[#16181A]">
            Živě z pokladny{d?.placeName ? ` · ${d.placeName}` : ''}
          </h3>
          <p className="text-[11px] text-black/40">
            {from === to ? csDate(from) : `${csDate(from)} – ${csDate(to)}`}
            {d?.lastSyncAt && <span> · naposledy synchronizováno {dbTimeHM(d.lastSyncAt)}</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="shrink-0 rounded-full glass px-3.5 py-2 text-xs font-bold text-black/60 hover:text-black disabled:opacity-50 transition inline-flex items-center gap-1.5">
          <Icon name="swap" size={14} /> {loading ? 'Načítám…' : 'Obnovit'}
        </button>
      </div>

      {/* Období */}
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(([label, a, b]) => (
          <button key={label} onClick={() => preset(a, b)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
              isPreset(a, b) ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
            }`}>
            {label}
          </button>
        ))}
        <span className="text-black/20">·</span>
        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
          className="rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 py-1.5 text-xs text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none" />
        <span className="text-xs text-black/35">–</span>
        <input type="date" value={to} min={from} max={d?.today} onChange={e => setTo(e.target.value)}
          className="rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 py-1.5 text-xs text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none" />
      </div>

      {err && <p className="text-sm text-amber-800 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3">{err}</p>}

      {loading && !d ? (
        <div className="flex items-center justify-center h-28">
          <div className="h-7 w-7 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : t ? (
        <>
          {/* Peníze */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] px-4 py-3 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-black/45">Tržba</p>
              <p className="text-xl sm:text-2xl font-bold tabular-nums text-[#16181A] whitespace-nowrap">{money(t.total)}</p>
              <p className="text-[11px] text-black/40">{t.bills} účtenek · ⌀ {money(t.avgBill)}</p>
            </div>
            <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] px-4 py-3 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-black/45">Hotově</p>
              <p className="text-xl sm:text-2xl font-bold tabular-nums text-[#16181A] whitespace-nowrap">{money(t.cash)}</p>
              <p className="text-[11px] text-black/40">
                {t.total > 0 ? Math.round((t.cash / t.total) * 100) : 0} % tržby
                {t.tipsCash > 0 ? ` · sprop. ${money(t.tipsCash)}` : ''}
              </p>
            </div>
            <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] px-4 py-3 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-black/45">Kartou</p>
              <p className="text-xl sm:text-2xl font-bold tabular-nums text-[#16181A] whitespace-nowrap">{money(t.card)}</p>
              <p className="text-[11px] text-black/40">
                {t.total > 0 ? Math.round((t.card / t.total) * 100) : 0} % tržby
                {t.tipsCard > 0 ? ` · sprop. ${money(t.tipsCard)}` : ''}
              </p>
            </div>
            <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] px-4 py-3 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-black/45">Spropitné</p>
              <p className="text-xl sm:text-2xl font-bold tabular-nums text-[#16181A] whitespace-nowrap">{money(t.tips)}</p>
              <p className="text-[11px] text-black/40">
                {t.refundCount > 0 ? `${t.refundCount}× refundace ${money(t.refundTotal)}` : t.other > 0 ? `jinak ${money(t.other)}` : 'bez refundací'}
              </p>
            </div>
          </div>

          {/* Sedí to? */}
          {d.notes.length > 0 && (
            <div className="space-y-2">
              {d.notes.map((n, i) => (
                <div key={i} className={`rounded-2xl border px-4 py-2.5 ${toneCls[n.tone]}`}>
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <Icon name={toneIcon[n.tone]} size={14} /> {n.title}
                  </p>
                  <p className="text-xs mt-0.5 opacity-80 leading-relaxed">{n.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Špičky dne */}
          {maxHour > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Kdy se protáčelo</p>
              <div className="flex items-end gap-[3px] h-16">
                {d.hours.map((v, h) => (
                  <div key={h} className="flex-1 min-w-[8px] flex flex-col items-center gap-1" title={`${h}:00 — ${money(v)}`}>
                    <div className={`w-full rounded-t ${v === maxHour ? 'bg-[#5B9E00]' : 'bg-[#C8F542]/70'}`}
                      style={{ height: `${maxHour ? Math.max(v > 0 ? 4 : 0, (v / maxHour) * 48) : 0}px` }} />
                    <span className="text-[9px] text-black/30 tabular-nums">{h % 3 === 0 ? h : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Co se prodalo */}
          {d.items.length > 0 && (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-black/45">Co se prodalo</p>
                <p className="text-[11px] text-black/40 tabular-nums">
                  {d.totals.soldQty.toLocaleString('cs-CZ')} kusů · {money(d.totals.productRevenue)} podle ceníku
                </p>
              </div>
              <div className="rounded-2xl border border-black/[0.06] divide-y divide-black/[0.05] overflow-hidden max-h-80 overflow-y-auto scrollbar-thin">
                {d.items.map(i => (
                  <div key={i.productId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                    <span className="w-full sm:w-auto sm:flex-1 min-w-0 truncate text-[#16181A]">{i.name}</span>
                    <span className="sm:hidden flex-1" />
                    <span className="shrink-0 text-xs text-black/45 tabular-nums">{i.qty.toLocaleString('cs-CZ')}×</span>
                    <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-[#16181A]">
                      {i.revenue != null ? money(i.revenue) : <span className="text-black/25">bez ceny</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Kdo markoval */}
          {d.byPerson.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Kdo markoval</p>
              <div className="space-y-1.5">
                {d.byPerson.map(p => {
                  const pct = t.total ? Math.round((p.total / t.total) * 100) : 0;
                  return (
                    <div key={p.name} className="relative overflow-hidden rounded-xl border border-black/[0.06] bg-white/50 px-3.5 py-2">
                      <span className="absolute inset-y-0 left-0 bg-[#C8F542]/25" style={{ width: `${pct}%` }} />
                      <span className="relative flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-[#16181A]">{p.name}</span>
                        <span className="shrink-0 text-black/55 tabular-nums">{money(p.total)} · {p.bills} úč.</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Den po dni */}
          {d.days.length > 1 && (
            <div>
              <button type="button" onClick={() => setOpenDays(o => !o)}
                className="w-full flex items-center justify-between gap-2 rounded-2xl bg-black/[0.03] border border-black/[0.06] px-4 py-2.5 text-sm font-semibold text-[#16181A]">
                <span>Den po dni ({d.days.length})</span>
                <Icon name="chevron" size={15} className={`text-black/35 transition-transform ${openDays ? 'rotate-180' : ''}`} />
              </button>
              {openDays && (
                <div className="mt-2 rounded-2xl border border-black/[0.06] divide-y divide-black/[0.05] overflow-hidden max-h-72 overflow-y-auto scrollbar-thin">
                  {d.days.map(day => (
                    <div key={day.day} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="w-14 shrink-0 text-black/45 tabular-nums">{csDate(day.day)}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-black/40">
                        {day.bills} úč. · hotově {money(day.cash)} · kartou {money(day.card)}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-[#16181A]">{money(day.total)}</span>
                      {day.diff != null && (
                        <span className={`w-16 shrink-0 text-right text-xs font-bold tabular-nums ${
                          Math.abs(day.diff) <= 50 ? 'text-[#5B7A08]' : 'text-amber-700'
                        }`} title="Rozdíl proti uzávěrce">
                          {day.diff === 0 ? '✓' : `${day.diff > 0 ? '+' : ''}${money(day.diff)}`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-black/35">{d.note}</p>
        </>
      ) : null}
    </div>
  );
}
