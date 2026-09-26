'use client';
import { Button, Chip, EmptyState, SearchField, Segmented } from '../ui';

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
import { obsahuje, obsahujeNekde } from '@/lib/hledani';

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
          <Button variant="secondary" size="sm" iconOnly icon="minus" aria-label={`Ubrat zavřené balení — ${item.name}`}
            disabled={item.quantity <= 0} onClick={() => onStep(item, -1)} />
          <span className="text-[15px] font-semibold text-[#16181A] tabular-nums min-w-[3.5rem] text-center">
            {item.quantity} <span className="text-xs font-medium text-black/55">{item.unit}</span>
          </span>
          <Button variant="secondary" size="sm" iconOnly icon="plus" aria-label={`Přidat zavřené balení — ${item.name}`}
            onClick={() => onStep(item, 1)} />
        </div>
      ) : <span />}
      <div className="flex items-center gap-1">
        {item.supplierUrl && (
          <a href={item.supplierUrl} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
            <Icon name="external" size={15} /> Objednat
          </a>
        )}
        {onEditItem && (
          <Button variant="ghost" size="sm" iconOnly icon="pencil" aria-label={`Upravit ${item.name}`} onClick={() => onEditItem(item)} />
        )}
        {onRemoveItem && (
          <Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={`Smazat ${item.name}`} onClick={() => onRemoveItem(item)} />
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
  // „Máme zpátky" je primary, ne limetka — limetka je na obrazovce jedna (DP §3.1).
  return (
    <Button variant={parked ? 'primary' : 'secondary'} size="sm" icon={parked ? 'check' : 'archive'}
      loading={busy} onClick={() => onToggle(item, !parked)} className={className}>
      {parked ? 'Máme zpátky' : 'Nevedeme'}
    </Button>
  );
}

const TONE = {
  critical: { bar: 'bg-bad', chip: 'bad' },
  low: { bar: 'bg-wait', chip: 'wait' },
  ok: { bar: 'bg-ok', chip: 'ok' },
} as const;
const stavChip = (st: 'ok' | 'low' | 'critical') =>
  st === 'ok' ? null : <Chip tone={TONE[st].chip} size="sm" className="shrink-0">{st === 'critical' ? 'Kriticky' : 'Dochází'}</Chip>;

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
      .filter(i => obsahuje(i.name, q))
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
        {canEdit ? (
          <Segmented ariaLabel="Režim" value={mode} onChange={setMode}
            options={[{ id: 'view', label: 'Přehled' }, { id: 'edit', label: 'Zápis zbytků' }]} />
        ) : <span />}
        <div className="flex items-center gap-3 flex-wrap">
          {unit && !showParked && (
            <span className="text-sm text-black/55">
              Celkem v kategorii <strong className="text-[#16181A] tabular-nums">{fmtAmount(totalOfCategory)} {unit}</strong>
            </span>
          )}
          {(parkedCount > 0 || showParked) && (
            <button type="button" aria-pressed={showParked} onClick={() => setShowParked(v => !v)}
              className={`filter-pill tap-target-sm ${showParked ? 'seg-on' : 'seg-off glass'}`}>
              Nevedeme · {parkedCount}
            </button>
          )}
        </div>
      </div>

      {items.length > 6 && (
        <SearchField value={search} onChange={setSearch} placeholder={`Hledat v ${category}…`} ariaLabel={`Hledat v kategorii ${category}`}
          storageKey={`stock-${category}`} inputClassName="!py-2.5 text-sm" />
      )}

      {list.length === 0 ? (
        <div className="card">
          <EmptyState compact icon={search ? 'search' : 'box'} title={search ? 'Nic nenalezeno' : `V kategorii ${category} zatím nic není`} />
        </div>
      ) : mode === 'view' ? (
        <div className="space-y-5">
          {groups.map(([groupName, groupItems]) => (
            <div key={groupName} className="space-y-2.5">
              {showHeadings && (
                <p className="t-label">
                  {groupName} <span className="tabular-nums">· {groupItems.length}</span>
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {groupItems.map(i => {
                  const size = sizeOf(i);
                  const st = stockStatus(i, packaging);
                  const pct = openPct({ ...i, packageSize: size });
                  return (
                    <div key={i.id} className={`card p-4 ${i.archived ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="t-card leading-snug min-w-0">
                          {i.name}
                          {i.brand && <span className="ml-1.5 font-normal text-black/55">{i.brand}</span>}
                        </h3>
                        {stavChip(st)}
                      </div>
                      {i.description && <p className="t-meta mt-1 line-clamp-2">{i.description}</p>}
                      <p className="text-sm text-black/55 mt-1 tabular-nums">
                        {formatStock({ ...i, packageSize: size }, unit, i.unit)}
                      </p>
                      {size > 0 && (i.openAmount ?? 0) > 0 && (
                        <>
                          <div className="mt-2.5 h-2 w-full rounded-full bg-black/[0.06] overflow-hidden">
                            <div className={`h-full rounded-full ${TONE[st].bar} transition-[width]`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="t-meta mt-1">Načaté balení: {pct} %</p>
                        </>
                      )}
                      <p className="t-meta mt-1.5">
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
              <div key={i.id} className={`card p-4 ${i.archived ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="t-card leading-snug">
                      {i.name}
                      {i.brand && <span className="ml-1.5 font-normal text-black/55">{i.brand}</span>}
                      {showHeadings && i.category && i.category !== category && (
                        <Chip tone="muted" size="sm" className="ml-2 align-middle">{i.category}</Chip>
                      )}
                    </h3>
                    <p className="t-meta tabular-nums mt-0.5">
                      {formatStock({ ...i, packageSize: size }, unit, i.unit)}
                      {size > 0 && <> · balení {fmtAmount(size)} {unit}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {savedId === i.id && (
                      <span className="text-xs font-medium text-ok-ink flex items-center gap-1" role="status">
                        <Icon name="check" size={13} /> Uloženo
                      </span>
                    )}
                    {failedId === i.id && (
                      <span className="text-xs font-semibold text-bad-ink flex items-center gap-1">
                        <Icon name="warning" size={13} /> Neuloženo
                      </span>
                    )}
                    {stavChip(st)}
                    {onEditItem && (
                      <Button variant="ghost" size="sm" iconOnly icon="pencil" aria-label={`Upravit ${i.name}`} onClick={() => onEditItem(i)} />
                    )}
                    {onRemoveItem && (
                      <Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={`Smazat ${i.name}`} onClick={() => onRemoveItem(i)} />
                    )}
                  </div>
                </div>

                {i.archived ? (
                  <div className="mt-3">
                    <ParkButton item={i} busy={savingId === i.id} onToggle={setParked} />
                  </div>
                ) : size <= 0 ? (
                  <>
                    <p className="text-xs text-wait-ink mt-2">
                      Chybí velikost balení — doplň ji u položky ve skladu.
                    </p>
                    <ParkButton item={i} busy={savingId === i.id} onToggle={setParked} className="mt-2.5" />
                  </>
                ) : (
                  <>
                    {/* Vybraný stupeň je inkoustová pilulka (DP §3.8) — dřív limetka, jako by šlo o akci. */}
                    <div className="flex flex-wrap gap-1.5 mt-3" role="group" aria-label={`Kolik zbývá v načatém — ${i.name}`}>
                      {steps.map(s => {
                        const active = Math.abs(current - s.amount) < 0.05;
                        return (
                          <button
                            type="button"
                            key={s.label}
                            aria-pressed={active}
                            onClick={() => persist(i, { openAmount: s.amount })}
                            disabled={savingId === i.id}
                            className={`filter-pill tap-target-sm disabled:opacity-50 ${active ? 'seg-on' : 'seg-off glass'}`}
                          >
                            {s.label}
                            <span className="ml-1.5 text-xs tabular-nums opacity-70">
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
                      <Button variant="secondary" size="sm" icon="plus"
                        onClick={() => openNext(i)}
                        disabled={i.quantity <= 0 || savingId === i.id}
                        title={i.quantity <= 0 ? 'Není žádné zavřené balení' : undefined}>
                        Otevřít další balení
                      </Button>
                      {onStep ? (
                        <span className="inline-flex items-center gap-1.5 t-meta">
                          Zavřených:
                          <Button variant="secondary" size="sm" iconOnly icon="minus" aria-label={`Ubrat zavřené balení — ${i.name}`}
                            disabled={i.quantity <= 0} onClick={() => onStep(i, -1)} />
                          <strong className="text-[#16181A] tabular-nums w-6 text-center text-sm">{i.quantity}</strong>
                          <Button variant="secondary" size="sm" iconOnly icon="plus" aria-label={`Přidat zavřené balení — ${i.name}`}
                            onClick={() => onStep(i, 1)} />
                        </span>
                      ) : (
                        <span className="t-meta">
                          Zavřených: <strong className="text-[#16181A] tabular-nums">{i.quantity}</strong>
                        </span>
                      )}
                      {i.supplierUrl && (
                        <a href={i.supplierUrl} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
                          <Icon name="external" size={15} /> Objednat
                        </a>
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
