'use client';

// A packaged category (tobacco tins, bottles…) in two modes:
//  • Přehled — read-only, for staff serving a customer: what do we have and
//    roughly how much of it.
//  • Zápis zbytků — end of shift: tap a level per item, no weighing.

import { useMemo, useState } from 'react';
import { Icon } from '../Icons';
import {
  type CategoryPackaging, resolveSteps, formatStock, fmtAmount, openPct,
  effectivePackages, totalContent, stockStatus, thresholdUnitLabel,
} from '@/lib/packaging';
import ConsumeControl from './ConsumeControl';

export interface StockItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  unit: string;
  supplierUrl?: string;
  brand?: string | null;
  description?: string | null;
  archived?: boolean;
  packageSize?: number | null;
  openAmount?: number | null;
  contentUnit?: string | null;
}

type Mode = 'view' | 'edit';

/** The same controls a normal stock card has: count stepper, order link, edit, delete. */
function ItemControls({ item, onStep, onEditItem, onRemoveItem }: {
  item: StockItem;
  onStep?: (item: StockItem, delta: number) => void;
  onEditItem?: (item: StockItem) => void;
  onRemoveItem?: (item: StockItem) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
      {onStep ? (
        <div className="flex items-center gap-1.5">
          <button onClick={() => onStep(item, -1)} disabled={item.quantity <= 0} title="Ubrat zavřené balení"
            className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/70 hover:text-black text-base leading-none disabled:opacity-30">−</button>
          <span className="text-base font-bold text-[#16181A] tabular-nums min-w-[3.5rem] text-center">
            {item.quantity} <span className="text-[11px] font-medium text-black/45">{item.unit}</span>
          </span>
          <button onClick={() => onStep(item, 1)} title="Přidat zavřené balení"
            className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/70 hover:text-black text-base leading-none">+</button>
        </div>
      ) : <span />}
      <div className="flex items-center gap-1">
        {item.supplierUrl && (
          <a href={item.supplierUrl} target="_blank" rel="noopener" title="Objednat u dodavatele"
            className="rounded-full bg-[#C8F542]/20 text-[#5B7A08] hover:bg-[#C8F542]/30 px-3 h-9 flex items-center text-xs font-semibold whitespace-nowrap">Objednat ↗</a>
        )}
        {onEditItem && (
          <button onClick={() => onEditItem(item)} title="Upravit položku"
            className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/60 hover:text-black text-sm">✎</button>
        )}
        {onRemoveItem && (
          <button onClick={() => onRemoveItem(item)} title="Smazat položku"
            className="rounded-full glass w-9 h-9 flex items-center justify-center text-red-600/70 hover:text-red-600 text-sm">✕</button>
        )}
      </div>
    </div>
  );
}


/** One tap says "tohle teď nevedeme" — and one more says we do again. */
function ParkButton({ item, busy, onToggle, className = '' }: {
  item: StockItem;
  busy: boolean;
  onToggle: (item: StockItem, archived: boolean) => void;
  className?: string;
}) {
  const parked = item.archived === true;
  return (
    <button
      onClick={() => onToggle(item, !parked)}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold min-h-[40px] transition active:scale-[0.97] disabled:opacity-50 ${
        parked
          ? 'bg-[#C8F542] text-black hover:brightness-110'
          : 'glass border border-black/10 text-black/55 hover:text-black'
      } ${className}`}
    >
      <Icon name={parked ? 'check' : 'warning'} size={14} />
      {parked ? 'Máme zpátky' : 'Nevedeme'}
    </button>
  );
}

const TONE = {
  critical: { bar: 'bg-red-500', text: 'text-red-600', chip: 'bg-red-500/12 text-red-600' },
  low: { bar: 'bg-orange-400', text: 'text-orange-600', chip: 'bg-orange-500/12 text-orange-600' },
  ok: { bar: 'bg-[#C8F542]', text: 'text-[#5B7A08]', chip: 'bg-[#C8F542]/20 text-[#5B7A08]' },
} as const;

export default function CategoryStockView({
  category, packaging, items, canEdit, onChanged, onEditItem, onRemoveItem, onStep,
}: {
  category: string;
  packaging: CategoryPackaging;
  items: StockItem[];
  canEdit: boolean;
  onChanged: (item: StockItem) => void;
  /** Given by the employer view so a packaged item stays as editable as any
   *  other — same stepper, order link, edit and delete as the normal stock grid. */
  onEditItem?: (item: StockItem) => void;
  onRemoveItem?: (item: StockItem) => void;
  onStep?: (item: StockItem, delta: number) => void;
}) {
  const hasControls = Boolean(onStep || onEditItem || onRemoveItem);
  // Parked items are hidden until asked for — they aren't on the shelf.
  const [showParked, setShowParked] = useState(false);
  const [mode, setMode] = useState<Mode>('view');
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  // A tap that didn't land must say so — otherwise the shift walks away
  // believing the stock was written down.
  const [failedId, setFailedId] = useState<number | null>(null);
  const flashFail = (id: number) => {
    setFailedId(id);
    setTimeout(() => setFailedId(f => (f === id ? null : f)), 3000);
  };

  const unit = packaging.contentUnit;
  const parkedCount = items.filter(i => i.archived === true).length;
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(i => (showParked ? i.archived === true : i.archived !== true))
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => {
        // Emptiest first while writing, alphabetical while browsing.
        if (mode === 'edit') return effectivePackages(a) - effectivePackages(b);
        return a.name.localeCompare(b.name, 'cs');
      });
  }, [items, search, mode, showParked]);

  // When a parent category is open, its subcategories keep their own heading so
  // the list stays readable instead of merging into one long block.
  const groups = useMemo(() => {
    const map = new Map<string, StockItem[]>();
    list.forEach(i => {
      const key = i.category || category;
      const arr = map.get(key);
      if (arr) arr.push(i); else map.set(key, [i]);
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === category) return -1;
      if (b === category) return 1;
      return a.localeCompare(b, 'cs');
    });
  }, [list, category]);
  const showHeadings = groups.length > 1;

  const sizeOf = (i: StockItem) => Number(i.packageSize) || packaging.defaultPackageSize || 0;

  const persist = async (item: StockItem, patch: { quantity?: number; openAmount?: number | null }) => {
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        onChanged({ ...item, ...patch } as StockItem);
        setSavedId(item.id);
        setTimeout(() => setSavedId(s => (s === item.id ? null : s)), 1500);
      } else flashFail(item.id);
    } catch { flashFail(item.id); }
    setSavingId(null);
  };

  // "Nevedeme" is as quick as tapping a level — the person at the counter is
  // the one who knows an item ran out, so they must not have to ask anyone.
  const setParked = async (item: StockItem, archived: boolean) => {
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived, note: archived ? 'Označeno „nevedeme"' : 'Vráceno do skladu' }),
      });
      if (res.ok) {
        onChanged({ ...item, archived } as StockItem);
        setSavedId(item.id);
        setTimeout(() => setSavedId(s => (s === item.id ? null : s)), 1500);
      } else flashFail(item.id);
    } catch { flashFail(item.id); }
    setSavingId(null);
  };

  // Opening the next package: one sealed unit becomes the new open one.
  const openNext = (item: StockItem) => {
    const size = sizeOf(item);
    if (item.quantity <= 0 || size <= 0) return;
    persist(item, { quantity: item.quantity - 1, openAmount: size });
  };

  const totalOfCategory = items.reduce((s, i) => s + totalContent({ ...i, packageSize: sizeOf(i) }), 0);

  return (
    <div className="space-y-4">
      {/* Mode switch + category total */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 rounded-full glass border border-black/[0.07] p-1 shrink-0">
          {([['view', 'Přehled'], ['edit', 'Zápis zbytků']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              disabled={m === 'edit' && !canEdit}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition disabled:opacity-40 ${
                mode === m ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {unit && !showParked && (
            <span className="text-sm text-black/50">
              Celkem v kategorii <strong className="text-[#16181A] tabular-nums">{fmtAmount(totalOfCategory)} {unit}</strong>
            </span>
          )}
          {(parkedCount > 0 || showParked) && (
            <button onClick={() => setShowParked(v => !v)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                showParked ? 'bg-[#16181A] text-white' : 'glass text-black/50 hover:text-black'
              }`}>
              {showParked ? 'Zpět na skladem' : `Nevedeme (${parkedCount})`}
            </button>
          )}
        </div>
      </div>

      {items.length > 6 && (
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Hledat v ${category}…`}
          className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-2.5 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm"
        />
      )}

      {list.length === 0 ? (
        <div className="glass-card p-8 text-center text-black/45">
          {search ? 'Nic nenalezeno.' : `V kategorii ${category} zatím nic není.`}
        </div>
      ) : mode === 'view' ? (
        <div className="space-y-5">
          {groups.map(([groupName, groupItems]) => (
            <div key={groupName} className="space-y-2.5">
              {showHeadings && (
                <p className="text-[11px] uppercase tracking-wider text-black/40 font-semibold">
                  {groupName} <span className="text-black/25 tabular-nums">· {groupItems.length}</span>
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {groupItems.map(i => {
                  const size = sizeOf(i);
                  const st = stockStatus(i, packaging);
                  const pct = openPct({ ...i, packageSize: size });
                  return (
                    <div key={i.id} className={`glass-card p-4 ${i.archived ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-[#16181A] leading-snug min-w-0">
                          {i.name}
                          {i.brand && <span className="ml-1.5 font-normal text-black/40">{i.brand}</span>}
                        </p>
                        {st !== 'ok' && (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${TONE[st].chip}`}>
                            {st === 'critical' ? 'Dochází' : 'Málo'}
                          </span>
                        )}
                      </div>
                      {i.description && <p className="text-xs text-black/55 mt-1 line-clamp-2">{i.description}</p>}
                      <p className="text-sm text-black/55 mt-1 tabular-nums">
                        {formatStock({ ...i, packageSize: size }, unit, i.unit)}
                      </p>
                      {size > 0 && (i.openAmount ?? 0) > 0 && (
                        <>
                          <div className="mt-2.5 h-2 w-full rounded-full bg-black/[0.06] overflow-hidden">
                            <div className={`h-full rounded-full ${TONE[st].bar} transition-[width]`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[11px] text-black/40 mt-1">Načaté balení: {pct} %</p>
                        </>
                      )}
                      <p className="text-[11px] text-black/30 mt-1.5">
                        Limit: {i.minQuantity} · kriticky: {i.criticalQuantity} {thresholdUnitLabel(packaging, i.unit)}
                      </p>
                      {canEdit && (
                        <ParkButton item={i} busy={savingId === i.id} onToggle={setParked} className="mt-2.5" />
                      )}
                      {hasControls && (
                        <ItemControls item={i} onStep={onStep} onEditItem={onEditItem} onRemoveItem={onRemoveItem} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map(i => {
            const size = sizeOf(i);
            const steps = size > 0 ? resolveSteps(packaging.scale, size) : [];
            const current = Number(i.openAmount) || 0;
            const st = stockStatus(i, packaging);
            return (
              <div key={i.id} className={`glass-card p-4 ${i.archived ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#16181A] leading-snug">
                      {i.name}
                      {i.brand && <span className="ml-1.5 font-normal text-black/40">{i.brand}</span>}
                      {showHeadings && i.category && i.category !== category && (
                        <span className="ml-2 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-black/45 align-middle">{i.category}</span>
                      )}
                    </p>
                    <p className="text-xs text-black/45 tabular-nums mt-0.5">
                      {formatStock({ ...i, packageSize: size }, unit, i.unit)}
                      {size > 0 && <span className="text-black/30"> · balení {fmtAmount(size)} {unit}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {savedId === i.id && <span className="text-xs font-medium text-[#5B7A08]">Uloženo ✓</span>}
                    {failedId === i.id && (
                      <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
                        <Icon name="warning" size={13} /> Neuloženo
                      </span>
                    )}
                    {st !== 'ok' && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${TONE[st].chip}`}>
                        {st === 'critical' ? 'Dochází' : 'Málo'}
                      </span>
                    )}
                    {onEditItem && (
                      <button onClick={() => onEditItem(i)} title="Upravit položku"
                        className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/50 hover:text-black text-sm">✎</button>
                    )}
                    {onRemoveItem && (
                      <button onClick={() => onRemoveItem(i)} title="Smazat položku"
                        className="rounded-full glass w-8 h-8 flex items-center justify-center text-red-600/70 hover:text-red-600 text-sm">✕</button>
                    )}
                  </div>
                </div>

                {i.archived ? (
                  <div className="mt-3">
                    <ParkButton item={i} busy={savingId === i.id} onToggle={setParked} />
                  </div>
                ) : size <= 0 ? (
                  <>
                    <p className="text-xs text-amber-600 mt-2">
                      Chybí velikost balení — doplň ji u položky ve skladu.
                    </p>
                    <ParkButton item={i} busy={savingId === i.id} onToggle={setParked} className="mt-2.5" />
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {steps.map(s => {
                        const active = Math.abs(current - s.amount) < 0.05;
                        return (
                          <button
                            key={s.label}
                            onClick={() => persist(i, { openAmount: s.amount })}
                            disabled={savingId === i.id}
                            className={`rounded-full px-3.5 py-2 text-sm font-medium min-h-[40px] transition active:scale-[0.97] disabled:opacity-50 ${
                              active ? 'bg-[#C8F542] text-black font-semibold' : 'bg-black/[0.05] text-black/60 hover:bg-black/[0.09]'
                            }`}
                          >
                            {s.label}
                            <span className={`ml-1.5 text-[11px] tabular-nums ${active ? 'text-black/50' : 'text-black/35'}`}>
                              {fmtAmount(s.amount)}{unit}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Exact write-off: "odešlo 150 ml" — for when someone knows
                        the amount instead of eyeballing a level. */}
                    <div className="flex items-center gap-2 mt-2.5">
                      <ConsumeControl
                        itemId={i.id}
                        unit={i.contentUnit ?? unit ?? null}
                        onDone={u => {
                          onChanged(u as any);
                          setSavedId(i.id);
                          setTimeout(() => setSavedId(s => (s === i.id ? null : s)), 1500);
                        }}
                        onFail={() => flashFail(i.id)}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <button
                        onClick={() => openNext(i)}
                        disabled={i.quantity <= 0 || savingId === i.id}
                        title={i.quantity <= 0 ? 'Není žádné zavřené balení' : undefined}
                        className="inline-flex items-center gap-1.5 rounded-full glass border border-black/10 text-[#16181A] px-4 py-2.5 min-h-[40px] text-xs font-medium hover:bg-black/[0.05] transition disabled:opacity-40 active:scale-[0.97]"
                      >
                        <Icon name="plus" size={14} /> Otevřít další balení
                      </button>
                      {onStep ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-black/40">
                          Zavřených:
                          <button onClick={() => onStep(i, -1)} disabled={i.quantity <= 0} aria-label="Ubrat zavřené balení"
                            className="rounded-full glass w-10 h-10 flex items-center justify-center text-black/70 hover:text-black text-lg leading-none disabled:opacity-30 active:scale-95 transition">−</button>
                          <strong className="text-black/60 tabular-nums w-6 text-center text-sm">{i.quantity}</strong>
                          <button onClick={() => onStep(i, 1)} aria-label="Přidat zavřené balení"
                            className="rounded-full glass w-10 h-10 flex items-center justify-center text-black/70 hover:text-black text-lg leading-none active:scale-95 transition">+</button>
                        </span>
                      ) : (
                        <span className="text-[11px] text-black/40">
                          Zavřených: <strong className="text-black/60 tabular-nums">{i.quantity}</strong>
                        </span>
                      )}
                      {i.supplierUrl && (
                        <a href={i.supplierUrl} target="_blank" rel="noopener" title="Objednat u dodavatele"
                          className="rounded-full bg-[#C8F542]/20 text-[#5B7A08] hover:bg-[#C8F542]/30 px-3 py-1.5 text-xs font-semibold whitespace-nowrap">Objednat ↗</a>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
