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
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
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

// Rada jako stavové hlášení `.note` (DP §3.15) — dřív ručně tónované boxy.
const toneCls: Record<Insight['tone'], string> = { good: 'note-ok', warn: 'note-wait', info: 'note-info' };

export default function ShrinkageReport({ stocktakeId }: { stocktakeId?: number }) {
  const money = useMoney();
  const t = useT('sklad');
  const { jazyk } = useJazyk();
  const num = (n: number) => n.toLocaleString(LOCALE_PRO_JAZYK[jazyk], { maximumFractionDigits: 3 });
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const url = stocktakeId ? `/api/inventory/shrinkage?id=${stocktakeId}` : '/api/inventory/shrinkage';
    fetch(url).then(okJson).then(setD).catch(() => setD({ ready: false }));
  }, [stocktakeId]);

  if (!d || !d.ready || !d.totals) return null;
  const sum = d.totals;

  return (
    <section className="card space-y-4 rise-in" aria-labelledby="ztraty-manka">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="ztraty-manka" className="t-card flex items-center gap-2">
          <Icon name="trend" size={17} className="text-black/40" /> {t('Ztráty a manka')}
        </h3>
        <p className="t-meta">
          {t('Inventura {datum}', { datum: d.stocktake?.completedAt ? fmtDatum(d.stocktake.completedAt, { jazyk, styl: 'cislo' }) : '' })}
          {d.since ? ` · ${t('od poslední {datum}', { datum: fmtDatum(d.since, { jazyk, styl: 'cislo' }) })}` : ` · ${t('první inventura')}`}
        </p>
      </div>

      {/* Tři čísla v jedné řadě (StatRow v kartě) místo tří jamek s ručními štítky. */}
      <StatRow>
        <Stat label={t('Chybí')} value={<span className="text-bad-ink">{money(Math.abs(sum.lostValue))}</span>} note={t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: sum.missing })} />
        <Stat label={t('Přebývá')} value={money(sum.surplusValue)} note={t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: sum.surplus })} />
        <Stat label={t('Celkem')} value={<span className={sum.netValue < 0 ? 'text-bad-ink' : ''}>{sum.netValue > 0 ? '+' : ''}{money(sum.netValue)}</span>} note={t('rozdíl proti evidenci')} />
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
            {t('Rozdíly po položkách ({n})', { n: d.rows?.length ?? 0 })}
          </Button>
          {open && (
            <ul className="list mt-1">
              {d.rows.map(r => (
                <ListRow key={r.itemId} title={r.name}
                  meta={r.lossPct != null ? t('{n} % z prodaného', { n: r.lossPct }) : undefined}
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
