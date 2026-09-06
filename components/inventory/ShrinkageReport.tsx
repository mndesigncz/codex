'use client';

// Co inventura našla proti evidenci — v jednotkách i v penězích.
//
// Samotné „12 rozdílů" nikoho nikam neposune. Tohle říká, kolik ty rozdíly
// stály, u kterých položek se ztrácí nejvíc vzhledem k prodeji, a co to
// obvykle znamená.

import { useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';

type Row = {
  itemId: number; name: string; category: string | null;
  qtyDiff: number; openDiff: number | null; diff: number; diffUnit: string;
  sold: number | null; lossPct: number | null; value: number | null;
};
type Insight = { icon: string; title: string; text: string; tone: 'good' | 'warn' | 'info' };
type Data = {
  ready: boolean; reason?: string;
  stocktake?: { id: number; completedAt: string; items: number; counted: number };
  since?: string | null;
  totals?: { lostValue: number; surplusValue: number; netValue: number; missing: number; surplus: number };
  rows?: Row[]; insights?: Insight[];
};

const num = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 3 });

const toneCls: Record<Insight['tone'], string> = {
  good: 'bg-[#C8F542]/10 border-[#C8F542]/30 text-[#5B7A08]',
  warn: 'bg-amber-500/10 border-amber-500/25 text-amber-800',
  info: 'bg-black/[0.03] border-black/[0.07] text-black/60',
};

export default function ShrinkageReport({ stocktakeId }: { stocktakeId?: number }) {
  const money = useMoney();
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const url = stocktakeId ? `/api/inventory/shrinkage?id=${stocktakeId}` : '/api/inventory/shrinkage';
    fetch(url).then(r => r.json()).then(setD).catch(() => setD({ ready: false }));
  }, [stocktakeId]);

  if (!d || !d.ready || !d.totals) return null;
  const t = d.totals;

  return (
    <div className="glass-card p-5 space-y-4 rise-in">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold text-[#16181A] flex items-center gap-1.5">
          <Icon name="trend" size={15} className="text-black/40" /> Ztráty a manka
        </h4>
        <p className="text-[11px] text-black/40">
          Inventura {d.stocktake?.completedAt ? new Date(d.stocktake.completedAt).toLocaleDateString('cs-CZ') : ''}
          {d.since ? ` · od poslední ${new Date(d.since).toLocaleDateString('cs-CZ')}` : ' · první inventura'}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] px-3 sm:px-3.5 py-3 min-w-0">
          <p className="text-[11px] text-black/45">Chybí</p>
          <p className="text-[15px] sm:text-lg font-bold tabular-nums text-red-600 whitespace-nowrap">{money(Math.abs(t.lostValue))}</p>
          <p className="text-[11px] text-black/35">{t.missing} položek</p>
        </div>
        <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] px-3 sm:px-3.5 py-3 min-w-0">
          <p className="text-[11px] text-black/45">Přebývá</p>
          <p className="text-[15px] sm:text-lg font-bold tabular-nums text-[#5B7A08] whitespace-nowrap">{money(t.surplusValue)}</p>
          <p className="text-[11px] text-black/35">{t.surplus} položek</p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-2xl bg-black/[0.03] border border-black/[0.06] px-3 sm:px-3.5 py-3 min-w-0">
          <p className="text-[11px] text-black/45">Celkem</p>
          <p className={`text-[15px] sm:text-lg font-bold tabular-nums whitespace-nowrap ${t.netValue < 0 ? 'text-red-600' : 'text-[#16181A]'}`}>
            {t.netValue > 0 ? '+' : ''}{money(t.netValue)}
          </p>
          <p className="text-[11px] text-black/35">rozdíl proti evidenci</p>
        </div>
      </div>

      {(d.insights ?? []).map((i, idx) => (
        <div key={idx} className={`rounded-2xl border px-4 py-3 ${toneCls[i.tone]}`}>
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Icon name={i.icon} size={14} /> {i.title}
          </p>
          <p className="text-xs mt-1 opacity-80 leading-relaxed">{i.text}</p>
        </div>
      ))}

      {!!d.rows?.length && (
        <div>
          <button type="button" onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between gap-2 rounded-2xl bg-black/[0.03] border border-black/[0.06] px-4 py-2.5 text-sm font-semibold text-[#16181A]">
            <span>Rozdíly po položkách ({d.rows?.length ?? 0})</span>
            <Icon name="chevron" size={15} className={`text-black/35 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="mt-2 rounded-2xl border border-black/[0.06] divide-y divide-black/[0.05] overflow-hidden">
              {d.rows.map(r => (
                <div key={r.itemId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="w-full sm:w-auto sm:flex-1 min-w-0 truncate text-[#16181A]">{r.name}</span>
                  <span className="sm:hidden flex-1" />
                  {r.lossPct != null && (
                    <span className="shrink-0 text-[11px] text-black/40 tabular-nums hidden sm:inline">
                      {r.lossPct} % z prodaného
                    </span>
                  )}
                  <span className={`shrink-0 text-xs font-semibold tabular-nums ${r.diff < 0 ? 'text-red-600' : 'text-[#5B7A08]'}`}>
                    {r.diff > 0 ? '+' : ''}{num(r.diff)} {r.diffUnit}
                  </span>
                  <span className={`w-20 shrink-0 text-right text-xs font-bold tabular-nums ${
                    (r.value ?? 0) < 0 ? 'text-red-600' : (r.value ?? 0) > 0 ? 'text-[#5B7A08]' : 'text-black/25'
                  }`}>
                    {r.value == null ? '—' : `${r.value > 0 ? '+' : ''}${money(r.value)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
