'use client';

// "Odešlo 150 ml" — a small inline write-off for items consumed gradually.
// The server cracks sealed packages the same way the POS sync does, so a
// partial pour never costs a whole bottle.

import { useState } from 'react';
import { Button } from '../ui';
import { useT } from '@/lib/i18n/client';

export default function ConsumeControl({ itemId, unit, quickAmounts, onDone, onFail }: {
  itemId: number;
  /** Unit the amount is measured in — content unit for packaged items, the item's own unit otherwise. */
  unit: string | null;
  /** Optional one-tap amounts, e.g. [100, 250, 500]. */
  quickAmounts?: number[];
  onDone: (updatedItem: any) => void;
  onFail?: () => void;
}) {
  const t = useT('sklad');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const consume = async (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/inventory/${itemId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consume: value, note: `Ruční odpis −${value}${unit ? ` ${unit}` : ''}` /* i18n-ok: poznámka se ukládá do historie skladu česky */ }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        if (updated) onDone(updated);
        setOpen(false); setAmount('');
      } else onFail?.();
    } catch { onFail?.(); }
    setSaving(false);
  };

  if (!open) {
    return (
      // Ikona `minus` místo znaku „−" v popisku (kolo 69, audit Skladu).
      <Button variant="secondary" size="sm" icon="minus" title={t('Odepsat spotřebované množství')}
        onClick={e => { e.stopPropagation(); setOpen(true); }}>
        {t('Odpis')}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={e => e.stopPropagation()}>
      {(quickAmounts ?? []).map(q => (
        <Button key={q} variant="secondary" size="sm" disabled={saving} onClick={() => consume(q)} className="tabular-nums">
          −{q}{unit ? ` ${unit}` : ''}
        </Button>
      ))}
      <input
        autoFocus inputMode="decimal" value={amount}
        onChange={e => setAmount(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); consume(Number(amount.replace(',', '.'))); } }}
        placeholder={unit ?? t('množství')}
        aria-label={unit ? t('Kolik odepsat ({unit})', { unit }) : t('Kolik odepsat')}
        className="field !w-20 !py-1.5 text-right tabular-nums"
      />
      {unit && <span className="text-xs text-black/55">{unit}</span>}
      <Button variant="primary" size="sm" loading={saving}
        disabled={!(Number(amount.replace(',', '.')) > 0)}
        onClick={() => consume(Number(amount.replace(',', '.')))}>
        {t('Odepsat')}
      </Button>
      <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={t('Zrušit odpis')} onClick={() => { setOpen(false); setAmount(''); }} />
    </div>
  );
}
