'use client';

// Co inventura našla proti evidenci — v jednotkách i v penězích.
//
// Samotné „12 rozdílů" nikoho nikam neposune. Tohle říká, kolik ty rozdíly
// stály, u kterých položek se ztrácí nejvíc vzhledem k prodeji, a co to
// obvykle znamená.

import { useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import { okJson } from '@/lib/api';
import { czCount, POLOZKA } from '@/lib/czech';
import { Button, ListRow, Stat, StatRow } from '../ui';

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

// Rada jako stavové hlášení `.note` (DP §3.15) — dřív ručně tónované boxy.
const toneCls: Record<Insight['tone'], string> = { good: 'note-ok', warn: 'note-wait', info: 'note-info' };

export default function ShrinkageReport({ stocktakeId }: { stocktakeId?: number }) {
  const money = useMoney();
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const url = stocktakeId ? `/api/inventory/shrinkage?id=${stocktakeId}` : '/api/inventory/shrinkage';
    fetch(url).then(okJson).then(setD).catch(() => setD({ ready: false }));
  }, [stocktakeId]);

  if (!d || !d.ready || !d.totals) return null;
  const t = d.totals;

  return (
    <section className="card space-y-4 rise-in" aria-labelledby="ztraty-manka">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="ztraty-manka" className="t-card flex items-center gap-2">
          <Icon name="trend" size={17} className="text-black/40" /> Ztráty a manka
        </h3>
        <p className="t-meta">
          Inventura {d.stocktake?.completedAt ? new Date(d.stocktake.completedAt).toLocaleDateString('cs-CZ') : ''}
          {d.since ? ` · od poslední ${new Date(d.since).toLocaleDateString('cs-CZ')}` : ' · první inventura'}
        </p>
      </div>

      {/* Tři čísla v jedné řadě (StatRow v kartě) místo tří jamek s ručními štítky. */}
      <StatRow>
        <Stat label="Chybí" value={<span className="text-bad-ink">{money(Math.abs(t.lostValue))}</span>} note={czCount(t.missing, POLOZKA)} />
        <Stat label="Přebývá" value={money(t.surplusValue)} note={czCount(t.surplus, POLOZKA)} />
        <Stat label="Celkem" value={<span className={t.netValue < 0 ? 'text-bad-ink' : ''}>{t.netValue > 0 ? '+' : ''}{money(t.netValue)}</span>} note="rozdíl proti evidenci" />
      </StatRow>

      {(d.insights ?? []).map((i, idx) => (
        <div key={idx} className={`note ${toneCls[i.tone]}`}>
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Icon name={i.icon} size={14} /> {i.title}
          </p>
          <p className="text-[13px] mt-1 leading-relaxed">{i.text}</p>
        </div>
      ))}

      {!!d.rows?.length && (
        <div>
          <Button variant="ghost" size="sm" iconAfter="chevron" aria-expanded={open}
            className={open ? '[&_svg]:rotate-180' : ''} onClick={() => setOpen(o => !o)}>
            Rozdíly po položkách ({d.rows?.length ?? 0})
          </Button>
          {open && (
            <ul className="list mt-1">
              {d.rows.map(r => (
                <ListRow key={r.itemId} title={r.name}
                  meta={r.lossPct != null ? `${r.lossPct} % z prodaného` : undefined}
                  aside={<span className={`tabular-nums ${r.diff < 0 ? 'text-bad-ink' : 'text-ok-ink'}`}>{r.diff > 0 ? '+' : ''}{num(r.diff)} {r.diffUnit}</span>}
                  value={<span className={(r.value ?? 0) < 0 ? 'text-bad-ink' : (r.value ?? 0) > 0 ? 'text-ok-ink' : 'text-black/55'}>
                    {r.value == null ? '—' : `${r.value > 0 ? '+' : ''}${money(r.value)}`}
                  </span>} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
