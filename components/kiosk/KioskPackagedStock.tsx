'use client';

// End-of-shift stock writing on the shared tablet. Nobody weighs anything and
// nobody types: one tap says how full the open package is, and the tablet moves
// on. A whole category of tobaccos is a dozen taps.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import {
  type CategoryPackaging, normalizeCategoryPackaging, resolveSteps, formatStock,
  fmtAmount, openPct, effectivePackages, stockStatus,
} from '@/lib/packaging';
import { packagingSourceOf, branchTracksOpen, childrenOfId, findById, matcher } from '@/lib/categoryTree';
import CategoryNav from '../inventory/CategoryNav';

interface Item {
  id: number;
  name: string;
  category: string;
  categoryId?: number | null;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  unit: string;
  brand?: string | null;
  description?: string | null;
  archived?: boolean;
  packageSize?: number | null;
  openAmount?: number | null;
}

export default function KioskPackagedStock({ items, categories, onChanged, onFocusChange }: {
  items: Item[];
  categories: any[];
  onChanged: (item: Item) => void;
  /** True while a category is open, so the tab can hide everything else. */
  onFocusChange?: (focused: boolean) => void;
}) {
  const [openCat, setOpenCat] = useState<number | null>(null);
  const [sweeping, setSweeping] = useState(false);
  // Parked items step aside but must stay reachable — the same person who said
  // "nevedeme" is the one who puts it back.
  const [showParked, setShowParked] = useState(false);

  useEffect(() => { onFocusChange?.(openCat !== null); }, [openCat, onFocusChange]);

  // Categories worth offering: anything that tracks open packages, anything
  // inheriting it from an ancestor, and the parents on the way down to them.
  const navCats = useMemo(
    () => categories.filter((c: any) =>
      branchTracksOpen(categories as any, c) || packagingSourceOf(categories as any, c.name) != null),
    [categories],
  );

  const packagingOf = (id: number): CategoryPackaging | null => {
    const cat = findById(categories as any, id);
    const src = cat ? packagingSourceOf(categories as any, cat) : null;
    return src ? normalizeCategoryPackaging(src) : null;
  };

  const itemsIn = (id: number, parked = false) => {
    const inCat = matcher(categories as any, id);
    // Parked items are not on the shelf, so they stay out of the sweep.
    return items
      .filter(i => inCat(i) && (parked ? i.archived === true : i.archived !== true))
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  };

  const countIn = (id: number) => itemsIn(id).length;
  const alertsIn = (id: number) => {
    const packaging = packagingOf(id);
    if (!packaging) return 0;
    return itemsIn(id).filter(i => stockStatus(withSize(i, packaging), packaging) !== 'ok').length;
  };

  if (navCats.length === 0) return null;

  if (openCat != null) {
    const packaging = packagingOf(openCat);
    const list = itemsIn(openCat, showParked);
    const parkedCount = itemsIn(openCat, true).length;
    if (!packaging) { setOpenCat(null); return null; }
    const openName = findById(categories as any, openCat)?.name ?? '';

    if (sweeping) {
      return (
        <SweepMode
          category={openName} packaging={packaging} items={list}
          onChanged={onChanged}
          onDone={() => setSweeping(false)}
        />
      );
    }

    // Items shown here are the ones filed directly in this category; anything
    // in a subcategory is reached through its own button.
    const direct = list.filter(i => (i.categoryId != null ? i.categoryId === openCat : i.category === openName));
    const subs = childrenOfId(navCats as any, openCat);

    return (
      <section className="space-y-3">
        <CategoryNav
          categories={navCats}
          current={openCat}
          onNavigate={name => { setOpenCat(name); setSweeping(false); setShowParked(false); }}
          countOf={countIn}
          alertOf={alertsIn}
          size="touch"
          rootLabel="Zbytky"
        />

        {(parkedCount > 0 || showParked) && (
          <button onClick={() => setShowParked(v => !v)}
            className={`w-full rounded-2xl px-5 py-3 text-sm font-semibold min-h-[48px] transition active:scale-[0.99] ${
              showParked ? 'bg-[#16181A] text-white' : 'glass border border-black/10 text-black/55'
            }`}>
            {showParked ? 'Zpět na to, co máme' : `Co nevedeme (${parkedCount})`}
          </button>
        )}

        {!showParked && list.length > 1 && (
          <button onClick={() => setSweeping(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#C8F542] text-black px-5 py-4 text-base font-bold min-h-[56px] active:scale-[0.99] transition">
            <Icon name="play" size={18} /> Projít vše ({list.length})
          </button>
        )}

        {direct.length === 0 ? (
          subs.length === 0 && (
            <div className="glass-card p-8 text-center text-black/45">
              {showParked ? 'Tady nic odloženého není.' : 'V této kategorii zatím nic není.'}
            </div>
          )
        ) : (
          <div className="space-y-3">
            {direct.map(i => (
              <ItemRow key={i.id} item={i} packaging={packaging} onChanged={onChanged} />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-2.5">
      <p className="text-xs uppercase tracking-wider text-black/45 font-semibold">Zápis zbytků</p>
      <CategoryNav
        categories={navCats}
        current={null}
        onNavigate={name => { setOpenCat(name); setSweeping(false); }}
        countOf={countIn}
        alertOf={alertsIn}
        size="touch"
        rootLabel="Zbytky"
      />
    </section>
  );
}

/** Package size falls back to the category default when the item has none. */
function withSize(i: Item, packaging: CategoryPackaging) {
  return { ...i, packageSize: Number(i.packageSize) || packaging.defaultPackageSize || 0 };
}

async function save(item: Item, patch: { quantity?: number; openAmount?: number | null; archived?: boolean }) {
  try {
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patch, note: 'Zápis zbytků na tabletu' }),
    });
    return res.ok;
  } catch { return false; }
}

/** One item in the browsable list: current state plus the tap-scale. */
function ItemRow({ item, packaging, onChanged }: {
  item: Item; packaging: CategoryPackaging; onChanged: (i: Item) => void;
}) {
  const sized = withSize(item, packaging);
  const size = sized.packageSize;
  const unit = packaging.contentUnit;
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const apply = async (patch: { quantity?: number; openAmount?: number | null; archived?: boolean }) => {
    setBusy(true);
    const next = { ...item, ...patch } as Item;
    onChanged(next);              // optimistic — the tablet must feel instant
    const ok = await save(item, patch);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1200); }
    else onChanged(item);         // put the old value back if it didn't land
    setBusy(false);
  };

  if (item.archived) {
    return (
      <div className="glass-card p-4 flex items-center justify-between gap-3 flex-wrap opacity-80">
        <p className="font-bold text-[#16181A] min-w-0 truncate">
          {item.name}
          {item.brand && <span className="ml-1.5 font-normal text-black/40">{item.brand}</span>}
        </p>
        <button onClick={() => apply({ archived: false })} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#C8F542] text-black px-5 py-3 text-sm font-bold min-h-[48px] disabled:opacity-40 active:scale-[0.97] transition">
          <Icon name="check" size={15} /> Máme zpátky
        </button>
      </div>
    );
  }

  if (size <= 0) {
    return (
      <div className="glass-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-bold text-[#16181A] truncate">{item.name}</p>
          <p className="text-sm text-amber-600 mt-1">Chybí velikost balení — doplní ji vedení ve skladu.</p>
        </div>
        <button onClick={() => apply({ archived: true })} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full glass border border-black/10 px-4 py-2.5 text-sm font-semibold text-black/55 min-h-[48px] disabled:opacity-40">
          <Icon name="warning" size={15} /> Nevedeme
        </button>
      </div>
    );
  }

  const steps = resolveSteps(packaging.scale, size);
  const current = Number(item.openAmount) || 0;
  const pct = openPct(sized);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-bold text-[#16181A] text-lg leading-snug truncate">
            {item.name}
            {item.brand && <span className="ml-1.5 text-base font-normal text-black/40">{item.brand}</span>}
          </p>
          {item.description && <p className="text-xs text-black/50 line-clamp-2">{item.description}</p>}
          <p className="text-sm text-black/45 tabular-nums">
            {formatStock(sized, unit, item.unit)}
            <span className="text-black/25"> · balení {fmtAmount(size)} {unit}</span>
          </p>
        </div>
        {saved && <span className="text-sm font-bold text-[#5B7A08] shrink-0">Uloženo ✓</span>}
      </div>

      <div className="h-2 w-full rounded-full bg-black/[0.06] overflow-hidden">
        <div className="h-full rounded-full bg-[#C8F542] transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <StepButtons steps={steps} current={current} unit={unit} busy={busy}
        onPick={amount => apply({ openAmount: amount })} />

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => apply({ quantity: item.quantity - 1, openAmount: size })}
          disabled={item.quantity <= 0 || busy}
          className="inline-flex items-center gap-2 rounded-full glass border border-black/10 px-4 py-2.5 text-sm font-semibold text-[#16181A] min-h-[48px] disabled:opacity-40 active:scale-[0.97] transition">
          <Icon name="plus" size={16} /> Otevřít další balení
        </button>
        <span className="text-sm text-black/40">
          Zavřených: <strong className="text-black/60 tabular-nums">{item.quantity}</strong>
        </span>
        <button onClick={() => apply({ archived: true })} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full glass border border-black/10 px-4 py-2.5 text-sm font-semibold text-black/55 min-h-[48px] disabled:opacity-40 active:scale-[0.97] transition">
          <Icon name="warning" size={15} /> Nevedeme
        </button>
      </div>
    </div>
  );
}

/** The scale, sized for fingers. */
function StepButtons({ steps, current, unit, busy, onPick, big }: {
  steps: { label: string; amount: number }[];
  current: number;
  unit: string | null;
  busy: boolean;
  onPick: (amount: number) => void;
  big?: boolean;
}) {
  return (
    <div className={`grid gap-2 ${big ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
      {steps.map(s => {
        const active = Math.abs(current - s.amount) < 0.05;
        return (
          <button key={s.label} onClick={() => onPick(s.amount)} disabled={busy}
            className={`rounded-2xl font-bold transition active:scale-[0.97] disabled:opacity-50 ${
              big ? 'py-6 text-2xl' : 'py-4 text-lg min-h-[64px]'
            } ${active ? 'bg-[#C8F542] text-black' : 'glass border border-black/10 text-black/70'}`}>
            {s.label}
            <span className={`block text-xs font-medium tabular-nums ${active ? 'text-black/50' : 'text-black/35'}`}>
              {fmtAmount(s.amount)} {unit}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One item at a time. A tap records the level and advances, so a whole category
 * is done without scrolling or hunting for the next name.
 */
function SweepMode({ category, packaging, items, onChanged, onDone }: {
  category: string;
  packaging: CategoryPackaging;
  items: Item[];
  onChanged: (i: Item) => void;
  onDone: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  // Guard against the list shrinking underneath (an item removed elsewhere).
  useEffect(() => { if (idx > items.length) setIdx(items.length); }, [items.length, idx]);

  if (idx >= items.length) {
    return (
      <section className="glass-card p-8 text-center space-y-4">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#C8F542] text-black mx-auto">
          <Icon name="check" size={30} />
        </span>
        <div>
          <p className="text-xl font-bold tracking-tight text-[#16181A]">Hotovo</p>
          <p className="text-sm text-black/45 mt-1">
            Zapsáno {done} z {items.length} v kategorii {category}.
          </p>
        </div>
        <button onClick={onDone}
          className="rounded-full bg-[#16181A] text-white px-6 py-3 text-sm font-bold min-h-[48px] active:scale-[0.97] transition">
          Zpět na seznam
        </button>
      </section>
    );
  }

  const item = items[idx];
  const sized = withSize(item, packaging);
  const size = sized.packageSize;
  const steps = size > 0 ? resolveSteps(packaging.scale, size) : [];
  const current = Number(item.openAmount) || 0;

  const record = async (amount: number) => {
    setBusy(true);
    onChanged({ ...item, openAmount: amount });
    const ok = await save(item, { openAmount: amount });
    if (!ok) onChanged(item);
    else setDone(d => d + 1);
    setBusy(false);
    setIdx(i => i + 1);
  };

  // Ran out for good — park it and move on, no different from tapping a level.
  const park = async () => {
    setBusy(true);
    onChanged({ ...item, archived: true });
    const ok = await save(item, { archived: true });
    if (!ok) onChanged(item);
    else setDone(d => d + 1);
    setBusy(false);
    setIdx(i => i + 1);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onDone}
          className="inline-flex items-center gap-2 rounded-full glass border border-black/10 px-4 py-2.5 text-sm font-semibold text-[#16181A] min-h-[48px] active:scale-[0.97] transition">
          <Icon name="chevron" size={16} className="rotate-90" /> Ukončit
        </button>
        <p className="text-sm font-semibold text-black/45 tabular-nums">{idx + 1} / {items.length}</p>
      </div>

      <div className="h-1.5 w-full rounded-full bg-black/[0.06] overflow-hidden">
        <div className="h-full rounded-full bg-[#C8F542] transition-[width]"
          style={{ width: `${Math.round((idx / items.length) * 100)}%` }} />
      </div>

      <div className="glass-card p-6 space-y-5">
        <div className="text-center">
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A] leading-tight">{item.name}</p>
          {item.brand && <p className="text-base text-black/45 mt-0.5">{item.brand}</p>}
          {item.description && <p className="text-sm text-black/50 mt-1">{item.description}</p>}
          <p className="text-sm text-black/45 mt-1 tabular-nums">
            Teď: {formatStock(sized, packaging.contentUnit, item.unit)}
          </p>
        </div>

        {size <= 0 ? (
          <p className="text-center text-amber-600 text-sm">
            Chybí velikost balení — tuhle položku zatím zapsat nejde.
          </p>
        ) : (
          <StepButtons steps={steps} current={current} unit={packaging.contentUnit} busy={busy}
            onPick={record} big />
        )}

        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button onClick={park} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full glass border border-black/10 px-5 py-3 text-sm font-semibold text-black/55 min-h-[48px] disabled:opacity-40 active:scale-[0.97] transition">
            <Icon name="warning" size={15} /> Nevedeme
          </button>
          <button onClick={() => setIdx(i => i + 1)} disabled={busy}
            className="rounded-full glass border border-black/10 px-5 py-3 text-sm font-semibold text-black/55 min-h-[48px] disabled:opacity-40 active:scale-[0.97] transition">
            Přeskočit
          </button>
          {idx > 0 && (
            <button onClick={() => setIdx(i => i - 1)} disabled={busy}
              className="rounded-full glass border border-black/10 px-5 py-3 text-sm font-semibold text-black/55 min-h-[48px] disabled:opacity-40 active:scale-[0.97] transition">
              Zpět na předchozí
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-black/35">
        Zbývá {items.length - idx - 1} · zapsáno {done}
        {(() => {
          const eff = size > 0 ? effectivePackages(sized) : item.quantity;
          return eff <= item.criticalQuantity ? ' · tahle položka dochází' : '';
        })()}
      </p>
    </section>
  );
}
