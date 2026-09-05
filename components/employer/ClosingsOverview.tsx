'use client';

import { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icons';
import { PersonLink } from './ProfileLinkProvider';
import { usePlan, UpgradeModal, ProBadge } from '../Pro';
import {
  Closing, ShiftPerson, expectedCash, expectedCashLines, cashDifference,
  cashLeft, diffReasonLabel,
} from '@/lib/closing';
import { useMoney, useCurrency } from '../CurrencyProvider';
import CashClosing from '../employee/CashClosing';
import ClosingsCalendar from './ClosingsCalendar';
import ClosingDetail from './ClosingDetail';
import { pragueDaySafe } from '@/lib/pragueTime';

// Rows may carry an `approved` flag; older rows omit it (treated as approved).
// `covered_by` links a stub row to the parent closing that also closed for them.
type ClosingRow = Closing & { approved?: boolean; covered_by?: number | null };

type Person = { id: number; name: string; avatar?: string | null };
type MissingDay = { date: string; employees: Person[] };

// Everyone the closing belongs to. New rows carry the whole shift crew; older
// ones only have an author, so fall back to them.
const crewOf = (c: ClosingRow): ShiftPerson[] =>
  c.shiftEmployees && c.shiftEmployees.length
    ? c.shiftEmployees
    : [{ id: c.created_by, name: c.author_name ?? 'Neznámý', avatar: c.author_avatar ?? null }];

export default function ClosingsOverview() {
  const money = useMoney();
  const { pro } = usePlan();
  const [upgradeFor, setUpgradeFor] = useState<string | null>(null);
  // Analytics live behind one collapsible header — the list of closings is
  // the daily job, the numbers are the occasional deep-dive.
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  // Deep POS insights for the picked month (hourly peaks, per-person sales…).
  const [posInsights, setPosInsights] = useState<any | null>(null);
  // Kontrola uzávěrek proti kase — den po dni za vybraný měsíc.
  const [reconcile, setReconcile] = useState<any | null>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  useEffect(() => {
    try { setAnalyticsOpen(localStorage.getItem('managero-closings-analytics') === '1'); } catch { /* ignore */ }
  }, []);
  const toggleAnalytics = () => setAnalyticsOpen(o => {
    try { localStorage.setItem('managero-closings-analytics', o ? '0' : '1'); } catch { /* ignore */ }
    return !o;
  });
  const [allClosings, setAllClosings] = useState<ClosingRow[]>([]);
  // For the month-in-numbers card: who worked (labor cost) and what was bought.
  const [attRoster, setAttRoster] = useState<any[]>([]);
  const [attEntries, setAttEntries] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [payDailyCash, setPayDailyCash] = useState(false);
  const [missing, setMissing] = useState<MissingDay[]>([]);
  const [scheduledByDate, setScheduledByDate] = useState<Record<string, Person[]>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingDate, setCreatingDate] = useState<string | undefined>(undefined);
  // Rozklik uzávěrky otevře plný detail — do řádku se toho vejde jen zlomek.
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [approving, setApproving] = useState<number | null>(null);
  const [month, setMonth] = useState<string>('all'); // 'all' | 'YYYY-MM'
  useEffect(() => {
    if (!analyticsOpen || month === 'all') { setPosInsights(null); return; }
    let alive = true;
    fetch(`/api/pos/insights?month=${month}`).then(r => r.json())
      .then(d => {
        if (!alive) return;
        setPosInsights(d?.connected && d.bills != null ? d : null);
        // Porovnání s uzávěrkami jede ze stejného průchodu účtenkami — druhé
        // volání by znamenalo stáhnout celý měsíc z pokladny dvakrát.
        setReconcile(d?.reconcile && Array.isArray(d.reconcile.days) ? d.reconcile : null);
      })
      .catch(() => { if (alive) { setPosInsights(null); setReconcile(null); } });
    return () => { alive = false; };
  }, [analyticsOpen, month]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const d = await fetch('/api/closings').then(r => r.json());
      setAllClosings(Array.isArray(d.closings) ? d.closings : []);
      setPayDailyCash(!!d.payDailyCash);
      setMissing(Array.isArray(d.missingClosings) ? d.missingClosings : []);
      setScheduledByDate(d.scheduledByDate && typeof d.scheduledByDate === 'object' ? d.scheduledByDate : {});
      setDataVersion(v => v + 1);
    } catch { /* ignore */ }
    try {
      const a = await fetch('/api/attendance?days=180').then(r => r.json());
      setAttRoster(Array.isArray(a?.roster) ? a.roster : []);
      setAttEntries(Array.isArray(a?.entries) ? a.entries : []);
    } catch { /* month card just loses the labor line */ }
    try {
      const o = await fetch('/api/orders').then(r => r.json());
      setOrders(Array.isArray(o?.orders) ? o.orders : Array.isArray(o) ? o : []);
    } catch { /* and the purchases line */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Picking a day in the calendar scopes the list below it; picking it again clears.
  const pickDate = (date: string) => {
    setSelectedDate(prev => (prev === date ? null : date));
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const remove = async (c: ClosingRow) => {
    if (!confirm(`Smazat uzávěrku z ${new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ')}?`)) return;
    setDeleting(c.id);
    const prev = allClosings;
    setAllClosings(cs => cs.filter(x => x.id !== c.id));
    try {
      const res = await fetch(`/api/closings/${c.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setDataVersion(v => v + 1);   // the calendar must forget the removed day
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
  // Totals, chart and export always follow the month tabs; only the list below
  // narrows further to a day picked in the calendar.
  const closings = month === 'all' ? allClosings : allClosings.filter(c => c.date?.slice(0, 7) === month);
  const listed = selectedDate ? allClosings.filter(c => c.date === selectedDate) : closings;
  // Covered stubs grouped under the parent closing they were filed alongside.
  const coveredBy = (parentId: number) => allClosings.filter(c => c.covered_by === parentId);
  // Only top-level closings appear as their own cards; stubs nest inside.
  const topLevel = listed.filter(c => !c.covered_by);
  const monthLabel = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

  // One file the accountant can work with: per-day rows + the month's summary.

  const exportAccountant = () => {
    if (!pro) { setUpgradeFor('Export pro účetní'); return; }
    const head = ['Datum', 'Tržba hotově', 'Tržba kartou', 'Tržba celkem', 'Spropitné', 'Výdaje z kasy', 'Odvedeno', 'Vyplaceno hotově'];
    const byDay = new Map<string, { cash: number; card: number; tips: number; exp: number; rem: number; pay: number }>();
    closings.forEach(c => {
      const d = byDay.get(c.date) ?? { cash: 0, card: 0, tips: 0, exp: 0, rem: 0, pay: 0 };
      d.cash += c.cash_revenue; d.card += c.card_revenue; d.tips += c.tips;
      d.exp += c.expenses; d.rem += c.cash_removed + (Number(c.final_removal) || 0); d.pay += c.self_payout;
      byDay.set(c.date, d);
    });
    const rows = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => [date, d.cash, d.card, d.cash + d.card, d.tips, d.exp, d.rem, d.pay]);
    const summary = [
      [], ['SOUHRN OBDOBÍ', month === 'all' ? 'vše' : month],
      ['Tržby celkem', totalRevenue],
      ['Mzdové náklady (z docházky)', laborCost],
      ['Nákupy zboží (přijaté objednávky)', purchases],
      ['Provozní výsledek (orientační)', operating],
    ];
    const csv = [head, ...rows, ...summary]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ucetni-podklad${month === 'all' ? '' : '-' + month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCsv = () => {
    if (!pro) { setUpgradeFor('Export CSV'); return; }
    const head = ['Datum', 'Směna', 'Vyplnil/a', 'Na směně', 'Kasa na začátku', 'Tržba hotově', 'Tržba kartou', 'Spropitné', 'Spropitné v kase', 'Výdaje', 'Odloženo', 'Výplata', 'Kasa na konci', 'Očekávaná kasa', 'Rozdíl', 'Odvod na konci', 'Zůstalo v kase', 'Zákazníků', 'Poznámka'];
    const rows = closings.map(c => [
      c.date, c.shift_label ?? '', c.author_name ?? '', crewOf(c).map(p => p.name).join(', '),
      c.opening_cash, c.cash_revenue, c.card_revenue, c.tips, c.tips_in_drawer ? 'ano' : 'ne', c.expenses,
      c.cash_removed, c.self_payout, c.closing_cash,
      c.covered_by ? '' : expectedCash(c), c.covered_by ? '' : cashDifference(c),
      Number(c.final_removal) || 0, cashLeft(c),
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
  // Stub rows (covered coworkers) carry only a payout — their revenue fields are
  // zero and their "difference" is a phantom, so the money sums skip them.
  // Payouts stay in: the covered person's wage really left the drawer.
  const totals = closings.reduce((a, c) => ({
    cash: a.cash + (c.covered_by ? 0 : c.cash_revenue),
    card: a.card + (c.covered_by ? 0 : c.card_revenue),
    tips: a.tips + (c.covered_by ? 0 : c.tips),
    payout: a.payout + c.self_payout,
    removed: a.removed + c.cash_removed + (Number(c.final_removal) || 0),
    diff: a.diff + (c.covered_by ? 0 : cashDifference(c)),
  }), { cash: 0, card: 0, tips: 0, payout: 0, removed: 0, diff: 0 });
  const totalRevenue = totals.cash + totals.card;

  // ---- Month in numbers: revenue (closings) × labor (attendance × rates) ×
  // purchases (received orders). Approximate by design — no VAT, no fixed
  // costs — but it answers "vyplatil se tenhle měsíc?" at a glance.
  const { laborTargetPct } = useCurrency();
  const inScope = (iso: string | null | undefined) => {
    const d = String(iso ?? '');
    return month === 'all' ? d !== '' : d.slice(0, 7) === month;
  };
  const rateOf = (id: number) => Number(attRoster.find((r: any) => Number(r.id) === Number(id))?.hourlyRate) || 0;
  const laborCost = Math.round(attEntries.reduce((sum: number, e: any) => {
    if (!e.clockOut || !inScope(pragueDaySafe(e.clockIn))) return sum;
    const h = (new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 3600000;
    return h > 0 && h < 24 ? sum + h * rateOf(e.employeeId) : sum;
  }, 0));
  const purchases = orders.reduce((sum: number, o: any) =>
    o.status === 'received' && inScope(String(o.receivedAt ?? o.createdAt).slice(0, 10))
      ? sum + (Number(o.totalCost) || 0) : sum, 0);
  const operating = totalRevenue - laborCost - purchases;

  // ---- Trends: this week vs last, strongest weekday, record day. Computed
  // from ALL closings (not just the picked month) so the comparison is honest.
  const trend = (() => {
    const byDay = new Map<string, number>();
    allClosings.forEach(c => {
      if (c.date) byDay.set(c.date, (byDay.get(c.date) ?? 0) + c.cash_revenue + c.card_revenue);
    });
    if (byDay.size < 4) return null;
    const now = new Date(); now.setHours(12, 0, 0, 0);
    const dayIdx = (now.getDay() + 6) % 7;
    const monday = new Date(now); monday.setDate(monday.getDate() - dayIdx);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const sumRange = (from: Date, days: number) => {
      let s2 = 0;
      for (let i = 0; i < days; i++) {
        const d = new Date(from); d.setDate(d.getDate() + i);
        s2 += byDay.get(iso(d)) ?? 0;
      }
      return s2;
    };
    const prevMonday = new Date(monday); prevMonday.setDate(prevMonday.getDate() - 7);
    // Same-length windows: Monday..today vs the same span last week.
    const thisWeek = sumRange(monday, dayIdx + 1);
    const lastWeekSame = sumRange(prevMonday, dayIdx + 1);
    const wow = lastWeekSame > 0 ? ((thisWeek - lastWeekSame) / lastWeekSame) * 100 : null;
    const weekdaySums = new Array(7).fill(0), weekdayCounts = new Array(7).fill(0);
    byDay.forEach((v, d) => {
      const wd = (new Date(d + 'T12:00:00').getDay() + 6) % 7;
      weekdaySums[wd] += v; weekdayCounts[wd]++;
    });
    let bestWd = 0, bestAvg = 0;
    for (let i = 0; i < 7; i++) {
      const avg = weekdayCounts[i] ? weekdaySums[i] / weekdayCounts[i] : 0;
      if (avg > bestAvg) { bestAvg = avg; bestWd = i; }
    }
    let recordDay = '', recordVal = 0;
    byDay.forEach((v, d) => { if (v > recordVal) { recordVal = v; recordDay = d; } });
    const WDS = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];
    return { thisWeek, lastWeekSame, wow, bestWdLabel: WDS[bestWd], bestAvg, recordDay, recordVal };
  })();
  const laborPct = totalRevenue > 0 && laborCost > 0 ? (laborCost / totalRevenue) * 100 : null;

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
      <div className="p-2 sm:p-6 space-y-4">
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
    <div className="p-4 sm:p-6 space-y-6">
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
                  <PersonLink id={c.created_by} className="text-lg flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60">{c.author_avatar ?? '👤'}</PersonLink>
                  <div className="min-w-0">
                    <PersonLink id={c.created_by}><p className="font-bold tracking-tight text-[#16181A] truncate">{c.author_name ?? 'Neznámý'}</p></PersonLink>
                    <p className="text-xs text-black/45 truncate">
                      {new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                  <span className={`tap-target-sm shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
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
          <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Tržba celkem</p>
          <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{money(totalRevenue)}</p>
          <p className="text-[11px] text-black/40 mt-1 truncate">Hotově {money(totals.cash)} · Kartou {money(totals.card)}</p>
        </div>
        <div className="glass-card p-5 min-w-0">
          <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Odvedeno / odloženo</p>
          <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{money(totals.removed)}</p>
        </div>
        {payDailyCash ? (
          <div className="glass-card p-5 min-w-0">
            <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Vyplaceno v hotovosti</p>
            <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{money(totals.payout)}</p>
          </div>
        ) : (
          <div className="glass-card p-5 min-w-0">
            <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Spropitné celkem</p>
            <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{money(totals.tips)}</p>
          </div>
        )}
        <div className="glass-card p-5 min-w-0">
          <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Rozdíl kasy</p>
          <p className={`text-xl sm:text-2xl font-bold tracking-tight tabular-nums mt-1.5 truncate ${totals.diff === 0 ? 'text-[#16181A]' : totals.diff > 0 ? 'text-[#0A6FE0]' : 'text-red-600'}`}>
            {totals.diff > 0 ? '+' : ''}{money(totals.diff)}
          </p>
          <p className="text-[11px] text-black/40 mt-1 truncate">Manko/přebytek souhrnně</p>
        </div>
      </div>

      {analyticsOpen && trend && pro && (
        <div className="glass-card p-5 sm:p-6">
          <h3 className="font-bold tracking-tight text-[#16181A] mb-4">📊 Trendy</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Tento týden</p>
              <p className="text-lg sm:text-xl font-bold tabular-nums text-[#16181A] mt-1 truncate">{money(trend.thisWeek)}</p>
              <p className="text-[11px] text-black/40 mt-0.5">od pondělí do dneška</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">vs. minulý týden</p>
              <p className={`text-lg sm:text-xl font-bold tabular-nums mt-1 truncate ${
                trend.wow == null ? 'text-black/40' : trend.wow >= 0 ? 'text-[#5B7A08]' : 'text-red-600'
              }`}>
                {trend.wow == null ? '—' : `${trend.wow >= 0 ? '+' : ''}${trend.wow.toFixed(0)} %`}
              </p>
              <p className="text-[11px] text-black/40 mt-0.5 truncate">stejné dny: {money(trend.lastWeekSame)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Nejsilnější den</p>
              <p className="text-lg sm:text-xl font-bold text-[#16181A] mt-1 capitalize truncate">{trend.bestWdLabel}</p>
              <p className="text-[11px] text-black/40 mt-0.5 truncate">průměr {money(Math.round(trend.bestAvg))}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Rekordní den</p>
              <p className="text-lg sm:text-xl font-bold tabular-nums text-[#16181A] mt-1 truncate">{money(trend.recordVal)}</p>
              <p className="text-[11px] text-black/40 mt-0.5 truncate">{trend.recordDay && new Date(trend.recordDay + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
        </div>
      )}

      {/* Analytics, folded behind one calm header */}
      <button onClick={toggleAnalytics}
        className="w-full glass-card px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-black/[0.02] transition">
        <span className="font-bold tracking-tight text-[#16181A]">📈 Přehledy a trendy</span>
        <span className="flex items-center gap-2 text-xs text-black/40">
          {!analyticsOpen && 'měsíc v číslech · trendy · graf'}
          <Icon name="chevron" size={16} className={`transition-transform ${analyticsOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Month in numbers — the connected view: revenue × labor × purchases */}
      {analyticsOpen && (laborCost > 0 || purchases > 0) && pro && (
        <div className="glass-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h3 className="font-bold tracking-tight text-[#16181A]">📈 {month === 'all' ? 'Období v číslech' : 'Měsíc v číslech'}</h3>
            <span className="text-[11px] text-black/35">orientační — bez DPH a fixních nákladů</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Tržby</p>
              <p className="text-lg sm:text-xl font-bold tabular-nums text-[#16181A] mt-1 truncate">{money(totalRevenue)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Mzdové náklady</p>
              <p className="text-lg sm:text-xl font-bold tabular-nums text-[#16181A] mt-1 truncate">− {money(laborCost)}</p>
              {laborPct != null && (
                <p className={`text-[11px] mt-0.5 truncate ${laborTargetPct != null && laborPct > laborTargetPct ? 'text-red-600 font-semibold' : 'text-black/40'}`}>
                  {laborPct.toFixed(0)} % z tržeb{laborTargetPct != null ? ` (cíl ${laborTargetPct} %)` : ''}
                </p>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Nákupy zboží</p>
              <p className="text-lg sm:text-xl font-bold tabular-nums text-[#16181A] mt-1 truncate">− {money(purchases)}</p>
              <p className="text-[11px] text-black/40 mt-0.5 truncate">přijaté objednávky</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Provozní výsledek</p>
              <p className={`text-lg sm:text-xl font-bold tabular-nums mt-1 truncate ${operating >= 0 ? 'text-[#5B7A08]' : 'text-red-600'}`}>
                {operating >= 0 ? '+' : ''}{money(operating)}
              </p>
            </div>
          </div>
        </div>
      )}

      {analyticsOpen && (laborCost > 0 || purchases > 0) && !pro && (
        <button onClick={() => setUpgradeFor('Měsíční přehled podniku')}
          className="w-full glass-card p-5 flex items-center justify-between gap-3 text-left hover:bg-black/[0.02] transition">
          <div className="min-w-0">
            <p className="font-bold text-[#16181A] flex items-center gap-2">📈 Měsíc v číslech <ProBadge /></p>
            <p className="text-sm text-black/50 mt-0.5">Tržby × mzdové náklady × nákupy a provozní výsledek na jeden pohled.</p>
          </div>
          <span className="shrink-0 text-2xl">🔒</span>
        </button>
      )}

      {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}
      {detailId != null && (
        <ClosingDetail id={detailId} payDailyCash={payDailyCash}
          onClose={() => setDetailId(null)} onChanged={load} />
      )}

      {analyticsOpen && pro && posInsights && (
        <div className="glass-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h3 className="font-bold tracking-tight text-[#16181A]">💳 Pokladna — {new Date(month + '-01T00:00:00').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })}</h3>
            <span className="text-[11px] text-black/35">z účtenek Storyous</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Tržba / účtenek</p>
              <p className="text-lg sm:text-xl font-bold tabular-nums text-[#16181A] mt-1 truncate">{money(posInsights.total)} <span className="text-xs font-semibold text-black/40">/ {posInsights.bills}</span></p>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Průměrná útrata</p>
              <p className="text-lg sm:text-xl font-bold tabular-nums text-[#16181A] mt-1 truncate">{money(posInsights.avgBill)}</p>
              {posInsights.avgPersons != null && <p className="text-[11px] text-black/40 mt-0.5">⌀ {posInsights.avgPersons} os. na účtenku</p>}
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Spropitné</p>
              <p className="text-lg sm:text-xl font-bold tabular-nums text-[#16181A] mt-1 truncate">{money(posInsights.tips)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-black/45 line-clamp-2">Refundace / slevy</p>
              <p className={`text-lg sm:text-xl font-bold tabular-nums mt-1 truncate ${posInsights.refunds.count > 0 ? 'text-amber-700' : 'text-[#16181A]'}`}>
                {posInsights.refunds.count}× ({money(posInsights.refunds.total)})
              </p>
              {posInsights.discounts > 0 && <p className="text-[11px] text-black/40 mt-0.5">slevy {money(posInsights.discounts)}</p>}
            </div>
          </div>

          {/* hourly peaks */}
          {posInsights.hours.some((h: number) => h > 0) && (() => {
            const max = Math.max(...posInsights.hours);
            const maxStaff = Array.isArray(posInsights.staff) ? Math.max(...posInsights.staff, 0) : 0;
            return (
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">
                  Špičky dne (tržba po hodinách)
                  {Array.isArray(posInsights.staff) && posInsights.staff.some((n: number) => n > 0) && (
                    <span className="ml-2 font-normal normal-case tracking-normal text-black/35">
                      · tmavý proužek = naplánovaní lidé
                    </span>
                  )}
                </p>
                <div className="flex items-end gap-[3px] h-24 overflow-x-auto scrollbar-thin">
                  {posInsights.hours.map((v: number, h: number) => {
                    const people = Array.isArray(posInsights.staff) ? Number(posInsights.staff[h]) || 0 : 0;
                    return (
                      <div key={h} className="flex flex-col items-center gap-1 min-w-[22px] flex-1"
                        title={`${h}:00 — ${money(v)}${people ? ` · ${people} naplánovaných hodin` : ''}`}>
                        <div className={`w-full rounded-t-md ${v === max && v > 0 ? 'bg-[#5B9E00]' : 'bg-[#C8F542]/70'}`}
                          style={{ height: `${max ? Math.max(v > 0 ? 6 : 0, (v / max) * 56) : 0}px` }} />
                        {/* Obsazenost pod sloupcem — kde je proužek širší než
                            sloupec vysoký, platíme lidi za prázdno. */}
                        <div className="w-full h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bg-[#16181A]/45"
                            style={{ width: `${maxStaff ? (people / maxStaff) * 100 : 0}%` }} />
                        </div>
                        <span className="text-[10px] text-black/35 tabular-nums">{h}</span>
                      </div>
                    );
                  })}
                </div>
                {Array.isArray(posInsights.staffingAdvice) && posInsights.staffingAdvice.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {posInsights.staffingAdvice.map((a: any, i: number) => (
                      <div key={i} className={`rounded-2xl border px-4 py-2.5 ${
                        a.tone === 'warn' ? 'bg-amber-500/10 border-amber-500/25 text-amber-800'
                          : a.tone === 'good' ? 'bg-[#C8F542]/10 border-[#C8F542]/30 text-[#5B7A08]'
                          : 'bg-black/[0.03] border-black/[0.07] text-black/60'}`}>
                        <p className="text-sm font-semibold">{a.title}</p>
                        <p className="text-xs mt-0.5 opacity-80 leading-relaxed">{a.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* uzávěrky proti kase */}
          {reconcile && (reconcile.insights?.length > 0 || reconcile.totals?.comparedDays > 0) && (
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Uzávěrky proti kase</p>
              <div className="space-y-2">
                {(reconcile.insights ?? []).map((i: any, idx: number) => (
                  <div key={idx} className={`rounded-2xl border px-4 py-2.5 ${
                    i.tone === 'warn' ? 'bg-amber-500/10 border-amber-500/25 text-amber-800'
                      : i.tone === 'good' ? 'bg-[#C8F542]/10 border-[#C8F542]/30 text-[#5B7A08]'
                      : 'bg-black/[0.03] border-black/[0.07] text-black/60'}`}>
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <Icon name={i.icon} size={14} /> {i.title}
                    </p>
                    <p className="text-xs mt-0.5 opacity-80 leading-relaxed">{i.text}</p>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setReconcileOpen(o => !o)}
                className="mt-2 w-full flex items-center justify-between gap-2 rounded-2xl bg-black/[0.03] border border-black/[0.06] px-4 py-2.5 text-sm font-semibold text-[#16181A]">
                <span>Den po dni ({reconcile.totals?.comparedDays ?? 0} porovnaných)</span>
                <Icon name="chevron" size={15} className={`text-black/35 transition-transform ${reconcileOpen ? 'rotate-180' : ''}`} />
              </button>
              {reconcileOpen && (
                <>
                  <div className="mt-2 flex items-center gap-3 px-4 text-[10px] uppercase tracking-wider text-black/35 sm:hidden">
                    <span className="w-14">den</span><span className="flex-1" />
                    <span>kasa</span><span>uzávěrka</span><span className="w-20 text-right">rozdíl</span>
                  </div>
                  <div className="mt-2 rounded-2xl border border-black/[0.06] divide-y divide-black/[0.05] overflow-hidden max-h-72 overflow-y-auto scrollbar-thin">
                    {reconcile.days.filter((d: any) => d.diff != null || d.bills > 0 || d.closings > 0).map((d: any) => (
                      <div key={d.day} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <span className="shrink-0 w-14 text-black/45 tabular-nums">
                          {new Date(d.day + 'T12:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-black/50 text-xs hidden sm:block">
                          {d.closings === 0 ? 'bez uzávěrky' : d.people ?? ''}
                        </span>
                        <span className="sm:hidden flex-1" />
                        <span className="shrink-0 text-xs text-black/45 tabular-nums">
                          {d.posTotal != null ? money(d.posTotal) : '—'} <span className="text-black/25 hidden sm:inline">kasa</span>
                        </span>
                        <span className="shrink-0 text-xs text-black/45 tabular-nums">
                          {d.declared != null ? money(d.declared) : '—'} <span className="text-black/25 hidden sm:inline">uzáv.</span>
                        </span>
                        <span className={`w-20 shrink-0 text-right text-xs font-bold tabular-nums ${
                          d.diff == null ? 'text-black/20'
                            : Math.abs(d.diff) <= 50 ? 'text-[#5B7A08]' : 'text-amber-700'
                        }`}>
                          {d.diff == null ? '—' : d.diff === 0 ? '✓' : `${d.diff > 0 ? '+' : ''}${money(d.diff)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-black/35">{reconcile.note}</p>
                </>
              )}
            </div>
          )}

          {/* per-person sales */}
          {posInsights.byPerson.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Tržby podle lidí (kdo markoval)</p>
              <div className="space-y-1.5">
                {posInsights.byPerson.map((p2: any) => {
                  const pct = posInsights.total ? Math.round((p2.total / posInsights.total) * 100) : 0;
                  return (
                    <div key={p2.name} className="relative overflow-hidden rounded-xl border border-black/[0.06] bg-white/50 px-3.5 py-2">
                      <span className="absolute inset-y-0 left-0 bg-[#C8F542]/25" style={{ width: `${pct}%` }} />
                      <span className="relative flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-[#16181A]">{p2.name}</span>
                        <span className="shrink-0 text-black/55 tabular-nums">{money(p2.total)} · {p2.bills} úč. · {pct} %</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Revenue trend chart */}
      {analyticsOpen && daily.length >= 2 && (() => {
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
                        <text x={x + barW / 2} y={labelY} textAnchor="middle" className="text-[9px] sm:text-[11px] fill-black/40">{day}.</text>
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

      {/* Month calendar — done / missing / pending at a glance; a click scopes the list. */}
      <ClosingsCalendar selectedDate={selectedDate} onSelectDate={pickDate} reloadKey={dataVersion} />

      <div ref={listRef} className="flex items-center justify-between gap-3 flex-wrap scroll-mt-4">
        <h3 className="text-lg font-bold tracking-tight text-[#16181A]">Uzávěrky ({topLevel.length})</h3>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => openCreate()}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#16181A] text-white px-4 py-2 text-sm font-semibold hover:bg-black transition whitespace-nowrap">
            <Icon name="plus" size={16} /> Nová uzávěrka
          </button>
          {topLevel.length > 0 && (
            <>
              <button onClick={exportCsv}
                className="rounded-full glass border border-black/10 text-[#16181A] px-4 py-2 text-sm font-medium hover:bg-black/[0.05] transition whitespace-nowrap">
                Export CSV ↓
              </button>
              <button onClick={exportAccountant}
                className="rounded-full glass border border-black/10 text-[#16181A] px-4 py-2 text-sm font-medium hover:bg-black/[0.05] transition whitespace-nowrap">
                🧾 Pro účetní ↓
              </button>
            </>
          )}
        </div>
      </div>

      {selectedDate && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#C8F542]/[0.10] border border-[#C8F542]/35 px-4 py-3">
          <p className="text-sm font-semibold text-[#16181A] capitalize min-w-0">
            {fmtMissing(selectedDate)}
            <span className="font-normal text-black/45"> · {topLevel.length === 0 ? 'bez uzávěrky' : `${topLevel.length}× uzávěrka`}</span>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {topLevel.length === 0 && (
              <button onClick={() => openCreate(selectedDate)}
                className="rounded-full bg-[#16181A] text-white text-sm font-semibold px-4 py-2 hover:bg-black transition inline-flex items-center gap-1.5">
                <Icon name="plus" size={15} /> Vyplnit
              </button>
            )}
            <button onClick={() => setSelectedDate(null)}
              className="rounded-full glass border border-black/10 text-[#16181A] px-4 py-2 text-sm font-medium hover:bg-black/[0.05] transition">
              Zrušit výběr
            </button>
          </div>
        </div>
      )}

      {months.length > 1 && !selectedDate && (
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
        <div className="glass-card p-8 text-center">
          <p className="text-black/45">{selectedDate ? 'Za tento den není žádná uzávěrka.' : 'Zatím žádné uzávěrky od zaměstnanců.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {topLevel.map(c => {
            const d = cashDifference(c);
            const expected = expectedCash(c);
            const lines = expectedCashLines(c, { payoutLabel: 'Výplata zaměstnance' });

            const covered = coveredBy(c.id);
            // The closing belongs to the whole shift; the author only filled it in.
            const crew = crewOf(c);
            const crewLabel = crew.map(p => p.name).join(' + ');
            // Everyone scheduled that day, and who is / isn't covered by a closing.
            const scheduled = scheduledByDate[c.date] ?? [];
            const coveredIds = new Set<number>([c.created_by, ...covered.map(cv => cv.created_by), ...crew.map(p => p.id)]);
            // Union of the shift crew and the day's roster, de-duplicated.
            const roster: Person[] = [...crew];
            for (const p of scheduled) if (!roster.some(r => r.id === p.id)) roster.push(p);
            return (
              <div key={c.id} className="glass-card overflow-hidden">
                <button onClick={() => setDetailId(c.id)} aria-label="Otevřít detail uzávěrky"
                  className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-x-3 gap-y-2 flex-wrap hover:bg-black/[0.02] active:bg-black/[0.04] transition-colors">
                  {/* basis-full: na telefonu si datum a směna berou celý řádek,
                      odznaky se zalomí pod ně. Bez toho zbylo na „Směna: …"
                      padesát pixelů. */}
                  <div className="min-w-0 basis-full sm:basis-0 sm:flex-1 flex items-center gap-3">
                    <PersonLink id={c.created_by} className="text-lg flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60">{c.author_avatar ?? '👤'}</PersonLink>
                    <div className="min-w-0">
                      <p className="font-bold tracking-tight text-[#16181A] truncate">
                        {new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })}
                        {c.shift_label && <span className="text-black/40 font-normal"> · {c.shift_label}</span>}
                        {(c as any).event_title && (
                          <span className="ml-1.5 rounded-full bg-[#0A84FF]/12 text-[#0A6FE0] px-2 py-0.5 text-[11px] font-bold align-middle">
                            🎪 {(c as any).event_title}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-black/45 truncate">Směna: {crewLabel} · Tržba {money(c.cash_revenue + c.card_revenue)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {covered.length > 0 && (
                      <span className="tap-target-sm hidden sm:inline-flex items-center gap-1 rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-2.5 py-1 text-xs font-medium whitespace-nowrap">
                        <Icon name="users" size={12} /> +{covered.length}
                      </span>
                    )}
                    {c.approved === false && (
                      <span className="tap-target-sm rounded-full bg-orange-500/15 text-orange-600 px-2.5 py-1 text-xs font-medium whitespace-nowrap">Čeká na schválení</span>
                    )}
                    <span className={`tap-target-sm text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
                      d === 0 ? 'bg-[#C8F542]/15 text-[#5B7A08]' : d > 0 ? 'bg-[#0A84FF]/15 text-[#0A6FE0]' : 'bg-red-500/15 text-red-600'
                    }`}>
                      {d === 0 ? 'Sedí' : d > 0 ? `+${money(d)}` : money(d)}
                      {/* When the closer explained the difference, say so right in
                          the row — an explained manko reads very differently. */}
                      {d !== 0 && c.diff_reason && (
                        <span className="hidden sm:inline font-normal opacity-75"> · {diffReasonLabel(c.diff_reason)}</span>
                      )}
                    </span>
                    <Icon name="chevron" size={16} className="text-black/35 -rotate-90" />
                  </div>
                </button>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
