'use client';

// Krok návodu označený jako surovina.
//
// „Nasyp 2 g kakaa" je zároveň instrukce pro obsluhu a odpis ze skladu.
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
    <div className="well p-3 space-y-2">
      {/* Kolo 69 (B6b): surovina kroku byla limetkově tónovaný blok s ručními poli — teď Well a .field. */}
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
          aria-label="Surovina ze skladu"
          className="field flex-1 min-w-[160px] max-w-[22rem]">
          <option value="">— vyber ze skladu —</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input
          inputMode="decimal"
          value={step.amount == null ? '' : String(step.amount).replace('.', ',')}
          onChange={e => onChange({ amount: e.target.value === '' ? null : dec(e.target.value) })}
          placeholder="0,04"
          aria-label="Množství suroviny"
          className="field !w-24 text-center tabular-nums"
        />
        <div className="flex gap-1">
          {units.map(u => (
            <button key={u} type="button" onClick={() => onChange({ unit: u })} aria-pressed={(step.unit ?? '') === u}
              className={`filter-pill tap-target ${(step.unit ?? '') === u ? 'seg-on' : 'seg-off glass'}`}>
              {u}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onChange({ itemId: null, amount: null, unit: null })}
          title="Zrušit surovinu" aria-label="Zrušit surovinu"
          className="btn-icon tap-target">
          <Icon name="close" size={14} />
        </button>
      </div>

      {!step.itemId && (
        <button type="button" onClick={() => setCreating(true)}
          className="btn btn-ghost btn-sm">
          <Icon name="plus" size={13} /> Sklad ji ještě nezná — založit
        </button>
      )}
      {item && Number(item.packageSize) > 0 && (
        <p className="t-meta">
          Balení {Number(item.packageSize).toLocaleString('cs-CZ')} {item.contentUnit ?? item.unit}
          {Number(item.unitCost) > 0 ? ` · ${item.unitCost} Kč` : ' · cena chybí'}
        </p>
      )}
    </div>
  );
}
