'use client';

// "Odešlo 150 ml" — a small inline write-off for items consumed gradually.
// The server cracks sealed packages the same way the POS sync does, so a
// partial pour never costs a whole bottle.

import { useState } from 'react';

export default function ConsumeControl({ itemId, unit, quickAmounts, onDone, onFail }: {
  itemId: number;
  /** Unit the amount is measured in — content unit for packaged items, the item's own unit otherwise. */
  unit: string | null;
  /** Optional one-tap amounts, e.g. [100, 250, 500]. */
  quickAmounts?: number[];
  onDone: (updatedItem: any) => void;
  onFail?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const consume = async (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/inventory/${itemId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consume: value, note: `Ruční odpis −${value}${unit ? ` ${unit}` : ''}` }),
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
      <button onClick={e => { e.stopPropagation(); setOpen(true); }}
        title="Odepsat spotřebované množství"
        className="rounded-full glass border border-black/10 text-black/55 hover:text-black px-3 h-8 flex items-center gap-1 text-xs font-semibold whitespace-nowrap transition">
        − Odpis
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={e => e.stopPropagation()}>
      {(quickAmounts ?? []).map(q => (
        <button key={q} onClick={() => consume(q)} disabled={saving}
          className="rounded-full bg-black/[0.05] hover:bg-black/[0.09] text-black/60 px-2.5 h-8 text-xs font-semibold tabular-nums transition disabled:opacity-50">
          −{q}{unit ? ` ${unit}` : ''}
        </button>
      ))}
      <input
        autoFocus type="number" inputMode="decimal" min={0} step="any" value={amount}
        onChange={e => setAmount(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); consume(Number(amount.replace(',', '.'))); } }}
        placeholder={unit ?? 'množství'}
        className="w-20 rounded-full bg-black/[0.04] border border-black/[0.08] px-3 h-8 text-xs text-[#16181A] text-right tabular-nums placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none"
      />
      {unit && <span className="text-[11px] text-black/40">{unit}</span>}
      <button onClick={() => consume(Number(amount.replace(',', '.')))}
        disabled={saving || !(Number(amount.replace(',', '.')) > 0)}
        className="rounded-full bg-[#16181A] text-white px-3.5 h-8 text-xs font-bold hover:bg-black transition disabled:opacity-40">
        {saving ? '…' : 'Odepsat'}
      </button>
      <button onClick={() => { setOpen(false); setAmount(''); }}
        className="rounded-full w-8 h-8 flex items-center justify-center text-black/35 hover:text-black text-sm">✕</button>
    </div>
  );
}
