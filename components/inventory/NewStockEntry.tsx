'use client';

// Writing a brand-new thing into stock from the floor. Someone unpacks a
// delivery, finds a syrup nobody has in the system yet, and puts it in with
// the amount that actually arrived — the employer only ticks it off later.
//
// The same form serves the phone and the shared tablet; on the kiosk the touch
// targets grow and the entry is attributed to whoever is clocked in.

import { useEffect, useMemo, useState, useRef } from 'react';
import { Icon } from '../Icons';
import { ancestryOfId, flattenTree } from '@/lib/categoryTree';
import { mergeDefaults, type ItemDefaults } from '@/lib/itemDefaults';

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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/inventory/categories').then(r => r.json())
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
    if (d.unitCost != null) setUnitCost(String(d.unitCost));
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

  const save = async () => {
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
          unitCost: unitCost === '' ? undefined : unitCost,
          supplier: supplier.trim() || undefined,
          minQuantity: defaults.minQuantity ?? undefined,
          criticalQuantity: defaults.criticalQuantity ?? undefined,
          maxQuantity: defaults.maxQuantity ?? undefined,
          actingAs: actingAs ?? undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Zápis se nepodařilo uložit.'); setSaving(false); return; }
      onSaved?.();
    } catch { setErr('Zápis se nepodařilo uložit — zkontroluj připojení.'); }
    setSaving(false);
  };

  const field = `w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none ${
    big ? 'px-5 py-4 text-lg' : 'px-4 py-3 text-sm'
  }`;
  const label = `block font-semibold text-black/55 mb-1.5 ${big ? 'text-sm' : 'text-xs'}`;

  return (
    <div className={`space-y-${big ? '5' : '4'}`}>
      {/* What it is — photo first, because a picture beats a description of a
          bottle nobody at the office has seen. */}
      <div className="flex items-start gap-3">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => onFile(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className={`shrink-0 rounded-2xl border flex items-center justify-center overflow-hidden transition active:scale-95 ${
            photoUrl ? 'border-[#C8F542]/50' : 'border-dashed border-black/20 text-black/40 hover:text-black'
          } ${big ? 'h-28 w-28' : 'h-20 w-20'}`}>
          {uploading ? <span className="h-5 w-5 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
            : photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Nová položka" className="h-full w-full object-cover" />
            ) : <Icon name="camera" size={big ? 34 : 26} strokeWidth={1.7} />}
        </button>
        <div className="min-w-0 flex-1">
          <label className={label}>Co to je?</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder="Např. Sirup Mango 0,7 l" className={field} />
        </div>
      </div>

      {/* Where it belongs */}
      {flat.length > 0 && (
        <div>
          <label className={label}>Kam to patří</label>
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {flat.map(({ cat, depth }: any) => (
              <button key={cat.id} type="button" onClick={() => pickCategory(cat.id)}
                className={`rounded-full font-semibold transition active:scale-95 ${
                  big ? 'px-4 py-2.5 text-base' : 'px-3.5 py-1.5 text-xs'
                } ${categoryId === cat.id
                  ? 'bg-[#16181A] text-white'
                  : 'glass text-black/60 hover:text-[#16181A]'}`}>
                {depth > 0 && <span className="opacity-40">{'· '.repeat(depth)}</span>}{cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* How much came in */}
      <div>
        <label className={label}>Kolik toho je</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => bump(-1)}
            className={`shrink-0 rounded-2xl glass font-bold text-[#16181A] active:scale-95 transition ${
              big ? 'h-14 w-14 text-2xl' : 'h-11 w-11 text-lg'}`}>−</button>
          <input inputMode="decimal" value={quantity}
            onChange={e => setQuantity(e.target.value)}
            className={`${field} text-center font-bold tabular-nums`} style={{ maxWidth: big ? 140 : 100 }} />
          <button type="button" onClick={() => bump(1)}
            className={`shrink-0 rounded-2xl glass font-bold text-[#16181A] active:scale-95 transition ${
              big ? 'h-14 w-14 text-2xl' : 'h-11 w-11 text-lg'}`}>+</button>
          <div className="flex flex-wrap gap-1.5 min-w-0 flex-1">
            {UNITS.map(u => (
              <button key={u} type="button" onClick={() => setUnit(u)}
                className={`rounded-full font-semibold transition active:scale-95 ${
                  big ? 'px-4 py-2.5 text-base' : 'px-3 py-1.5 text-xs'
                } ${unit === u ? 'bg-[#C8F542] text-[#16181A]' : 'glass text-black/55'}`}>
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Everything the shop can also fill in later */}
      <button type="button" onClick={() => setMore(m => !m)}
        className={`font-semibold text-[#5B7A08] hover:brightness-110 transition ${big ? 'text-base' : 'text-sm'}`}>
        {more ? '− Skrýt detaily' : '＋ Značka, cena, dodavatel…'}
      </button>
      {more && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>Značka</label>
            <input value={brand} onChange={e => setBrand(e.target.value)} className={field} placeholder="Např. Monin" />
          </div>
          <div>
            <label className={label}>Velikost balení</label>
            <input inputMode="decimal" value={packageSize}
              onChange={e => setPackageSize(e.target.value)} className={field} placeholder="0,7" />
          </div>
          <div>
            <label className={label}>Cena za kus</label>
            <input type="number" inputMode="numeric" value={unitCost}
              onChange={e => setUnitCost(e.target.value)} className={field} placeholder="Kč" />
          </div>
          <div>
            <label className={label}>Odkud je</label>
            <input value={supplier} onChange={e => setSupplier(e.target.value)} className={field} placeholder="Makro, dodavatel…" />
          </div>
        </div>
      )}

      <div>
        <label className={label}>Poznámka pro vedení</label>
        <input value={note} onChange={e => setNote(e.target.value)} className={field}
          placeholder="Např. přivezl dodavatel navíc, zkoušíme" />
      </div>

      {err && <p className={`text-red-600 ${big ? 'text-base' : 'text-sm'}`}>{err}</p>}

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving || uploading || !name.trim()}
          className={`flex-1 rounded-full bg-[#16181A] text-white font-bold hover:bg-black disabled:opacity-40 transition ${
            big ? 'px-6 py-4 text-lg' : 'px-5 py-3 text-sm'}`}>
          {saving ? 'Zapisuji…' : 'Zapsat do skladu'}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={saving}
            className={`rounded-full glass text-black/55 font-semibold hover:text-[#16181A] transition ${
              big ? 'px-6 py-4 text-lg' : 'px-5 py-3 text-sm'}`}>
            Zpět
          </button>
        )}
      </div>
      <p className={`text-black/40 ${big ? 'text-sm' : 'text-xs'}`}>
        Věc se hned objeví ve skladu s množstvím, které jsi zapsal/a. Vedení ji jen potvrdí.
      </p>
    </div>
  );
}
