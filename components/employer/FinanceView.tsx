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

interface Row {
  date: string; kind: string; label: string; amount: number;
  receiptId?: number; photoUrl?: string | null; note?: string | null;
}
interface Insight { icon: string; title: string; text: string; tone: 'good' | 'warn' | 'info' }

const KIND_META: Record<string, { label: string; cls: string }> = {
  receipt: { label: 'Účtenka', cls: 'bg-[#C8F542]/20 text-[#5B7A08]' },
  order: { label: 'Objednávka', cls: 'bg-[#0A84FF]/12 text-[#0A6FE0]' },
  expense: { label: 'Výdaj z kasy', cls: 'bg-amber-500/15 text-amber-700' },
  wage: { label: 'Výplata', cls: 'bg-purple-500/12 text-purple-700' },
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
  const [detail, setDetail] = useState<Row | null>(null);

  const [pos, setPos] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/finance?month=${month}`).then(r => r.json())
      .then(d => { if (alive && !d.error) setData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    // Prodeje z pokladny proti recepturám a cenám skladu — marže po položkách.
    // Načítá se zvlášť, aby chybějící pokladna nezdržela zbytek přehledu.
    setPos(null);
    fetch(`/api/pos/margins?month=${month}`).then(r => r.json())
      .then(d => { if (alive && d?.connected && d?.ready) setPos(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [month]);

  const s = data?.summary;
  const ledger: Row[] = data?.ledger ?? [];
  const filtered = filter === 'all' ? ledger : ledger.filter(r => r.kind === filter);
  const trendPct = s && s.prevRevenue > 0
    ? Math.round(((s.revenue - s.prevRevenue) / s.prevRevenue) * 100) : null;

  // Where the money went, as proportional bars.
  const breakdown = useMemo(() => {
    if (!s) return [];
    const wages = Math.max(s.wagesCash, s.wagesWorked);
    const rows = [
      { label: 'Nákupy a účtenky', amount: ledger.filter(r => r.kind === 'receipt' || r.kind === 'order').reduce((a, r) => a + r.amount, 0), cls: 'bg-[#C8F542]' },
      { label: 'Výdaje z kasy', amount: ledger.filter(r => r.kind === 'expense').reduce((a, r) => a + r.amount, 0), cls: 'bg-amber-400' },
      { label: 'Mzdy', amount: wages, cls: 'bg-purple-400' },
    ].filter(r => r.amount > 0);
    const max = Math.max(...rows.map(r => r.amount), 1);
    return rows.map(r => ({ ...r, pct: Math.round((r.amount / max) * 100) }));
  }, [s, ledger]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(ym(new Date(y, m - 1 + delta, 1)));
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
    warn: 'border-amber-500/30 bg-amber-500/[0.08] text-amber-800',
    info: 'border-[#0A84FF]/25 bg-[#0A84FF]/[0.06] text-[#0A5FC4]',
  } as const;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon name="coins" size={22} className="text-[#16181A] shrink-0" />
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A] truncate">Finance</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="flex items-center gap-1 glass rounded-full p-1">
            <button onClick={() => shiftMonth(-1)} className="h-9 w-9 grid place-items-center rounded-full text-black/55 hover:text-black hover:bg-black/[0.06] transition">
              <Icon name="chevron" size={16} className="rotate-90" />
            </button>
            <span className="px-2 min-w-[9rem] text-center text-sm font-semibold capitalize text-[#16181A]">{monthLabel(month)}</span>
            <button onClick={() => shiftMonth(1)} className="h-9 w-9 grid place-items-center rounded-full text-black/55 hover:text-black hover:bg-black/[0.06] transition">
              <Icon name="chevron" size={16} className="-rotate-90" />
            </button>
          </div>
          <button onClick={exportCsv}
            className="rounded-full bg-[#16181A] text-white px-4 py-2.5 text-sm font-bold hover:bg-black transition whitespace-nowrap">
            Export pro účetní ↓
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-56">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : !s ? (
        <div className="glass-card p-8 text-center text-black/45">Data se nepodařilo načíst.</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative overflow-hidden rounded-[26px] bg-[#16181A] text-white p-4">
              <div className="pointer-events-none absolute -top-14 -right-10 h-32 w-32 rounded-full bg-[#C8F542]/25 blur-2xl" />
              <p className="text-[11px] uppercase tracking-wider text-white/45 font-bold">Tržby</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{money(s.revenue)}</p>
              <p className="text-[11px] text-white/40 mt-0.5">
                {trendPct != null ? `${trendPct >= 0 ? '+' : ''}${trendPct} % vs. minulý měsíc` : `${s.closingsCount} uzávěrek`}
              </p>
            </div>
            <div className="glass-card rounded-[26px] p-4">
              <p className="text-[11px] uppercase tracking-wider text-black/45 font-bold">Nákupy a výdaje</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#16181A]">{money(s.purchases)}</p>
              <p className="text-[11px] text-black/40 mt-0.5">účtenky, objednávky, kasa</p>
            </div>
            <div className="glass-card rounded-[26px] p-4">
              <p className="text-[11px] uppercase tracking-wider text-black/45 font-bold">Mzdy</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#16181A]">{money(Math.max(s.wagesCash, s.wagesWorked))}</p>
              <p className="text-[11px] text-black/40 mt-0.5">
                {s.wagesWorked > 0 ? 'z docházky × sazby' : 'z denních výplat'}
              </p>
            </div>
            <div className="glass-card rounded-[26px] p-4">
              <p className="text-[11px] uppercase tracking-wider text-black/45 font-bold">Hrubý výsledek</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${s.gross >= 0 ? 'text-[#5B7A08]' : 'text-red-600'}`}>{money(s.gross)}</p>
              <p className="text-[11px] text-black/40 mt-0.5">tržby − nákupy − mzdy</p>
            </div>
          </div>

          {/* Where the money went */}
          {breakdown.length > 0 && (
            <div className="glass-card rounded-[26px] p-5 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-black/55">Kam šly peníze</h3>
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

          {/* Advice */}
          {(data.insights ?? []).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-black/55 px-1">Rady k financím</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {data.insights.map((ins: Insight, i: number) => (
                  <div key={i} className={`rounded-2xl border p-4 ${TONES[ins.tone]}`}>
                    <p className="text-sm font-bold flex items-center gap-2">
                      <Icon name={ins.icon as any} size={16} className="shrink-0" /> {ins.title}
                    </p>
                    <p className="text-[13px] mt-1 opacity-80">{ins.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ztráty ze skladu — poslední inventura v penězích. Patří k penězům
              stejně jako nákupy: to, co zmizí, se nakupuje znovu. */}
          <ShrinkageReport />

          {/* Co vydělává — z pokladny přes receptury na ceny skladu */}
          {pos && pos.items?.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3 px-1">
                <h3 className="text-sm font-bold uppercase tracking-wider text-black/55">Co vydělává (z pokladny)</h3>
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
                          {it.cost == null && <span className="text-amber-700"> · bez receptury</span>}
                        </p>
                      </div>
                      <span className="w-16 text-right text-sm tabular text-black/60">{Math.round(it.qty)}×</span>
                      <span className="w-24 text-right text-sm tabular font-semibold text-[#16181A]">
                        {it.revenue != null ? money(it.revenue) : '—'}
                      </span>
                      <span className="w-24 text-right text-sm tabular text-black/55">
                        {it.cost != null ? money(it.cost * it.qty) : '—'}
                      </span>
                      <span className={`w-20 text-right text-sm tabular font-bold ${
                        it.marginPct == null ? 'text-black/30'
                          : it.marginPct >= 65 ? 'text-[#5B7A08]'
                          : it.marginPct >= 45 ? 'text-[#16181A]' : 'text-red-600'
                      }`}>
                        {it.marginPct != null ? `${it.marginPct} %` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {pos.menuError && <p className="text-xs text-amber-700 px-1">{pos.menuError}</p>}
            </div>
          )}

          {/* Ledger */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-bold uppercase tracking-wider text-black/55">Výdaje ({filtered.length})</h3>
              <div className="flex gap-1 glass rounded-full p-1 overflow-x-auto">
                {[['all', 'Vše'], ['receipt', 'Účtenky'], ['order', 'Objednávky'], ['expense', 'Z kasy'], ['wage', 'Výplaty']].map(([id, label]) => (
                  <button key={id} onClick={() => setFilter(id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                      filter === id ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'
                    }`}>{label}</button>
                ))}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="glass-card p-8 text-center text-black/45">V tomhle měsíci tu nic není.</div>
            ) : (
              <div className="glass-card rounded-[26px] divide-y divide-black/[0.05] overflow-hidden">
                {filtered.map((r, i) => {
                  const meta = KIND_META[r.kind] ?? { label: r.kind, cls: 'bg-black/[0.06] text-black/55' };
                  const clickable = r.kind === 'receipt';
                  return (
                    <button key={i} onClick={() => clickable && setDetail(r)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left ${clickable ? 'hover:bg-black/[0.02] transition cursor-pointer' : 'cursor-default'}`}>
                      <span className="text-xs text-black/40 tabular-nums w-12 shrink-0">
                        {parseInt(r.date.split('-')[2])}.{parseInt(r.date.split('-')[1])}.
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
                      <span className="flex-1 min-w-0 text-sm font-medium text-[#16181A] truncate">
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
          <div className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-3 scrollbar-thin" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold tracking-tight text-[#16181A] flex items-center gap-2">
                <Icon name="receipt" size={20} className="text-[#5B7A08]" /> {detail.label}
              </h3>
              <button onClick={() => setDetail(null)} className="rounded-full w-9 h-9 flex items-center justify-center glass text-black/50 hover:text-black"><Icon name="close" size={15} /></button>
            </div>
            <p className="text-sm text-black/50">
              {new Date(detail.date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' · '}<span className="font-bold text-[#16181A] tabular-nums">{money(detail.amount)}</span>
            </p>
            {detail.note && <p className="text-sm text-black/60 bg-black/[0.03] rounded-2xl px-4 py-2.5">{detail.note}</p>}
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

      {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}
    </div>
  );
}
