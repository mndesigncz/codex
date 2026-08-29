'use client';

// Krok návodu označený jako surovina.
//
// „Nasyp 2 g matchy" je zároveň instrukce pro baristu a odpis ze skladu.
// Dokud to byly dvě obrazovky, psalo se to dvakrát a po první změně gramáže
// se to rozešlo. Tenhle panel drží obojí v jednom řádku.

import { useState } from 'react';
import { Icon } from '../Icons';
import type { GuideStep } from '@/lib/guideSteps';
import NewIngredientInline from '../inventory/NewIngredientInline';

/** Jednotky nabízené podle toho, v čem je položka vedená. */
const UNIT_SETS: Record<string, string[]> = {
  l: ['ml', 'cl', 'dl', 'l'],
  kg: ['g', 'dkg', 'kg'],
  ks: ['ks'],
};

function familyOf(item: any): 'l' | 'kg' | 'ks' {
  const u = String(item?.contentUnit ?? item?.unit ?? '').toLowerCase();
  if (['l', 'ml', 'cl', 'dl', 'litr'].includes(u)) return 'l';
  if (['kg', 'g', 'dkg'].includes(u)) return 'kg';
  return 'ks';
}

const dec = (v: string) => Number(String(v).replace(',', '.')) || 0;

export default function GuideStepIngredient({ step, items, categories, onChange, onItemCreated }: {
  step: GuideStep;
  items: any[];
  categories: { id: number; name: string }[];
  onChange: (patch: Partial<GuideStep>) => void;
  onItemCreated: (item: any) => void;
}) {
  const [creating, setCreating] = useState(false);
  const item = items.find(i => String(i.id) === String(step.itemId));
  const units = UNIT_SETS[familyOf(item)];

  if (creating) {
    return (
      <NewIngredientInline
        categories={categories}
        onCancel={() => setCreating(false)}
        onCreated={(created) => {
          onItemCreated(created);
          onChange({ itemId: created.id, unit: created.contentUnit ?? created.unit ?? null });
          setCreating(false);
        }}
      />
    );
  }

  return (
    <div className="rounded-2xl bg-[#C8F542]/[0.09] border border-[#C8F542]/25 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={step.itemId ?? ''}
          onChange={e => {
            const next = items.find(i => String(i.id) === e.target.value);
            onChange({
              itemId: e.target.value ? Number(e.target.value) : null,
              unit: next ? (next.contentUnit ?? next.unit ?? null) : null,
            });
          }}
          className="flex-1 min-w-[160px] max-w-[22rem] rounded-2xl bg-white/70 border border-black/[0.08] px-3 py-2 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none">
          <option value="">— vyber ze skladu —</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input
          inputMode="decimal"
          value={step.amount == null ? '' : String(step.amount).replace('.', ',')}
          onChange={e => onChange({ amount: e.target.value === '' ? null : dec(e.target.value) })}
          placeholder="0,04"
          className="w-24 rounded-2xl bg-white/70 border border-black/[0.08] px-3 py-2 text-sm text-center tabular-nums text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none"
        />
        <div className="flex gap-1">
          {units.map(u => (
            <button key={u} type="button" onClick={() => onChange({ unit: u })}
              className={`rounded-full px-2.5 py-2 text-xs font-bold transition active:scale-95 ${
                (step.unit ?? '') === u ? 'bg-[#C8F542] text-[#16181A]' : 'glass text-black/50'
              }`}>
              {u}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onChange({ itemId: null, amount: null, unit: null })}
          title="Zrušit surovinu" aria-label="Zrušit surovinu"
          className="rounded-full w-8 h-8 flex items-center justify-center text-black/30 hover:text-red-600 transition">
          <Icon name="close" size={14} />
        </button>
      </div>

      {!step.itemId && (
        <button type="button" onClick={() => setCreating(true)}
          className="text-xs font-bold text-[#5B7A08] hover:brightness-110 transition inline-flex items-center gap-1">
          <Icon name="plus" size={13} /> Sklad ji ještě nezná — založit
        </button>
      )}
      {item && Number(item.packageSize) > 0 && (
        <p className="text-[11px] text-black/45">
          Balení {Number(item.packageSize).toLocaleString('cs-CZ')} {item.contentUnit ?? item.unit}
          {Number(item.unitCost) > 0 ? ` · ${item.unitCost} Kč` : ' · cena chybí'}
        </p>
      )}
    </div>
  );
}
