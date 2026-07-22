'use client';

import { useState, useEffect } from 'react';
import { Icon } from '../Icons';
import { Closing, expectedCash, cashDifference } from '@/lib/closing';
import { useMoney } from '../CurrencyProvider';
import CashClosing from '../employee/CashClosing';

// Rows may carry an `approved` flag; older rows omit it (treated as approved).
// `covered_by` links a stub row to the parent closing that also closed for them.
type ClosingRow = Closing & { approved?: boolean; covered_by?: number | null };

type Person = { id: number; name: string; avatar?: string };
type MissingDay = { date: string; employees: Person[] };

export default function ClosingsOverview() {
  const money = useMoney();
  const [allClosings, setAllClosings] = useState<ClosingRow[]>([]);
  const [payDailyCash, setPayDailyCash] = useState(false);
  const [missing, setMissing] = useState<MissingDay[]>([]);
  const [scheduledByDate, setScheduledByDate] = useState<Record<string, Person[]>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingDate, setCreatingDate] = useState<string | undefined>(undefined);
  const [openId, setOpenId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [approving, setApproving] = useState<number | null>(null);
  const [month, setMonth] = useState<string>('all'); // 'all' | 'YYYY-MM'

  const load = async () => {
    try {
      const d = await fetch('/api/closings').then(r => r.json());
      setAllClosings(Array.isArray(d.closings) ? d.closings : []);
      setPayDailyCash(!!d.payDailyCash);
      setMissing(Array.isArray(d.missingClosings) ? d.missingClosings : []);
      setScheduledByDate(d.scheduledByDate && typeof d.scheduledByDate === 'object' ? d.scheduledByDate : {});
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async (c: ClosingRow) => {
    if (!confirm(`Smazat uzávěrku z ${new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ')}?`)) return;
    setDeleting(c.id);
    const prev = allClosings;
    setAllClosings(cs => cs.filter(x => x.id !== c.id));
    try {
      const res = await fetch(`/api/closings/${c.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch { setAllClosings(prev); }
    setDeleting(null);
  };

  const approve = async (c: ClosingRow) => {
    setApproving(c.id);
    const prev = allClosings;
    // Optimistically flip so the row leaves the approval panel.
    setAllClosings(cs => cs.map(x => (x.id === c.id ? { ...x, approved: true } : x)));
    try {
      const res = await fetch(`/api/closings/${c.id}`, { method: 'PATCH' });
      if (!res.ok) throw new Error();
    } catch { setAllClosings(prev); }
    setApproving(null);
  };

  // Closings submitted by someone not on shift; awaiting the employer's approval.
  // Stub rows (covered_by set) are auto-handled with their parent — never pending.
  const pending = allClosings.filter(c => c.approved === false && !c.covered_by);

  // Months present in the data, newest first (dates are 'YYYY-MM-DD').
  const months = Array.from(new Set(allClosings.map(c => c.date?.slice(0, 7)).filter(Boolean))).sort().reverse() as string[];
  const closings = month === 'all' ? allClosings : allClosings.filter(c => c.date?.slice(0, 7) === month);
  // Covered stubs grouped under the parent closing they were filed alongside.
  const coveredBy = (parentId: number) => closings.filter(c => c.covered_by === parentId);
  // Only top-level closings appear as their own cards; stubs nest inside.
  const topLevel = closings.filter(c => !c.covered_by);
  const monthLabel = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

  const exportCsv = () => {
    const head = ['Datum', 'Směna', 'Zaměstnanec', 'Kasa na začátku', 'Tržba hotově', 'Tržba kartou', 'Spropitné', 'Výdaje', 'Odloženo', 'Výplata', 'Kasa na konci', 'Očekávaná kasa', 'Rozdíl', 'Zákazníků', 'Poznámka'];
    const rows = closings.map(c => [
      c.date, c.shift_label ?? '', c.author_name ?? '',
      c.opening_cash, c.cash_revenue, c.card_revenue, c.tips, c.expenses,
      c.cash_removed, c.self_payout, c.closing_cash, expectedCash(c), cashDifference(c),
      c.customers, (c.notes ?? '').replace(/\n/g, ' '),
    ]);
    const csv = [head, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `uzaverky${month === 'all' ? '' : '-' + month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Totals across all closings.
  const totals = closings.reduce((a, c) => ({
    cash: a.cash + c.cash_revenue,
    card: a.card + c.card_revenue,
    tips: a.tips + c.tips,
    payout: a.payout + c.self_payout,
    removed: a.removed + c.cash_removed,
    diff: a.diff + cashDifference(c),
  }), { cash: 0, card: 0, tips: 0, payout: 0, removed: 0, diff: 0 });
  const totalRevenue = totals.cash + totals.card;

  // Daily revenue trend: sum of cash + card per day, chronological (oldest first).
  const daily = Array.from(
    closings.reduce((m, c) => {
      if (c.date) m.set(c.date, (m.get(c.date) ?? 0) + c.cash_revenue + c.card_revenue);
      return m;
    }, new Map<string, number>()),
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, total]) => ({ date, total }));

  // Employer fills a closing themselves (e.g. nobody on the crew did it today).
  if (creating) {
    return (
      <div className="p-6 space-y-4">
        <button onClick={() => { setCreating(false); setCreatingDate(undefined); }}
          className="inline-flex items-center gap-2 rounded-full glass border border-black/10 text-[#16181A] px-4 py-2 text-sm font-medium hover:bg-black/[0.05] transition">
          <Icon name="chevron" size={16} className="rotate-90" /> Zpět na přehled
        </button>
        <CashClosing user={{ id: 0, name: 'Vedení' }} hideHistory initialDate={creatingDate}
          onSubmitted={() => { setCreating(false); setCreatingDate(undefined); load(); }} />
      </div>
    );
  }

  const openCreate = (date?: string) => { setCreatingDate(date); setCreating(true); };

  const fmtMissing = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="p-6 space-y-6">
      {/* Chybějící uzávěrky — dny, kdy někdo měl směnu, ale uzávěrka není */}
      {missing.length > 0 && (
        <div className="rounded-3xl bg-red-500/[0.06] border border-red-500/25 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>🚨</span>
            <h3 className="font-bold text-[#16181A]">Chybí uzávěrka</h3>
            <span className="rounded-full bg-red-500/15 text-red-600 px-2.5 py-0.5 text-xs font-semibold">{missing.length}</span>
          </div>
          <p className="text-xs text-black/50">Tyto dny někdo pracoval, ale uzávěrku nikdo neudělal. Stačí, když ji vyplní jeden za všechny.</p>
          {missing.map(m => (
            <div key={m.date} className="rounded-2xl bg-white/60 border border-black/[0.06] p-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold tracking-tight text-[#16181A] capitalize">{fmtMissing(m.date)}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-xs text-black/45">Na směně:</span>
                  {m.employees.map(e => (
                    <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-xs text-black/60">
                      <span>{e.avatar ?? '👤'}</span> {e.name}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={() => openCreate(m.date)}
                className="shrink-0 rounded-full bg-[#16181A] text-white text-sm font-semibold px-4 py-2 hover:bg-black transition inline-flex items-center gap-1.5">
                <Icon name="plus" size={15} /> Vyplnit
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Uzávěrky ke schválení */}
      {pending.length > 0 && (
        <div className="rounded-3xl bg-orange-500/[0.08] border border-orange-500/25 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>⚠️</span>
            <h3 className="font-bold text-[#16181A]">Uzávěrky ke schválení</h3>
            <span className="rounded-full bg-orange-500/15 text-orange-600 px-2.5 py-0.5 text-xs font-semibold">{pending.length}</span>
          </div>
          {pending.map(c => {
            const d = cashDifference(c);
            return (
              <div key={c.id} className="rounded-2xl bg-white/60 border border-black/[0.06] p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
                  <span className="text-lg flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60">{c.author_avatar ?? '👤'}</span>
                  <div className="min-w-0">
                    <p className="font-bold tracking-tight text-[#16181A] truncate">{c.author_name ?? 'Neznámý'}</p>
                    <p className="text-xs text-black/45 truncate">
                      {new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
                    d === 0 ? 'bg-[#C8F542]/15 text-[#5B7A08]' : d > 0 ? 'bg-[#0A84FF]/15 text-[#0A6FE0]' : 'bg-red-500/15 text-red-600'
                  }`}>{d === 0 ? 'Sedí' : d > 0 ? `+${money(d)}` : money(d)}</span>
                </div>
                <p className="text-xs text-black/45">Odesláno bez směny — zkontroluj a schval.</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => approve(c)} disabled={approving === c.id}
                    className="rounded-full bg-[#C8F542] text-black text-sm font-semibold px-4 py-2 disabled:opacity-50 shrink-0">
                    {approving === c.id ? 'Schvaluji…' : 'Schválit'}
                  </button>
                  <button onClick={() => remove(c)} disabled={deleting === c.id}
                    className="rounded-full bg-black/[0.05] border border-black/10 text-red-600 text-sm px-4 py-2 disabled:opacity-50 shrink-0">
                    {deleting === c.id ? 'Mažu…' : 'Smazat'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 min-w-0">
          <p className="text-xs uppercase tracking-wider text-black/45 truncate">Tržba celkem</p>
          <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{money(totalRevenue)}</p>
          <p className="text-[11px] text-black/40 mt-1 truncate">Hotově {money(totals.cash)} · Kartou {money(totals.card)}</p>
        </div>
        <div className="glass-card p-5 min-w-0">
          <p className="text-xs uppercase tracking-wider text-black/45 truncate">Odvedeno / odloženo</p>
          <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{money(totals.removed)}</p>
        </div>
        {payDailyCash ? (
          <div className="glass-card p-5 min-w-0">
            <p className="text-xs uppercase tracking-wider text-black/45 truncate">Vyplaceno v hotovosti</p>
            <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{money(totals.payout)}</p>
          </div>
        ) : (
          <div className="glass-card p-5 min-w-0">
            <p className="text-xs uppercase tracking-wider text-black/45 truncate">Spropitné celkem</p>
            <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{money(totals.tips)}</p>
          </div>
        )}
        <div className="glass-card p-5 min-w-0">
          <p className="text-xs uppercase tracking-wider text-black/45 truncate">Rozdíl kasy</p>
          <p className={`text-xl sm:text-2xl font-bold tracking-tight tabular-nums mt-1.5 truncate ${totals.diff === 0 ? 'text-[#16181A]' : totals.diff > 0 ? 'text-[#0A6FE0]' : 'text-red-600'}`}>
            {totals.diff > 0 ? '+' : ''}{money(totals.diff)}
          </p>
          <p className="text-[11px] text-black/40 mt-1 truncate">Manko/přebytek souhrnně</p>
        </div>
      </div>

      {/* Revenue trend chart */}
      {daily.length >= 2 && (() => {
        const barW = 26, barGap = 10, padX = 14;
        const chartH = 160, plotTop = 18, plotBottom = 138, labelY = 152;
        const chartW = padX * 2 + daily.length * barW + (daily.length - 1) * barGap;
        const maxVal = Math.max(...daily.map(d => d.total), 1);
        const maxIdx = daily.findIndex(d => d.total === maxVal);
        const avg = daily.reduce((s, d) => s + d.total, 0) / daily.length;
        const avgY = plotBottom - (avg / maxVal) * (plotBottom - plotTop);
        const labelEvery = daily.length > 24 ? 3 : daily.length > 14 ? 2 : 1;
        return (
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Icon name="trend" size={18} className="text-[#5B7A08]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-black/55">Trend tržeb</h3>
            </div>
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-36 sm:h-44" style={{ minWidth: chartW }} role="img" aria-label="Denní tržby">
                <clipPath id="trend-bars-clip"><rect x="0" y="0" width={chartW} height={plotBottom} /></clipPath>
                {daily.map((d, i) => {
                  const x = padX + i * (barW + barGap);
                  const h = Math.max((d.total / maxVal) * (plotBottom - plotTop), 2);
                  const y = plotBottom - h;
                  const day = parseInt(d.date.slice(8, 10), 10);
                  const mon = parseInt(d.date.slice(5, 7), 10);
                  return (
                    <g key={d.date}>
                      <title>{`${day}. ${mon}. — ${money(d.total)}`}</title>
                      {/* rx rounds both ends; the bottom radius is clipped flat at the baseline */}
                      <rect x={x} y={y} width={barW} height={h + 4} rx={3} fill={i === maxIdx ? '#8FB811' : '#C8F542'} clipPath="url(#trend-bars-clip)" />
                      {i === maxIdx && (
                        <text x={Math.min(Math.max(x + barW / 2, 30), chartW - 30)} y={y - 5} textAnchor="middle" className="text-[9px] font-semibold fill-black/55 tabular-nums">{money(d.total)}</text>
                      )}
                      {i % labelEvery === 0 && (
                        <text x={x + barW / 2} y={labelY} textAnchor="middle" className="text-[9px] sm:text-[10px] fill-black/40">{day}.</text>
                      )}
                    </g>
                  );
                })}
                <line x1={padX} y1={avgY} x2={chartW - padX} y2={avgY} stroke="#16181A" strokeOpacity={0.3} strokeWidth={1} strokeDasharray="4 4" />
                <text x={padX} y={avgY - 4} className="text-[9px] fill-black/45 tabular-nums">Ø {money(avg)}</text>
              </svg>
            </div>
          </div>
        );
      })()}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold tracking-tight text-[#16181A]">Uzávěrky ({topLevel.length})</h3>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => openCreate()}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#16181A] text-white px-4 py-2 text-sm font-semibold hover:bg-black transition whitespace-nowrap">
            <Icon name="plus" size={16} /> Nová uzávěrka
          </button>
          {topLevel.length > 0 && (
            <button onClick={exportCsv}
              className="rounded-full glass border border-black/10 text-[#16181A] px-4 py-2 text-sm font-medium hover:bg-black/[0.05] transition whitespace-nowrap">
              Export CSV ↓
            </button>
          )}
        </div>
      </div>

      {months.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
          <button onClick={() => setMonth('all')}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all ${month === 'all' ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'}`}>
            Vše
          </button>
          {months.map(m => (
            <button key={m} onClick={() => setMonth(m)}
              className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all capitalize ${month === m ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'}`}>
              {monthLabel(m)}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : topLevel.length === 0 ? (
        <div className="glass-card p-8 text-center"><p className="text-black/45">Zatím žádné uzávěrky od zaměstnanců.</p></div>
      ) : (
        <div className="space-y-3">
          {topLevel.map(c => {
            const d = cashDifference(c);
            const expected = expectedCash(c);
            const open = openId === c.id;
            const covered = coveredBy(c.id);
            // Everyone scheduled that day, and who is / isn't covered by a closing.
            const scheduled = scheduledByDate[c.date] ?? [];
            const coveredIds = new Set<number>([c.created_by, ...covered.map(cv => cv.created_by)]);
            return (
              <div key={c.id} className="glass-card overflow-hidden">
                <button onClick={() => setOpenId(open ? null : c.id)} className="w-full text-left p-5 flex items-center justify-between gap-3 hover:bg-black/[0.02] transition-colors">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="text-lg flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60">{c.author_avatar ?? '👤'}</span>
                    <div className="min-w-0">
                      <p className="font-bold tracking-tight text-[#16181A] truncate">
                        {new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })}
                        {c.shift_label && <span className="text-black/40 font-normal"> · {c.shift_label}</span>}
                      </p>
                      <p className="text-xs text-black/45 truncate">{c.author_name ?? 'Neznámý'} · Tržba {money(c.cash_revenue + c.card_revenue)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {covered.length > 0 && (
                      <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-2.5 py-1 text-xs font-medium whitespace-nowrap">
                        <Icon name="users" size={12} /> +{covered.length}
                      </span>
                    )}
                    {c.approved === false && (
                      <span className="rounded-full bg-orange-500/15 text-orange-600 px-2.5 py-1 text-xs font-medium whitespace-nowrap">Čeká na schválení</span>
                    )}
                    <span className={`text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
                      d === 0 ? 'bg-[#C8F542]/15 text-[#5B7A08]' : d > 0 ? 'bg-[#0A84FF]/15 text-[#0A6FE0]' : 'bg-red-500/15 text-red-600'
                    }`}>{d === 0 ? 'Sedí' : d > 0 ? `+${money(d)}` : money(d)}</span>
                    <Icon name="chevron" size={16} className={`text-black/35 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {open && (
                  <div className="px-5 pb-5 space-y-4 border-t border-black/[0.06]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 text-sm">
                      {[
                        ['Kasa na začátku', c.opening_cash],
                        ['Tržba hotově', c.cash_revenue],
                        ['Tržba kartou', c.card_revenue],
                        ['Spropitné', c.tips],
                        ['Výdaje z kasy', c.expenses],
                        ['Odloženo ven', c.cash_removed],
                        ...(payDailyCash ? [['Výplata zaměstnance', c.self_payout] as [string, number]] : []),
                        ['Zákazníků', c.customers],
                      ].map(([label, val]) => (
                        <div key={label as string} className="min-w-0">
                          <span className="block text-black/40 text-xs truncate">{label}</span>
                          <p className="font-semibold text-[#16181A] tabular-nums truncate">{label === 'Zákazníků' ? val : money(val as number)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-2xl bg-black/[0.03] border border-black/[0.07] p-4 space-y-2 text-sm">
                      <div className="flex justify-between gap-3"><span className="text-black/55 min-w-0">Očekávaný stav kasy</span><span className="font-semibold text-[#16181A] shrink-0 whitespace-nowrap tabular-nums">{money(expected)}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-black/55 min-w-0">Skutečný stav kasy</span><span className="font-semibold text-[#16181A] shrink-0 whitespace-nowrap tabular-nums">{money(c.closing_cash)}</span></div>
                      <div className={`flex justify-between gap-3 rounded-xl px-3 py-2 ${d === 0 ? 'bg-[#C8F542]/10 text-[#5B7A08]' : d > 0 ? 'bg-[#0A84FF]/10 text-[#0A6FE0]' : 'bg-red-500/10 text-red-600'}`}>
                        <span className="font-medium min-w-0">{d === 0 ? 'Kasa sedí' : d > 0 ? 'Přebytek' : 'Manko'}</span>
                        <span className="font-bold shrink-0 whitespace-nowrap tabular-nums">{d > 0 ? '+' : ''}{money(d)}</span>
                      </div>
                    </div>
                    {covered.length > 0 && (
                      <div className="rounded-2xl bg-[#C8F542]/[0.08] border border-[#C8F542]/30 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#5B7A08] mb-2 flex items-center gap-1.5">
                          <Icon name="users" size={14} /> Uzávěrka i za
                        </p>
                        <div className="space-y-1.5">
                          {covered.map(cv => (
                            <div key={cv.id} className="flex items-center justify-between gap-3 text-sm">
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="text-base shrink-0">{cv.author_avatar ?? '👤'}</span>
                                <span className="font-medium text-[#16181A] truncate">{cv.author_name ?? 'Neznámý'}</span>
                              </span>
                              {payDailyCash && cv.self_payout > 0 && (
                                <span className="shrink-0 text-black/55 tabular-nums whitespace-nowrap">Výplata {money(cv.self_payout)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {scheduled.length > 0 && (
                      <div className="rounded-2xl bg-black/[0.02] border border-black/[0.06] p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2 flex items-center gap-1.5">
                          <Icon name="users" size={14} /> Na směně ten den
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {scheduled.map(p => {
                            const has = coveredIds.has(p.id);
                            return (
                              <span key={p.id} title={has ? 'Má uzávěrku' : 'Bez uzávěrky'}
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${has ? 'bg-[#C8F542]/15 text-[#5B7A08]' : 'bg-red-500/10 text-red-600'}`}>
                                <span>{p.avatar ?? '👤'}</span> {p.name}
                                {has ? ' ✓' : ' — chybí'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {c.notes && <p className="text-sm text-black/55 bg-black/[0.04] border border-black/[0.06] rounded-2xl p-3">{c.notes}</p>}
                    <button onClick={() => remove(c)} disabled={deleting === c.id}
                      className="text-sm text-red-600 hover:bg-red-500/[0.06] rounded-full px-4 py-2 font-medium transition-colors disabled:opacity-50">
                      {deleting === c.id ? 'Mažu…' : 'Smazat uzávěrku'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
