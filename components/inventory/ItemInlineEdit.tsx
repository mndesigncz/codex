'use client';

// Skladová položka upravená tam, kde na ni narazíš — v receptuře.
//
// Bez tohohle vypadá práce takhle: v receptuře zjistíš, že vodce chybí velikost
// balení, odejdeš do skladu, najdeš ji, opravíš, vrátíš se, znovu najdeš
// produkt. Panel řeší přesně ta pole, která receptura potřebuje, a k tomu
// pojmenované díly — „panák 0,04 l" se definuje jednou a pak se jen vybírá.

import { useState } from 'react';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';

const field =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none';

export type Portion = { name: string; amount: number };

/** Číslo z pole, které bere i desetinnou čárku. */
const num = (s: string | number) => Number(String(s).replace(',', '.')) || 0;

export default function ItemInlineEdit({ item, onSaved, onClose }: {
  item: any;
  onSaved: (patch: any) => void;
  onClose: () => void;
}) {
  const money = useMoney();
  const [packageSize, setPackageSize] = useState(item.packageSize != null ? String(item.packageSize) : '');
  const [contentUnit, setContentUnit] = useState(item.contentUnit ?? '');
  const [unitCost, setUnitCost] = useState(item.unitCost != null ? String(item.unitCost) : '');
  const [portions, setPortions] = useState<{ name: string; amount: string }[]>(
    Array.isArray(item.portions) && item.portions.length
      ? item.portions.map((p: any) => ({ name: String(p.name ?? ''), amount: String(p.amount ?? '') }))
      : [],
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const perUnit = num(packageSize) > 0 && num(unitCost) > 0
    ? num(unitCost) / num(packageSize) : null;

  const save = async () => {
    setSaving(true); setErr('');
    const payload = {
      packageSize: packageSize === '' ? null : num(packageSize),
      contentUnit: contentUnit.trim() || null,
      unitCost: unitCost === '' ? null : Math.max(0, Math.round(num(unitCost))),
      portions: portions
        .filter(p => p.name.trim() && num(p.amount) > 0)
        .map(p => ({ name: p.name.trim(), amount: num(p.amount) })),
    };
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onSaved({ ...item, ...payload });
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || 'Uložení se nepodařilo.');
      }
    } catch { setErr('Uložení se nepodařilo.'); }
    setSaving(false);
  };

  return (
    <div className="rounded-2xl bg-white/70 border border-[#C8F542]/40 p-3.5 space-y-3 rise-in">
      <p className="text-xs font-bold uppercase tracking-wide text-[#5B7A08] flex items-center gap-1.5">
        <Icon name="box" size={13} /> Úprava skladové položky · {item.name}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="block text-[11px] font-semibold text-black/50">Velikost balení</span>
          <input value={packageSize} onChange={e => setPackageSize(e.target.value)}
            inputMode="decimal" placeholder="0,7" className={field} />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-semibold text-black/50">Jednotka obsahu</span>
          <input value={contentUnit} onChange={e => setContentUnit(e.target.value)}
            placeholder="l / kg / ks" className={field} />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-semibold text-black/50">Cena za balení</span>
          <input value={unitCost} onChange={e => setUnitCost(e.target.value)}
            inputMode="numeric" placeholder="Kč" className={field} />
        </label>
      </div>
      {perUnit != null && (
        <p className="text-[11px] text-black/45">
          Vychází na <b className="text-[#16181A]">{money(Math.round(perUnit))}</b> za {contentUnit || 'jednotku'}.
        </p>
      )}

      {/* Pojmenované díly — definuj jednou, pak se v recepturách jen vybírají. */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-black/50">
          Dílčí díly <span className="font-normal text-black/35">— pojmenované porce, které pak jen vybereš</span>
        </p>
        {portions.map((p, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input value={p.name} placeholder="panák"
              onChange={e => setPortions(list => list.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
              className={`${field} flex-1`} />
            <input value={p.amount} placeholder="0,04" inputMode="decimal"
              onChange={e => setPortions(list => list.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
              className={`${field} w-24 text-center`} />
            <span className="text-xs text-black/40 w-8">{contentUnit || item.unit}</span>
            <button type="button" onClick={() => setPortions(list => list.filter((_, i) => i !== idx))}
              className="text-black/30 hover:text-red-600 transition px-1">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => setPortions(list => [...list, { name: '', amount: '' }])}
          className="tap-target-sm rounded-full glass px-3.5 py-1.5 text-xs font-bold text-[#5B7A08] hover:brightness-110 transition inline-flex items-center gap-1">
          <Icon name="plus" size={13} /> Přidat díl
        </button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving}
          className="rounded-full bg-[#16181A] text-white px-5 py-2.5 text-sm font-bold hover:bg-black disabled:opacity-50 transition">
          {saving ? 'Ukládám…' : 'Uložit položku'}
        </button>
        <button onClick={onClose} disabled={saving}
          className="rounded-full glass px-4 py-2.5 text-sm font-semibold text-black/55 hover:text-black transition">
          Zrušit
        </button>
      </div>
    </div>
  );
}
