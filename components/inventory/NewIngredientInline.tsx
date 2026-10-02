'use client';

// Nová surovina rovnou z receptury.
//
// Bez tohohle vypadá práce takhle: píšeš recepturu na Blue Lagoon, zjistíš, že
// modré curaçao ve skladu vůbec není, odejdeš do skladu, založíš položku,
// vrátíš se, najdeš produkt, otevřeš recepturu znovu. Většina lidí se nevrátí
// a produkt zůstane bez receptury — tedy i bez odpisu.
//
// Formulář se ptá jen na to, co receptura opravdu potřebuje: co to je, kam to
// patří, kolik je v balení a co balení stojí. Zbytek se doplní ve skladu.

import { useState } from 'react';
import { Icon } from '../Icons';
import { useCost, useSymbol } from '../CurrencyProvider';
import { cenaZFormulare } from '@/lib/cena';
import { CONTENT_UNITS, vyznamCeny, cenaZaRozumnouJednotku } from '@/lib/jednotky';
import { tg } from '@/lib/i18n/stav';
import { useT } from '@/lib/i18n/client';

const field =
  'w-full rounded-2xl bg-white/70 border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none';


/** Číslo z pole, které snese i desetinnou čárku. */
const dec = (v: string) => Number(String(v).replace(',', '.')) || 0;

export default function NewIngredientInline({ categories, onCreated, onCancel }: {
  /** Kategorie skladu — [{ id, name }]; nová se dá založit rovnou tady. */
  categories: { id: number; name: string }[];
  /** Hotová položka putuje zpátky do receptury i do seznamu surovin. */
  onCreated: (item: any) => void;
  onCancel: () => void;
}) {
  const t = useT('sklad');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(categories.length === 0);
  const [unit, setUnit] = useState('ks');
  const [packageSize, setPackageSize] = useState('');
  const [contentUnit, setContentUnit] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const cost = useCost();
  const symbol = useSymbol();
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const perUnit = dec(packageSize) > 0 && dec(unitCost) > 0
    ? dec(unitCost) / dec(packageSize) : null;
  // Cena za gram nebo mililitr je zlomek haléře, který nikdo nevyčte: ukáže se za kg / l.
  const vychazi = perUnit != null ? cenaZaRozumnouJednotku(perUnit, contentUnit) : null;
  // Cena BALENÍ, když je zadaná velikost balení, jinak cena jednotky (jako všude ve skladu).
  const cenaZaBaleni = vyznamCeny(packageSize) === 'baleni';

  const save = async () => {
    if (!name.trim()) { setErr(t('Napiš, jak se surovina jmenuje.')); return; }
    // Cena smí mít haléře; text, který cena není, se neuloží jako nula.
    const cena = cenaZFormulare(unitCost);
    if (!cena.ok) { setErr(t('Cena musí být číslo, třeba 4,99.')); return; }
    setSaving(true); setErr('');
    try {
      // Nová kategorie musí vzniknout dřív — položka na ni ukazuje.
      let catId: number | null = categoryId ? Number(categoryId) : null;
      let catName = categories.find(c => String(c.id) === categoryId)?.name ?? '';
      if (addingCategory && newCategory.trim()) {
        const res = await fetch('/api/inventory/categories', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newCategory.trim() }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { setErr(d.error ? tg(d.error) : t('Kategorii se nepodařilo založit.')); setSaving(false); return; }
        catId = d.category?.id ?? d.id ?? null;
        catName = newCategory.trim();
      }

      const payload = {
        name: name.trim(),
        category: catName,
        categoryId: catId,
        quantity: dec(quantity),
        minQuantity: 1, criticalQuantity: 0, maxQuantity: Math.max(5, Math.ceil(dec(quantity) * 2)),
        unit: unit.trim() || 'ks',
        unitCost: cena.hodnota,
        packageSize: packageSize === '' ? null : dec(packageSize),
        contentUnit: contentUnit || null,
      };
      const res = await fetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.id) { setErr(d.error ? tg(d.error) : t('Položku se nepodařilo založit.')); setSaving(false); return; }
      onCreated({
        id: d.id, name: payload.name, category: catName, categoryId: catId,
        quantity: payload.quantity, unit: payload.unit, unitCost: payload.unitCost,
        packageSize: payload.packageSize, contentUnit: payload.contentUnit,
        portions: [], approved: true,
      });
    } catch { setErr(t('Položku se nepodařilo založit.')); }
    setSaving(false);
  };

  return (
    <div className="well p-4 space-y-3 rise-in">
      {/* Neutrální jamka s nadpisem (kolo 69, audit Receptur) — dřív limetkový
          rámeček a limetkový štítek verzálkami. */}
      <h3 className="t-card flex items-center gap-2">
        <Icon name="plus" size={15} className="text-black/40" /> {t('Nová surovina do skladu')}
      </h3>

      <input value={name} onChange={e => setName(e.target.value)} autoFocus
        placeholder={t('Např. Blue Curaçao')} className={field} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-[11px] font-semibold text-black/50">{t('Kategorie')}</span>
          {addingCategory ? (
            <div className="flex gap-2">
              <input value={newCategory} onChange={e => setNewCategory(e.target.value)}
                placeholder={t('Např. Bar')} className={`${field} flex-1`} />
              {categories.length > 0 && (
                <button type="button" onClick={() => { setAddingCategory(false); setNewCategory(''); }}
                  className="shrink-0 rounded-2xl glass px-3 text-xs font-semibold text-black/50 hover:text-black transition">
                  {t('Vybrat')}
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={`${field} flex-1`}>
                <option value="">{t('— vyber —')}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={() => setAddingCategory(true)}
                className="shrink-0 rounded-2xl glass px-3 text-xs font-bold text-[#5B7A08] hover:brightness-110 transition">
                {t('＋ nová')}
              </button>
            </div>
          )}
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-semibold text-black/50">{t('Jednotka balení')}</span>
          <input value={unit} onChange={e => setUnit(e.target.value)}
            placeholder={t('lahev / balení / ks')} className={field} />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="block text-[11px] font-semibold text-black/50">{t('V balení')}</span>
          <input inputMode="decimal" value={packageSize} onChange={e => setPackageSize(e.target.value)}
            placeholder="0,7" className={field} />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-semibold text-black/50">{t('Jednotka obsahu')}</span>
          <select value={contentUnit} onChange={e => setContentUnit(e.target.value)} className={field}>
            <option value="">—</option>
            {CONTENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-semibold text-black/50">{cenaZaBaleni ? t('Cena za balení') : t('Cena za jednotku')}</span>
          <input inputMode="decimal" value={unitCost} onChange={e => setUnitCost(e.target.value)}
            placeholder={cenaZaBaleni ? symbol : `${symbol}/${unit || 'ks'}`} className={field} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-black/45">
        <label className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-semibold text-black/50 whitespace-nowrap">{t('Máme na skladě')}</span>
          <input inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)}
            placeholder="0" className="w-20 shrink-0 rounded-2xl bg-white/70 border border-black/[0.08] px-2.5 py-1.5 text-sm text-center tabular-nums text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none" />
          <span className="whitespace-nowrap">{unit || 'ks'}</span>
        </label>
        {perUnit != null && (
          <span>{t('Vychází na')} <b className="text-[#16181A]">{cost(vychazi!.cena)}</b> {t('za {jednotka}', { jednotka: vychazi!.jednotka || t('jednotku') })}.</span>
        )}
      </div>

      {err && <p className="text-sm text-bad-ink">{err}</p>}

      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving}
          className="btn btn-primary disabled:opacity-50 transition">
          {saving ? t('Zakládám…') : t('Založit a použít')}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}
          className="rounded-full glass px-4 py-2.5 text-sm font-semibold text-black/55 hover:text-black transition">
          {t('Zrušit', undefined, 'dialog')}
        </button>
      </div>
    </div>
  );
}
