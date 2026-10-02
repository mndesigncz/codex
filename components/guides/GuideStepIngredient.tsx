'use client';

// Krok návodu označený jako surovina.
//
// „Nasyp 2 g kakaa" je zároveň instrukce pro obsluhu a odpis ze skladu.
// Dokud to byly dvě obrazovky, psalo se to dvakrát a po první změně gramáže
// se to rozešlo. Tenhle panel drží obojí v jednom řádku.

import { useState } from 'react';
import { Icon } from '../Icons';
import { usePrice } from '../CurrencyProvider';
import type { GuideStep } from '@/lib/guideSteps';
import NewIngredientInline from '../inventory/NewIngredientInline';
import { useT } from '@/lib/i18n/client';
import { useLocale } from '../employer/jazyk';
import { baleniPolozky, jednotkaPolozky } from '@/lib/packaging';
import { nabidkaJednotek } from '@/lib/jednotky';
import { mnozstviKroku, zadaneMnozstvi } from '@/lib/guideSteps';

/** Číslo z textu pole (česká čárka i tečka); prázdné nebo nesmysl = nezadáno. */
const dec = (v: string): number | null => {
  const n = Number(String(v).trim().replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/** Číslo do pole s českou čárkou. */
const doPole = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));

export default function GuideStepIngredient({ step, items, categories, onChange, onItemCreated }: {
  step: GuideStep;
  items: any[];
  categories: { id: number; name: string }[];
  onChange: (patch: Partial<GuideStep>) => void;
  onItemCreated: (item: any) => void;
}) {
  const loc = useLocale();
  const t = useT('navody');
  const cena = usePrice();
  const [creating, setCreating] = useState(false);
  const item = items.find(i => String(i.id) === String(step.itemId));
  // Množství se ukládá v jednotce položky (v ní je balení, cena i stav skladu);
  // zadat se dá v kterékoli jednotce téže rodiny a převede se.
  const itemUnit = item ? jednotkaPolozky(item) : null;
  const units = nabidkaJednotek(itemUnit);
  const zadane = zadaneMnozstvi(step, itemUnit);
  const [text, setText] = useState(doPole(zadane.hodnota));
  // Pole drží vlastní text (jinak by „0," zmizelo čárku); z kroku se přebírá
  // jen tehdy, když se hodnota změnila zvenčí.
  const shown = (dec(text) ?? 0) === (zadane.hodnota ?? 0) ? text : doPole(zadane.hodnota);
  const aktivniJednotka = zadane.unit ?? '';
  const zapis = (n: number | null, unit: string | null) =>
    onChange(mnozstviKroku(n, unit, itemUnit));

  if (creating) {
    return (
      <NewIngredientInline
        categories={categories}
        onCancel={() => setCreating(false)}
        onCreated={(created) => {
          onItemCreated(created);
          onChange({ itemId: created.id, ...mnozstviKroku(dec(text), jednotkaPolozky(created), jednotkaPolozky(created)) });
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
            // Jednotka se vrací na jednotku nové položky; zadané číslo zůstává.
            const nextUnit = next ? jednotkaPolozky(next) : null;
            onChange({ itemId: e.target.value ? Number(e.target.value) : null, ...mnozstviKroku(dec(text), nextUnit, nextUnit) });
          }}
          aria-label={t('Surovina ze skladu')}
          className="field flex-1 min-w-[160px] max-w-[22rem]">
          <option value="">{t('— vyber ze skladu —')}</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input
          inputMode="decimal"
          value={shown}
          onChange={e => { setText(e.target.value); zapis(dec(e.target.value), aktivniJednotka || itemUnit); }}
          placeholder="0,04"
          aria-label={t('Množství suroviny')}
          className="field !w-24 text-center tabular-nums"
        />
        <div className="flex gap-1">
          {units.map(u => (
            <button key={u} type="button" onClick={() => zapis(dec(text), u)} aria-pressed={aktivniJednotka === u}
              className={`filter-pill tap-target ${aktivniJednotka === u ? 'seg-on' : 'seg-off glass'}`}>
              {u}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onChange({ itemId: null, amount: null, unit: null })}
          title={t('Zrušit surovinu')} aria-label={t('Zrušit surovinu')}
          className="btn-icon tap-target">
          <Icon name="close" size={14} />
        </button>
      </div>

      {!step.itemId && (
        <button type="button" onClick={() => setCreating(true)}
          className="btn btn-ghost btn-sm">
          <Icon name="plus" size={13} />  {t('Sklad ji ještě nezná — založit')}
        </button>
      )}
      {item && baleniPolozky(item).packageSize != null && (
        <p className="t-meta">
          {t('Balení {mnozstvi} {jednotka}', { mnozstvi: Number(baleniPolozky(item).packageSize).toLocaleString(loc), jednotka: itemUnit })}
          {Number(item.unitCost) > 0 ? ` · ${cena(Number(item.unitCost))}` : ` · ${t('cena chybí')}`}
        </p>
      )}
    </div>
  );
}
