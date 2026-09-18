'use client';

// Finance — where the money goes. Monthly summary from the numbers the app
// already collects (closings, receipts, orders, attendance × wages), a ledger
// of every outgoing crown with clickable receipts, algorithmic advice, and a
// CSV export the accountant can open directly.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { usePlan, UpgradeModal } from '../Pro';
import ShrinkageReport from '../inventory/ShrinkageReport';
import LiveRevenue from './LiveRevenue';
import FinanceAdvice from './FinanceAdvice';
import { PageHeader, Button , SearchField } from '../ui';
import { useModal } from '@/lib/useModal';
import { okJson } from '@/lib/api';
import { DiscardGuard } from '../ui/DiscardGuard';

interface Row {
  date: string; kind: string; label: string; amount: number;
  receiptId?: number; photoUrl?: string | null; note?: string | null;
}
interface Insight { icon: string; title: string; text: string; tone: 'good' | 'warn' | 'info' }

const KIND_META: Record<string, { label: string; cls: string }> = {
  receipt: { label: 'Účtenka', cls: 'bg-[#C8F542]/20 text-[#5B7A08]' },
  order: { label: 'Objednávka', cls: 'bg-[#0A84FF]/12 text-[#0A5CC0]' },
  expense: { label: 'Výdaj z kasy', cls: 'bg-wait/15 text-wait-ink' },
  wage: { label: 'Výplata', cls: 'bg-[#16181A]/[0.07] text-[#16181A]/75' },
  removal: { label: 'Odvod', cls: 'bg-black/[0.06] text-black/55' },
};

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
}

export default function FinanceView() {
  const money = useMoney();
  const symbol = useSymbol();
  const { pro } = usePlan();
  const [upgradeFor, setUpgradeFor] = useState<string | null>(null);
  const [month, setMonth] = useState(() => ym(new Date()));
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  // Hledání v položkách: účetní se ptá „kolik jsme loni dali Moninu",
  // a klikat se přes celý měsíc je zdlouhavé.
  const [q, setQ] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const detailModal = useModal(!!detail, () => setDetail(null), 'Detail položky');

  const [pos, setPos] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/finance?month=${month}`).then(okJson)
      .then(d => { if (alive && !d.error) setData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    // Prodeje z pokladny proti recepturám a cenám skladu — marže po položkách.
    // Načítá se zvlášť, aby chybějící pokladna nezdržela zbytek přehledu.
    setPos(null);
    fetch(`/api/pos/margins?month=${month}`).then(okJson)
      .then(d => { if (alive && d?.connected && d?.ready) setPos(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [month]);

  const s = data?.summary;
  const g = data?.guest as { orders: number; total: number; offPos: number; offPosTotal: number; members: number; newMembers: number; couponsRedeemed: number } | undefined;
  const ledger: Row[] = data?.ledger ?? [];
  const needle = q.trim().toLowerCase();
  const filtered = ledger
    .filter(r => filter === 'all' || r.kind === filter)
    .filter(r => !needle || `${r.label} ${r.note ?? ''}`.toLowerCase().includes(needle));
  const filteredSum = filtered.reduce((a, r) => a + r.amount, 0);
  const trendPct = s && s.prevRevenue > 0
    ? Math.round(((s.revenue - s.prevRevenue) / s.prevRevenue) * 100) : null;

  // Where the money went, as proportional bars.
  const breakdown = useMemo(() => {
    if (!s) return [];
    const wages = Math.max(s.wagesCash, s.wagesWorked);
    const rows = [
      { label: 'Nákupy a účtenky', amount: ledger.filter(r => r.kind === 'receipt' || r.kind === 'order').reduce((a, r) => a + r.amount, 0), cls: 'bg-[#C8F542]' },
      { label: 'Výdaje z kasy', amount: ledger.filter(r => r.kind === 'expense').reduce((a, r) => a + r.amount, 0), cls: 'bg-wait' },
      { label: 'Mzdy', amount: wages, cls: 'bg-[#16181A]/70' },
    ].filter(r => r.amount > 0);
    const max = Math.max(...rows.map(r => r.amount), 1);
    return rows.map(r => ({ ...r, pct: Math.round((r.amount / max) * 100) }));
  }, [s, ledger]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(ym(new Date(y, m - 1 + delta, 1)));
  };

  /**
   * Vlastní export pro účetní: rozsah měsíců a co do souboru patří.
   * Data za jiné měsíce se dotáhnou stejným koncovým bodem jako přehled,
   * takže v souboru sedí čísla s tím, co vedení vidí na obrazovce.
   */
  const exportCustom = async (opts: { from: string; to: string; items: boolean; summary: boolean; guest: boolean; sep: string }) => {
    if (!pro) { setUpgradeFor('Export pro účetní'); return; }
    const months: string[] = [];
    const [fy, fm] = opts.from.split('-').map(Number);
    const [ty, tm] = opts.to.split('-').map(Number);
    for (let d = new Date(fy, fm - 1, 1); d <= new Date(ty, tm - 1, 1); d.setMonth(d.getMonth() + 1)) months.push(ym(new Date(d)));
    if (!months.length) return;
    const rows: string[][] = [];
    for (const mo of months) {
      const d = mo === month ? data : await fetch(`/api/finance?month=${mo}`).then(okJson).catch(() => null);
      if (!d || d.error) continue;
      if (opts.items) {
        rows.push([`Položky ${mo}`, '', '', '', '']);
        rows.push(['Datum', 'Typ', 'Popis', `Částka (${symbol})`, 'Poznámka']);
        for (const r of (d.ledger ?? []) as Row[]) rows.push([r.date, KIND_META[r.kind]?.label ?? r.kind, r.label, String(r.amount), r.note ?? '']);
        rows.push([]);
      }
      if (opts.summary) {
        const q = d.summary ?? {};
        rows.push([`Souhrn ${mo}`, '', '', '', '']);
        for (const [lb, v] of [['Tržby celkem', q.revenue], ['— hotovost', q.cash], ['— karty', q.card], ['Spropitné', q.tips],
          ['Nákupy a výdaje', q.purchases], ['Mzdy (odpracováno × sazba)', q.wagesWorked], ['Výplaty hotově z kasy', q.wagesCash],
          ['Hodnota skladu', q.stockValue], ['Rozdíly v kase', q.diffSum], ['Hrubý výsledek', q.gross]] as [string, any][]) {
          rows.push(['', lb, '', String(Math.round(Number(v) || 0)), '']);
        }
        rows.push([]);
      }
      if (opts.guest && d.guest) {
        rows.push([`Hosté ${mo}`, '', '', '', '']);
        for (const [lb, v] of [['Objednávek od stolu', d.guest.orders], ['Tržba z objednávek', d.guest.total],
          ['Z toho mimo pokladnu', d.guest.offPosTotal], ['Členů věrnosti', d.guest.members],
          ['Nových členů', d.guest.newMembers], ['Uplatněných kuponů', d.guest.couponsRedeemed]] as [string, any][]) {
          rows.push(['', lb, '', String(Math.round(Number(v) || 0)), '']);
        }
        rows.push([]);
      }
    }
    const csv = rows.map(r => (r as string[]).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(opts.sep)).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = months.length === 1 ? `finance-${months[0]}.csv` : `finance-${months[0]}-az-${months[months.length - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExportOpen(false);
  };

  const exportCsv = () => {
    if (!pro) { setUpgradeFor('Export pro účetní'); return; }
    const head = ['Datum', 'Typ', 'Popis', `Částka (${symbol})`, 'Poznámka'];
    const rows = ledger.map(r => [
      r.date, KIND_META[r.kind]?.label ?? r.kind, r.label, String(r.amount), r.note ?? '',
    ]);
    rows.push([], ['Souhrn', '', '', '', '']);
    rows.push(['', 'Tržby celkem', '', String(s?.revenue ?? 0), '']);
    rows.push(['', '— hotovost', '', String(s?.cash ?? 0), '']);
    rows.push(['', '— karty', '', String(s?.card ?? 0), '']);
    rows.push(['', 'Spropitné', '', String(s?.tips ?? 0), '']);
    rows.push(['', 'Nákupy + výdaje', '', String(s?.purchases ?? 0), '']);
    rows.push(['', 'Mzdy (odpracováno × sazba)', '', String(s?.wagesWorked ?? 0), '']);
    rows.push(['', 'Výplaty hotově z kasy', '', String(s?.wagesCash ?? 0), '']);
    rows.push(['', 'Hrubý výsledek', '', String(s?.gross ?? 0), '']);
    const csv = [head, ...rows]
      .map(r => (r as string[]).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finance-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const TONES = {
    good: 'border-[#C8F542]/40 bg-[#C8F542]/[0.10] text-[#3E5406]',
    warn: 'border-wait/30 bg-wait/[0.08] text-wait-ink',
    info: 'border-[#0A84FF]/25 bg-[#0A84FF]/[0.06] text-[#0A5CC0]',
  } as const;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Hlavička jako všude jinde: nadpis h1, jedna hlavní akce v limetkové,
          přepínač měsíce pod ní. Dřív si ji tahle obrazovka kreslila sama —
          měla h2 místo h1 a hlavní akci v tmavé, takže vypadala jako z jiné
          aplikace. */}
      <PageHeader hintId="financeview"
        title="Finance"
        subtitle="Tržby, nákupy a mzdy měsíce pohromadě."
        primary={<Button onClick={() => (pro ? setExportOpen(true) : setUpgradeFor('Export pro účetní'))} variant="accent" icon="download">Export pro účetní</Button>}
        aside={
          <div className="flex items-center gap-1 glass rounded-full p-1 min-w-0 w-full sm:w-fit">
            <button onClick={() => shiftMonth(-1)} aria-label="Předchozí měsíc" className="tap-target btn-icon">
              <Icon name="chevron" size={16} className="rotate-90" />
            </button>
            <span className="px-2 min-w-0 sm:min-w-[9rem] flex-1 text-center text-sm font-semibold cz-sentence text-[#16181A] truncate">{monthLabel(month)}</span>
            <button onClick={() => shiftMonth(1)} aria-label="Další měsíc" className="tap-target btn-icon">
              <Icon name="chevron" size={16} className="-rotate-90" />
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-56">
          <div className="spinner" />
        </div>
      ) : !s ? (
        <div className="glass-card p-8 text-center text-black/45">Data se nepodařilo načíst.</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative overflow-hidden rounded-3xl bg-[#16181A] text-white p-4">
              <div className="pointer-events-none absolute -top-14 -right-10 h-32 w-32 rounded-full bg-[#C8F542]/25 blur-2xl" />
              <p className="text-[11px] uppercase tracking-wider text-white/70 font-bold">Tržby</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{money(s.revenue)}</p>
              <p className="text-[11px] text-white/70 mt-0.5">
                {trendPct != null ? `${trendPct >= 0 ? '+' : ''}${trendPct} % vs. minulý měsíc` : `${s.closingsCount} uzávěrek`}
              </p>
            </div>
            <div className="glass-card rounded-3xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-black/45 font-bold">Nákupy a výdaje</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#16181A]">{money(s.purchases)}</p>
              <p className="text-[11px] text-black/40 mt-0.5">účtenky, objednávky, kasa</p>
            </div>
            <div className="glass-card rounded-3xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-black/45 font-bold">Mzdy</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#16181A]">{money(Math.max(s.wagesCash, s.wagesWorked))}</p>
              <p className="text-[11px] text-black/40 mt-0.5">
                {s.wagesWorked > 0 ? 'z docházky × sazby' : 'z denních výplat'}
              </p>
            </div>
            <div className="glass-card rounded-3xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-black/45 font-bold">Hrubý výsledek</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${s.gross >= 0 ? 'text-[#5B7A08]' : 'text-bad-ink'}`}>{money(s.gross)}</p>
              <p className="text-[11px] text-black/40 mt-0.5">tržby − nákupy − mzdy</p>
            </div>
          </div>

          {/* Where the money went */}
          {breakdown.length > 0 && (
            <div className="glass-card rounded-3xl p-5 space-y-3">
              <h3 className="t-label">Kam šly peníze</h3>
              {breakdown.map(b => (
                <div key={b.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-[#16181A]">{b.label}</span>
                    <span className="tabular-nums font-bold text-[#16181A]">{money(b.amount)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-black/[0.05] overflow-hidden">
                    <div className={`h-full rounded-full ${b.cls}`} style={{ width: `${b.pct}%` }} />
                  </div>
                </div>
              ))}
              {s.stockValue > 0 && (
                <p className="text-[11px] text-black/40 pt-1">
                  Navíc ve skladu aktuálně leží zboží za {money(s.stockValue)}.
                </p>
              )}
            </div>
          )}

          {/* Hosté a věrnost — peníze, které přišly přes stůl a kartičku.
              Patří k financím: objednávka mimo pokladnu v tržbách chybí. */}
          {g && (g.orders > 0 || g.members > 0) && (
            <div className="glass-card rounded-3xl p-5 space-y-3">
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <h3 className="t-label">Hosté a věrnost</h3>
                <span className="text-xs text-black/45">z objednávek od stolu a kartiček</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {([
                  ['Objednávek od stolu', String(g.orders), `${money(g.total)} celkem`],
                  ['Mimo pokladnu', String(g.offPos), g.offPos > 0 ? `${money(g.offPosTotal)} chybí v tržbách` : 'vše dorazilo do kasy'],
                  ['Členů věrnosti', String(g.members), `${g.newMembers} nových tento měsíc`],
                  ['Uplatněných kuponů', String(g.couponsRedeemed), 'sleva na útratě'],
                ] as [string, string, string][]).map(([lb, val, sub]) => (
                  <div key={lb} className="well px-3.5 py-3">
                    <p className="t-label">{lb}</p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-[#16181A]">{val}</p>
                    <p className="text-[11px] text-black/40 leading-snug">{sub}</p>
                  </div>
                ))}
              </div>
              {g.offPos > 0 && (
                <p className="text-[11px] text-black/45">
                  Objednávky mimo pokladnu se nepropsaly do Storyous. Buď je doúčtuj u kasy, nebo v Klientu zapni automatické odesílání.
                </p>
              )}
            </div>
          )}

          {/* Doporučení — co s čísly udělat. Nahradilo krátký seznam rad;
              dvě sady doporučení vedle sebe by si konkurovaly. */}
          <FinanceAdvice month={month} />

          {/* Živý pohled na dnešek patří nad měsíční rekapitulaci — podle něj
              se rozhoduje teď, ne až na konci měsíce. */}
          <LiveRevenue />

          {/* Ztráty ze skladu — poslední inventura v penězích. Patří k penězům
              stejně jako nákupy: to, co zmizí, se nakupuje znovu. */}
          <ShrinkageReport />

          {/* Co vydělává — z pokladny přes receptury na ceny skladu */}
          {pos && pos.items?.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3 px-1">
                <h3 className="t-label">Co vydělává (z pokladny)</h3>
                {pos.totals?.marginPct != null && (
                  <span className="text-xs text-black/45">
                    marže <b className="text-[#5B7A08]">{pos.totals.marginPct} %</b> na položkách s recepturou
                  </span>
                )}
              </div>

              {(pos.insights ?? []).length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 stagger">
                  {pos.insights.map((ins: Insight, i: number) => (
                    <div key={i} className={`rounded-2xl border p-4 ${TONES[ins.tone]}`}>
                      <p className="text-sm font-bold flex items-center gap-2">
                        <Icon name={ins.icon as any} size={16} className="shrink-0" /> {ins.title}
                      </p>
                      <p className="text-[13px] mt-1 opacity-80">{ins.text}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="glass-card overflow-hidden">
                <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-black/40 border-b border-black/[0.06]">
                  <span className="flex-1">Položka</span>
                  <span className="w-16 text-right">Prodáno</span>
                  <span className="w-24 text-right">Tržba</span>
                  <span className="w-24 text-right">Suroviny</span>
                  <span className="w-20 text-right">Marže</span>
                </div>
                <div className="divide-y divide-black/[0.06] max-h-[420px] overflow-y-auto">
                  {pos.items.map((it: any) => (
                    <div key={it.productId} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#16181A] truncate">{it.name}</p>
                        <p className="text-[11px] text-black/40 truncate">
                          {it.category || 'bez kategorie'}
                          {it.cost == null && <span className="text-wait-ink"> · bez receptury</span>}
                        </p>
                        {/* Čtyři pevné sloupce (64+96+96+80 px a mezery) se na 390 px
                            nevejdou a název, který je `flex-1`, zkolaboval na nulu —
                            zbyla řada čísel bez toho, čeho se týkají. Na telefonu
                            se proto čísla čtou jako věta pod názvem. */}
                        <p className="sm:hidden mt-0.5 text-[11px] tabular text-black/55">
                          {Math.round(it.qty)}× · {it.revenue != null ? money(it.revenue) : '—'}
                          {it.marginPct != null && <> · marže {it.marginPct} %</>}
                        </p>
                      </div>
                      <span className="hidden sm:block w-16 text-right text-sm tabular text-black/60">{Math.round(it.qty)}×</span>
                      <span className="hidden sm:block w-24 text-right text-sm tabular font-semibold text-[#16181A]">
                        {it.revenue != null ? money(it.revenue) : '—'}
                      </span>
                      <span className="hidden sm:block w-24 text-right text-sm tabular text-black/55">
                        {it.cost != null ? money(it.cost * it.qty) : '—'}
                      </span>
                      <span className={`hidden sm:block w-20 text-right text-sm tabular font-bold ${
                        it.marginPct == null ? 'text-black/30'
                          : it.marginPct >= 65 ? 'text-[#5B7A08]'
                          : it.marginPct >= 45 ? 'text-[#16181A]' : 'text-bad-ink'
                      }`}>
                        {it.marginPct != null ? `${it.marginPct} %` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {pos.menuError && <p className="text-xs text-wait-ink px-1">{pos.menuError}</p>}
            </div>
          )}

          {/* Ledger */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="t-label">Výdaje ({filtered.length}{filtered.length !== ledger.length ? ` z ${ledger.length}` : ''}) · {money(filteredSum)}</h3>
              <div className="flex items-center gap-2 flex-wrap min-w-0 w-full sm:w-auto">
              <SearchField className="min-w-0 flex-1 sm:flex-none sm:w-52" value={q} onChange={setQ}
                placeholder="Hledat v popisu" ariaLabel="Hledat ve výdajích" storageKey="finance"
                inputClassName="!py-2 text-xs" />
              <div className="flex gap-1 glass rounded-full p-1 overflow-x-auto scrollbar-none min-w-0 basis-full sm:basis-auto">
                {[['all', 'Vše'], ['receipt', 'Účtenky'], ['order', 'Objednávky'], ['expense', 'Z kasy'], ['wage', 'Výplaty']].map(([id, label]) => (
                  <button key={id} onClick={() => setFilter(id)}
                    className={`tap-target-sm shrink-0 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap transition ${
                      filter === id ? 'seg-on' : 'seg-off'
                    }`}>{label}</button>
                ))}
              </div>
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="glass-card p-8 text-center text-black/45">V tomhle měsíci tu nic není.</div>
            ) : (
              <div className="glass-card rounded-3xl divide-y divide-black/[0.05] overflow-hidden">
                {filtered.map((r, i) => {
                  const meta = KIND_META[r.kind] ?? { label: r.kind, cls: 'bg-black/[0.06] text-black/55' };
                  const clickable = r.kind === 'receipt';
                  return (
                    <button key={i} onClick={() => clickable && setDetail(r)}
                      className={`w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left ${clickable ? 'hover:bg-black/[0.02] transition cursor-pointer' : 'cursor-default'}`}>
                      <span className="text-xs text-black/40 tabular-nums w-12 shrink-0">
                        {parseInt(r.date.split('-')[2])}.{parseInt(r.date.split('-')[1])}.
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
                      {/* Na telefonu se „Objednávka Monin CZ" nevešla vedle data,
                          štítku i částky — popis dostane vlastní řádek.
                          Musí to být basis-full, ne w-full: flex-1 nastavuje
                          flex-basis:0, a ten šířku přebije, takže se nezalomí. */}
                      <span className="basis-full sm:basis-0 order-last sm:order-none grow min-w-0 text-sm font-medium text-[#16181A] truncate">
                        {r.label}
                        {r.note && <span className="text-black/40 font-normal"> · {r.note}</span>}
                      </span>
                      {r.photoUrl && <Icon name="camera" size={14} className="text-black/30 shrink-0" />}
                      <span className="shrink-0 text-sm font-bold tabular-nums text-[#16181A]">−{money(r.amount)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Receipt detail */}
      {detail && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4" onClick={() => setDetail(null)}>
          <div ref={detailModal.ref} {...detailModal.dialogProps} className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-3 scrollbar-thin" onClick={e => e.stopPropagation()}>
            <DiscardGuard guard={detailModal.guard} />
            <div className="flex items-center justify-between gap-3">
              <h3 className="t-card flex items-center gap-2">
                <Icon name="receipt" size={20} className="text-[#5B7A08]" /> {detail.label}
              </h3>
              <button aria-label="Zavřít" onClick={() => setDetail(null)} className="btn-icon"><Icon name="close" size={15} /></button>
            </div>
            <p className="text-sm text-black/50">
              {new Date(detail.date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' · '}<span className="font-bold text-[#16181A] tabular-nums">{money(detail.amount)}</span>
            </p>
            {detail.note && <p className="text-sm text-black/60 well px-4 py-2.5">{detail.note}</p>}
            {detail.photoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detail.photoUrl} alt="Účtenka" className="w-full rounded-2xl border border-black/[0.06]" />
                <a href={detail.photoUrl} download={`uctenka-${detail.date}.jpg`}
                  className="block w-full text-center rounded-full bg-[#16181A] text-white font-bold px-5 py-3 text-sm hover:bg-black transition">
                  Stáhnout fotku ↓
                </a>
              </>
            ) : (
              <p className="text-sm text-black/40">Bez fotky.</p>
            )}
          </div>
        </div>
      )}

      {exportOpen && <ExportDialog month={month} onClose={() => setExportOpen(false)} onExport={exportCustom} />}
      {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}
    </div>
  );
}

/** Sestavitelný export: od kdy do kdy a co v souboru bude. */
function ExportDialog({ month, onClose, onExport }: {
  month: string; onClose: () => void;
  onExport: (o: { from: string; to: string; items: boolean; summary: boolean; guest: boolean; sep: string }) => Promise<void>;
}) {
  const [from, setFrom] = useState(month);
  const em = useModal(true, onClose, 'Export pro účetní');
  const [to, setTo] = useState(month);
  const [items, setItems] = useState(true);
  const [summary, setSummary] = useState(true);
  const [guest, setGuest] = useState(false);
  const [sep, setSep] = useState(';');
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); await onExport({ from, to: to < from ? from : to, items, summary, guest, sep }); setBusy(false); };
  const box = 'w-full rounded-2xl bg-white/70 border border-black/[0.08] px-4 py-2.5 text-sm focus:border-[#C8F542]/60 focus:ring-2 focus:ring-[#C8F542]/25 focus:outline-none transition';
  const lb = 'block text-xs font-semibold text-black/55 mb-1.5';
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4" onClick={onClose}>
      <div ref={em.ref} {...em.dialogProps} className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <DiscardGuard guard={em.guard} />
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold tracking-tight">Export pro účetní</h3>
          <button onClick={em.guard.attemptClose} aria-label="Zavřít" className="tap-target rounded-full w-9 h-9 grid place-items-center glass text-black/50 hover:text-black"><Icon name="close" size={15} /></button>
        </div>
        <p className="text-sm text-black/55">Vyber období a co má být v souboru. Stáhne se jeden soubor CSV, který otevře Excel i účetní program.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="ex-from" className={lb}>Od měsíce</label><input id="ex-from" type="month" value={from} onChange={e => setFrom(e.target.value)} className={box} /></div>
          <div><label htmlFor="ex-to" className={lb}>Do měsíce</label><input id="ex-to" type="month" value={to} onChange={e => setTo(e.target.value)} className={box} /></div>
        </div>
        <fieldset className="space-y-1">
          <legend className={lb}>Co zahrnout</legend>
          {([['items', 'Jednotlivé výdaje', items, setItems], ['summary', 'Souhrn měsíce', summary, setSummary], ['guest', 'Hosté a věrnost', guest, setGuest]] as const).map(([id, label, val, set]) => (
            <label key={id} className="flex items-center min-h-9 py-1 gap-3 text-sm">
              <input type="checkbox" checked={val} onChange={e => (set as any)(e.target.checked)} className="h-4 w-4 accent-[#16181A]" />{label}
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor="ex-sep" className={lb}>Oddělovač</label>
          <select id="ex-sep" value={sep} onChange={e => setSep(e.target.value)} className={box}>
            <option value=";">Středník — pro český Excel</option>
            <option value=",">Čárka — pro účetní programy a Google Tabulky</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>Zrušit</Button>
          <Button variant="accent" icon="download" loading={busy} disabled={!items && !summary && !guest} onClick={run}>Stáhnout</Button>
        </div>
      </div>
    </div>
  );
}
