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
import { buildTree, categoryScope } from '@/lib/categoryTree';

interface Item {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  unit: string;
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
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);

  useEffect(() => { onFocusChange?.(openCat !== null); }, [openCat, onFocusChange]);

  // Categories worth offering: the ones that track open packages, plus any
  // parent whose subcategories do, so nothing packaged is unreachable.
  const roots = useMemo(
    () => buildTree(categories)
      .filter(({ cat, children }) => cat.tracksOpen || children.some((c: any) => c.tracksOpen))
      .map(t => t.cat),
    [categories],
  );

  const packagingOf = (name: string): CategoryPackaging | null => {
    const c = categories.find((x: any) => x.name === name);
    if (!c) return null;
    if (c.tracksOpen) return normalizeCategoryPackaging(c);
    const parent = c.parentId != null ? categories.find((x: any) => x.id === c.parentId) : null;
    return parent?.tracksOpen ? normalizeCategoryPackaging(parent) : null;
  };

  const itemsIn = (name: string) => {
    const scope = new Set(categoryScope(categories, name));
    return items.filter(i => scope.has(i.category)).sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  };

  if (roots.length === 0) return null;

  if (openCat) {
    const packaging = packagingOf(openCat);
    const list = itemsIn(openCat);
    if (!packaging) { setOpenCat(null); return null; }

    if (sweeping) {
      return (
        <SweepMode
          category={openCat} packaging={packaging} items={list}
          onChanged={onChanged}
          onDone={() => setSweeping(false)}
        />
      );
    }

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={() => setOpenCat(null)}
            className="inline-flex items-center gap-2 rounded-full glass border border-black/10 px-4 py-2.5 text-sm font-semibold text-[#16181A] min-h-[48px] active:scale-[0.97] transition">
            <Icon name="chevron" size={16} className="rotate-90" /> Zpět
          </button>
          <p className="font-bold text-lg tracking-tight text-[#16181A] min-w-0 truncate">{openCat}</p>
          {list.length > 1 && (
            <button onClick={() => setSweeping(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#C8F542] text-black px-5 py-2.5 text-sm font-bold min-h-[48px] active:scale-[0.97] transition">
              <Icon name="play" size={16} /> Projít vše ({list.length})
            </button>
          )}
        </div>

        {list.length === 0 ? (
          <div className="glass-card p-8 text-center text-black/45">V této kategorii zatím nic není.</div>
        ) : (
          <div className="space-y-3">
            {list.map(i => (
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {roots.map((c: any) => {
          const list = itemsIn(c.name);
          const packaging = packagingOf(c.name);
          const needsAttention = packaging
            ? list.filter(i => stockStatus(withSize(i, packaging), packaging) !== 'ok').length
            : 0;
          return (
            <button key={c.id} onClick={() => { setOpenCat(c.name); setSweeping(false); }}
              className="glass-card p-4 flex items-center gap-3 text-left active:scale-[0.99] transition min-h-[76px]">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#C8F542]/20 text-[#5B7A08]">
                <Icon name="box" size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[#16181A] truncate">{c.name}</span>
                <span className="block text-xs text-black/45">
                  {list.length} {list.length === 1 ? 'položka' : list.length >= 2 && list.length <= 4 ? 'položky' : 'položek'}
                  {needsAttention > 0 && <span className="text-orange-600 font-semibold"> · {needsAttention} dochází</span>}
                </span>
              </span>
              <Icon name="chevron" size={18} className="text-black/25 -rotate-90 shrink-0" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Package size falls back to the category default when the item has none. */
function withSize(i: Item, packaging: CategoryPackaging) {
  return { ...i, packageSize: Number(i.packageSize) || packaging.defaultPackageSize || 0 };
}

async function save(item: Item, patch: { quantity?: number; openAmount?: number | null }) {
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

  const apply = async (patch: { quantity?: number; openAmount?: number | null }) => {
    setBusy(true);
    const next = { ...item, ...patch } as Item;
    onChanged(next);              // optimistic — the tablet must feel instant
    const ok = await save(item, patch);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1200); }
    else onChanged(item);         // put the old value back if it didn't land
    setBusy(false);
  };

  if (size <= 0) {
    return (
      <div className="glass-card p-4">
        <p className="font-bold text-[#16181A]">{item.name}</p>
        <p className="text-sm text-amber-600 mt-1">Chybí velikost balení — doplní ji vedení ve skladu.</p>
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
          <p className="font-bold text-[#16181A] text-lg leading-snug truncate">{item.name}</p>
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
