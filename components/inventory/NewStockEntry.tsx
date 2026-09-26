'use client';

// Writing a brand-new thing into stock from the floor. Someone unpacks a
// delivery, finds a syrup nobody has in the system yet, and puts it in with
// the amount that actually arrived — the employer only ticks it off later.
//
// The same form serves the phone and the shared tablet; on the kiosk the touch
// targets grow and the entry is attributed to whoever is clocked in.

import { useEffect, useMemo, useState, useRef } from 'react';
import { Icon } from '../Icons';
import { Button } from '../ui';
import { ancestryOfId, flattenTree } from '@/lib/categoryTree';
import { mergeDefaults, type ItemDefaults } from '@/lib/itemDefaults';
import { okJson } from '@/lib/api';
import { useOpravneni } from '../role/useOpravneni';

/** Číslo z pole, které snese i desetinnou čárku — „0,7" jinak spadne na nulu. */
const dec = (v: string | number) => Number(String(v).replace(',', '.')) || 0;

interface Props {
  /** 'kiosk' grows the controls for a tablet used at arm's length. */
  variant?: 'app' | 'kiosk';
  /** Who is at the tablet — the entry lands on their name, not the device's. */
  actingAs?: number | null;
  /** Preselected category, e.g. the one the crew is standing in. */
  initialCategoryId?: number | null;
  onSaved?: () => void;
  onCancel?: () => void;
}

const UNITS = ['ks', 'balení', 'l', 'kg', 'g', 'ml'];

export default function NewStockEntry({
  variant = 'app', actingAs = null, initialCategoryId = null, onSaved, onCancel,
}: Props) {
  const big = variant === 'kiosk';
  // Kolo 67: nákupní cenu zapisuje jen ten, kdo smí upravovat ceny skladu —
  // server ji ostatním stejně zahodí (/api/inventory). Baristovi a tabletu se
  // proto pole schová, místo aby vyplněná cena tiše zmizela, a nepředvyplní
  // se ani z výchozích hodnot kategorie (nákupní cenu nemají vidět).
  const { ma } = useOpravneni();
  const smiCenu = ma('sklad.ceny_upravit');
  const [cats, setCats] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(initialCategoryId);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('ks');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [brand, setBrand] = useState('');
  const [packageSize, setPackageSize] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // Kolik věcí se v tomhle sezení zapsalo — po „Uložit a přidat další"
  // zůstává formulář otevřený a tohle je jediné potvrzení, že to prošlo.
  const [added, setAdded] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/inventory/categories').then(okJson)
      .then(d => { if (Array.isArray(d)) setCats(d); })
      .catch(() => { /* the form works without categories too */ });
  }, []);

  // What this category (and everything above it) says a new item starts with —
  // so the crew types a name and the shop's own conventions fill the rest.
  const defaults: ItemDefaults = useMemo(
    () => mergeDefaults(ancestryOfId(cats as any, categoryId).map((c: any) => c.defaults)),
    [cats, categoryId],
  );
  const flat = useMemo(() => flattenTree(cats as any), [cats]);

  // Picking a category re-seeds the fields the shop prefills, never the name
  // or the amount someone already typed.
  const pickCategory = (id: number | null) => {
    setCategoryId(id);
    const d = mergeDefaults(ancestryOfId(cats as any, id).map((c: any) => c.defaults));
    if (d.unit) setUnit(d.unit);
    if (d.brand) setBrand(d.brand);
    if (d.supplier) setSupplier(d.supplier);
    if (d.packageSize != null) setPackageSize(String(d.packageSize));
    if (d.unitCost != null && smiCenu) setUnitCost(String(d.unitCost));
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setUploading(true); setErr('');
    try {
      const { compressImage } = await import('@/lib/clientImage');
      const fd = new FormData();
      fd.append('file', await compressImage(f));
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) setPhotoUrl(d.url);
      else setErr(d.error || `Fotku se nepodařilo nahrát (HTTP ${res.status}).`);
    } catch { setErr('Fotku se nepodařilo nahrát — zkontroluj připojení.'); }
    setUploading(false);
  };

  const bump = (by: number) =>
    setQuantity(q => String(Math.max(0, Math.round((dec(q) + by) * 1000) / 1000)));

  /**
   * `keepOpen` = naskladňuje se dodávka.
   *
   * Osm položek z jedné bedny znamenalo osmkrát otevřít formulář a osmkrát
   * znovu vybrat kategorii, jednotku a dodavatele — přitom se mění jen
   * název a množství. Tohle nechá to společné na místě a vyprázdní zbytek.
   */
  const save = async (keepOpen = false) => {
    if (!name.trim()) { setErr('Napiš, co to je.'); return; }
    setSaving(true); setErr('');
    const cat = flat.find(f => f.cat.id === categoryId)?.cat as any;
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category: cat?.name ?? '',
          categoryId: categoryId ?? undefined,
          quantity: dec(quantity),
          unit: unit.trim() || 'ks',
          photoUrl,
          description: note.trim() || undefined,
          brand: brand.trim() || undefined,
          packageSize: packageSize === '' ? undefined : dec(packageSize),
          unitCost: unitCost === '' || !smiCenu ? undefined : unitCost,
          supplier: supplier.trim() || undefined,
          minQuantity: defaults.minQuantity ?? undefined,
          criticalQuantity: defaults.criticalQuantity ?? undefined,
          maxQuantity: defaults.maxQuantity ?? undefined,
          actingAs: actingAs ?? undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Zápis se nepodařilo uložit.'); setSaving(false); return; }
      if (keepOpen) {
        setAdded(prev => [...prev, name.trim()]);
        // Kategorie, jednotka, dodavatel a značka zůstávají — z jedné bedny
        // se vyndává víc věcí téhož druhu.
        setName(''); setQuantity('1'); setPhotoUrl(null); setNote('');
        setPackageSize(''); setUnitCost('');
        setSaving(false);
        // Kurzor zpátky na název, ať se dá rovnou psát.
        requestAnimationFrame(() => nameRef.current?.focus());
        return;
      }
      onSaved?.();
    } catch { setErr('Zápis se nepodařilo uložit — zkontroluj připojení.'); }
    setSaving(false);
  };

  const field = `w-full field border border-black/[0.08] text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none ${
    big ? 'px-5 py-4 text-lg' : 'px-4 py-3 text-sm'
  }`;
  const label = `block font-semibold text-black/55 mb-1.5 ${big ? 'text-sm' : 'text-xs'}`;

  return (
    // Naskladnění se vyplňuje jednou rukou u regálu; Enter po posledním poli
    // musí položku zapsat, ne čekat, až se trefíš do tlačítka.
    <form onSubmit={e => { e.preventDefault(); if (!saving && !uploading && name.trim()) save(false); }}
      // Celé třídy, ne `space-y-${…}` — Tailwind skládanou třídu nenajde a nevygeneruje.
      className={big ? 'space-y-5' : 'space-y-4'}>
      {/* What it is — photo first, because a picture beats a description of a
          bottle nobody at the office has seen. */}
      <div className="flex items-start gap-3">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => onFile(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className={`shrink-0 rounded-2xl border flex items-center justify-center overflow-hidden transition active:scale-95 ${
            photoUrl ? 'border-[#C8F542]/50' : 'border-dashed border-black/20 text-black/40 hover:text-black'
          } ${big ? 'h-28 w-28' : 'h-20 w-20'}`}>
          {uploading ? <span className="spinner spinner-sm" />
            : photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Nová položka" className="h-full w-full object-cover" />
            ) : <Icon name="camera" size={big ? 34 : 26} strokeWidth={1.7} />}
        </button>
        <div className="min-w-0 flex-1">
          <label htmlFor="nova-vec-nazev" className={label}>Co to je?</label>
          <input id="nova-vec-nazev" ref={nameRef} value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder="Např. Sirup Mango 0,7 l" className={field} />
        </div>
      </div>

      {/* Where it belongs */}
      {flat.length > 0 && (
        <div>
          <p id="nova-vec-kategorie" className={label}>Kam to patří</p>
          <div role="group" aria-labelledby="nova-vec-kategorie" className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {flat.map(({ cat, depth }: any) => (
              <button key={cat.id} type="button" onClick={() => pickCategory(cat.id)} aria-pressed={categoryId === cat.id}
                className={`filter-pill tap-target-sm max-w-full truncate ${big ? '!text-sm sm:!text-base sm:!px-4 sm:!py-2.5' : ''} ${
                  categoryId === cat.id ? 'seg-on' : 'seg-off glass'}`}>
                {depth > 0 && <span className="opacity-40">{'· '.repeat(depth)}</span>}{cat.name}
                {/* Kategorie zdrojového podniku organizace — ať jde poznat od stejnojmenné vlastní. */}
                {cat.zOrganizace && <span className="opacity-40"> · z organizace</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* How much came in */}
      <div>
        <label htmlFor="nova-vec-mnozstvi" className={label}>Kolik toho je</label>
        {/* Na úzkém displeji se „− 140px + ks balení l kg g ml" do jednoho
            řádku nevejde: kiosk má velká tlačítka (2×56 px) a pevně široké
            pole, takže řádek roztáhl celou stránku a zapnul vodorovný scroll.
            Počítadlo drží řádek, jednotky se zalomí pod něj. */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size={big ? 'lg' : 'md'} iconOnly icon="minus" aria-label="Ubrat" onClick={() => bump(-1)} />
          <input id="nova-vec-mnozstvi" inputMode="decimal" value={quantity}
            onChange={e => setQuantity(e.target.value)}
            className={`${field} text-center font-bold tabular-nums min-w-0 flex-1`}
            style={{ maxWidth: big ? 120 : 100 }} />
          <Button variant="secondary" size={big ? 'lg' : 'md'} iconOnly icon="plus" aria-label="Přidat" onClick={() => bump(1)} />
          {/* Vybraná jednotka je inkoustová pilulka (DP §3.8), ne limetka. */}
          <div role="group" aria-label="Jednotka" className="flex flex-wrap gap-1.5 min-w-0 basis-full sm:basis-0 sm:flex-1">
            {UNITS.map(u => (
              <button key={u} type="button" onClick={() => setUnit(u)} aria-pressed={unit === u}
                className={`filter-pill tap-target-sm whitespace-nowrap ${big ? '!text-sm sm:!text-base sm:!px-4 sm:!py-2.5' : ''} ${unit === u ? 'seg-on' : 'seg-off glass'}`}>
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Everything the shop can also fill in later */}
      <Button variant="ghost" size={big ? 'md' : 'sm'} iconAfter="chevron" aria-expanded={more}
        className={more ? '[&_svg]:rotate-180' : ''} onClick={() => setMore(m => !m)}>
        {more ? 'Skrýt detaily' : 'Značka, cena, dodavatel…'}
      </Button>
      {more && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="nova-vec-znacka" className={label}>Značka</label>
            <input id="nova-vec-znacka" value={brand} onChange={e => setBrand(e.target.value)} className={field} placeholder="Např. Monin" />
          </div>
          <div>
            <label htmlFor="nova-vec-baleni" className={label}>Velikost balení</label>
            <input id="nova-vec-baleni" inputMode="decimal" value={packageSize}
              onChange={e => setPackageSize(e.target.value)} className={field} placeholder="0,7" />
          </div>
          {smiCenu && (
            <div>
              <label htmlFor="nova-vec-cena" className={label}>Cena za kus</label>
              <input id="nova-vec-cena" type="number" inputMode="numeric" value={unitCost}
                onChange={e => setUnitCost(e.target.value)} className={field} placeholder="Kč" />
            </div>
          )}
          <div>
            <label htmlFor="nova-vec-dodavatel" className={label}>Odkud je</label>
            <input id="nova-vec-dodavatel" value={supplier} onChange={e => setSupplier(e.target.value)} className={field} placeholder="Makro, dodavatel…" />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="nova-vec-poznamka" className={label}>Poznámka pro vedení</label>
        <input id="nova-vec-poznamka" value={note} onChange={e => setNote(e.target.value)} className={field}
          placeholder="Např. přivezl dodavatel navíc, zkoušíme" />
      </div>

      {err && <p className="note note-danger" role="alert">{err}</p>}

      {added.length > 0 && (
        <p className="note note-ok text-sm">
          <Icon name="check" size={15} className="inline -mt-0.5 mr-1.5" />
          Zapsáno {added.length === 1 ? '' : `${added.length}×`}: {added.slice(-3).reverse().join(', ')}
          {added.length > 3 ? ` a ${added.length - 3} další` : ''}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Potvrzení formuláře je `primary` (DP §3.1) — dřív ručně psaná tmavá pilulka. */}
        <Button type="submit" variant="primary" size={big ? 'lg' : 'md'} className="flex-1 min-w-[10rem] justify-center"
          loading={saving} disabled={uploading || !name.trim()}>
          {added.length > 0 ? 'Zapsat a zavřít' : 'Zapsat do skladu'}
        </Button>
        <Button variant="secondary" size={big ? 'lg' : 'md'} icon="plus" disabled={saving || uploading || !name.trim()}
          title="Uloží a nechá kategorii, jednotku i dodavatele nastavené" onClick={() => save(true)}>
          Uložit a přidat další
        </Button>
        {onCancel && (
          <Button variant="ghost" size={big ? 'lg' : 'md'} disabled={saving} onClick={onCancel}>Zrušit</Button>
        )}
      </div>
      <p className="t-meta">
        {ma('sklad.pridat')
          ? 'Věc se hned objeví ve skladu s množstvím, které jsi zapsal/a.'
          : 'Věc se hned objeví ve skladu s množstvím, které jsi zapsal/a. Vedení ji jen potvrdí.'}
      </p>
    </form>
  );
}
