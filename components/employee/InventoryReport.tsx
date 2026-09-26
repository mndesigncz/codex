'use client';

// Sklad (zaměstnanec) — plocha s widgety a stav skladu jako hlavní nástroj
// (kolo 69, balík B3, spec §6.2).
//
// Do kola 68 tu nad seznamem stála plná limetková plocha „Probíhá inventura",
// karta „Přivezl se něco nového?" s formulářem, ručně tónovaná karta
// „Dochází — uprav stav" s řádky jako boxy (karta v kartě, stejné položky
// podruhé) a dole rozbalovací „Nahlásit chybějící" se šipkami ▲▼. Každý řádek
// měl ruční „Nevedeme" a limetkové „Uložit" — při dvou změnách dvě limetky.
// Bloky jsou teď widgety (sklad.inventura, sklad.zapsat_novou, sklad.dochazi,
// sklad.nahlasit v components/widgety/oblasti/sklad.tsx); tady zůstal seznam
// se zápisem množství v jedné kartě (DP §3.6) a kategorie s balením.
//
// Položky přes useDataWidgetu (sdílená mezipaměť): widget „Zapsat novou věc"
// po zápisu obnoví /api/inventory a nová věc se tu objeví sama. Rozepsaná
// množství (`draft`) drží tahle komponenta — nástroj zůstává v úpravách
// plochy připojený, takže je vstup do úprav nezahodí.

import { useState, useEffect, useMemo } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, ListRow, Menu, SearchField, Skeleton, Toast, type MenuItem } from '../ui';
import CategoryStockView from '../inventory/CategoryStockView';
import { normalizeCategoryPackaging } from '@/lib/packaging';
import { packagingSourceOf, branchTracksOpen, findById, matcher } from '@/lib/categoryTree';
import CategoryNav from '../inventory/CategoryNav';
import { czCount, POLOZKA } from '@/lib/czech';
import { obsahuje } from '@/lib/hledani';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useOpravneni } from '../role/useOpravneni';

interface InventoryItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  maxQuantity: number;
  unit: string;
  supplierUrl?: string;
  categoryId?: number | null;
  brand?: string | null;
  description?: string | null;
  archived?: boolean;
  approved?: boolean;
  status?: 'ok' | 'low' | 'critical';
  packageSize?: number | null;
  openAmount?: number | null;
}

interface Props {
  user?: { id?: string; name?: string | null };
  initialCategory?: string;
}

const URL_SKLAD = '/api/inventory';
const URL_KATEGORIE = '/api/inventory/categories';
const pole = (raw: unknown): any[] => (Array.isArray(raw) ? raw : []);

// The API already applied the category's threshold unit; the comparison below
// is only a fallback for payloads from an older deployment.
function statusOf(i: InventoryItem): 'ok' | 'low' | 'critical' {
  if (i.status) return i.status;
  if (i.quantity <= i.criticalQuantity) return 'critical';
  if (i.quantity <= i.minQuantity) return 'low';
  return 'ok';
}
const statusRank = { critical: 0, low: 1, ok: 2 } as const;

export default function InventoryReport({ initialCategory }: Props) {
  const sklad = useDataWidgetu<InventoryItem[]>(URL_SKLAD, pole);
  const kat = useDataWidgetu<any[]>(URL_KATEGORIE, pole);
  const [items, setItems] = useState<InventoryItem[]>([]);
  useEffect(() => { if (sklad.data) setItems(sklad.data); }, [sklad.data]);
  // All categories — the tap-scale view is offered for the ones that track open
  // packages, and subcategories inherit that setting from their parent.
  const allCats = kat.data ?? [];
  const [openCat, setOpenCat] = useState<number | null>(null);
  const loading = sklad.data == null && !sklad.error;
  const [search, setSearch] = useState('');
  // Parked items step aside from the working list but stay one tap away.
  const [showParked, setShowParked] = useState(false);

  // Per-item edited (unsaved) quantity draft.
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [zprava, setZprava] = useState<{ text: string; ton?: 'bad' } | null>(null);
  // Zápis stavu a „nevedeme" chce sklad.zapsat_stav (kolo 67) — bez něj seznam jen čte.
  // `ma()` se záchytem: dokud oprávnění nedorazí, krokovač je vidět (server zápis stejně hlídá).
  const { ma } = useOpravneni();
  const smiZapsat = ma(['sklad.zapsat_stav', 'sklad.upravit']);

  // Offered here: anything that tracks open packages, anything that inherits it
  // from an ancestor, and any parent on the way down to such a category —
  // otherwise a nested one would have no path to reach it.
  const packagedCats = useMemo(
    () => allCats.filter((c: any) =>
      branchTracksOpen(allCats as any, c) || packagingSourceOf(allCats as any, c.name) != null),
    [allCats],
  );

  // Packaging settings for the open category, inherited from the nearest
  // ancestor that carries them.
  const openCategory = findById(allCats as any, openCat);
  const openPackaging = useMemo(
    () => (openCategory ? packagingSourceOf(allCats as any, openCategory) : null),
    [allCats, openCategory],
  );

  // Newly written-in things count as stock from the moment they land — hiding
  // them until the employer ticks them off would mean the shift can't work with
  // what it just unpacked. They only carry a „čeká na potvrzení" chip.
  const countIn = (id: number) => items.filter(matcher(allCats as any, id)).length;

  // A quick-access tile still points at a category by name; resolve it to an id
  // once the categories have loaded.
  useEffect(() => {
    if (!initialCategory || allCats.length === 0) return;
    const hit = allCats.find((c: any) => c.name === initialCategory);
    if (hit) setOpenCat(hit.id);
  }, [initialCategory, allCats]);

  const qtyOf = (i: InventoryItem) => (draft[i.id] !== undefined ? draft[i.id] : i.quantity);
  const isDirty = (i: InventoryItem) => draft[i.id] !== undefined && draft[i.id] !== i.quantity;
  const setQty = (id: number, val: number) => setDraft(prev => ({ ...prev, [id]: Math.max(0, val) }));

  const save = async (item: InventoryItem) => {
    const newQty = qtyOf(item);
    if (newQty === item.quantity) return;
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQty, note: 'Úprava stavu zaměstnancem' }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json().catch(() => null);
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, ...(updated ?? { quantity: newQty }) } : x));
      setDraft(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      setZprava({ text: `${item.name}: uloženo ${newQty} ${item.unit}.` });
      // Docházející zásoby a další widgety na ploše ať vidí nový stav hned.
      obnovDataWidgetu(URL_SKLAD);
    } catch {
      setZprava({ text: 'Množství se nepodařilo uložit — zkus to znovu.', ton: 'bad' });
    } finally {
      setSavingId(null);
    }
  };

  const parkedCount = items.filter(i => i.archived === true).length;
  const filtered = useMemo(
    () => items
      .filter(i => (showParked ? i.archived === true : i.archived !== true) && obsahuje(i.name, search))
      // Co dochází, nahoře — dřív to byl samostatný blok se stejnými položkami podruhé.
      .sort((a, b) => statusRank[statusOf(a)] - statusRank[statusOf(b)] || a.name.localeCompare(b.name, 'cs')),
    [items, search, showParked],
  );

  // The person at the counter is the one who knows something ran out.
  const setParked = async (item: InventoryItem, archived: boolean) => {
    setItems(prev => prev.map(x => x.id === item.id ? { ...x, archived } : x));
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived, note: archived ? 'Označeno „nevedeme"' : 'Vráceno do skladu' }),
      });
      if (!res.ok) throw new Error();
      obnovDataWidgetu(URL_SKLAD);
    } catch {
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, archived: !archived } : x));
      setZprava({ text: 'Změnu se nepodařilo uložit.', ton: 'bad' });
    }
  };

  const radek = (item: InventoryItem) => {
    const st = statusOf(item);
    const dirty = isDirty(item);
    const menu: MenuItem[] = [
      ...(smiZapsat ? [{ label: item.archived ? 'Máme zpátky' : 'Momentálně nevedeme', icon: 'archive', onClick: () => setParked(item, item.archived !== true) }] : []),
      ...(item.supplierUrl ? [{ label: 'Objednat u dodavatele', icon: 'external', onClick: () => { window.open(item.supplierUrl, '_blank', 'noopener'); } }] : []),
    ];
    return (
      <li key={item.id}>
        <ListRow as="div"
          lead={<span className={`w-2 h-2 rounded-full shrink-0 ${st === 'critical' ? 'bg-bad' : st === 'low' ? 'bg-wait' : 'bg-ok'}`} aria-hidden />}
          title={<>{item.name}{item.brand && <span className="ml-1.5 font-normal text-black/55">{item.brand}</span>}</>}
          // Stav jde do meta řádku, ne do ocasu jako chip: na telefonu se ocas
          // (chip + krokovač + jednotka + Uložit + „···") do karty 390 px
          // nevešel a Uložit s menu skončily mimo obrazovku. Barvu stavu nese
          // tečka vlevo, slovo tónovaný text.
          meta={(st !== 'ok' || item.approved === false || item.description || item.category) ? <>
            {st !== 'ok' && <span className={`font-medium ${st === 'critical' ? 'text-bad-ink' : 'text-wait-ink'}`}>{st === 'critical' ? 'kriticky' : 'dochází'}</span>}
            {item.approved === false && <span className="font-medium text-wait-ink">{st !== 'ok' ? ' · ' : ''}čeká na potvrzení</span>}
            {(item.description || item.category) && <>{st !== 'ok' || item.approved === false ? ' · ' : ''}{item.description || item.category}</>}
          </> : undefined}
          actions={smiZapsat ? <>
            <span className="flex items-center gap-1">
              <Button variant="secondary" size="sm" iconOnly icon="minus" aria-label={`Ubrat — ${item.name}`} onClick={() => setQty(item.id, qtyOf(item) - 1)} />
              <input
                type="number" inputMode="numeric"
                // Bez popisku odečítač přečte jen „číslo" a člověk neví, čeho.
                aria-label={`Množství — ${item.name}${item.unit ? ` (${item.unit})` : ''}`}
                value={qtyOf(item)}
                onChange={e => setQty(item.id, parseInt(e.target.value) || 0)}
                className="field !w-16 !px-2 text-center tabular-nums"
              />
              <Button variant="secondary" size="sm" iconOnly icon="plus" aria-label={`Přidat — ${item.name}`} onClick={() => setQty(item.id, qtyOf(item) + 1)} />
              <span className="text-xs text-black/55 w-6">{item.unit}</span>
            </span>
            {/* Uložit je `primary` jen s rozepsanou změnou — limetka na obrazovce
                je jedna a v řádku nikdy (DP §3.1). */}
            <Button variant={dirty ? 'primary' : 'secondary'} size="sm" disabled={!dirty} loading={savingId === item.id}
              onClick={() => save(item)}>Uložit</Button>
            {menu.length > 0 && <Menu size="sm" label={`Další akce: ${item.name}`} items={menu} />}
          </> : (
            <span className="text-sm font-medium tabular-nums">{item.quantity} {item.unit}</span>
          )}
        />
      </li>
    );
  };

  const nastroj = (
    <div className="space-y-4">
      {!loading && packagedCats.length > 0 && (
        <div className="space-y-3">
          <CategoryNav
            categories={packagedCats}
            current={openCat}
            onNavigate={setOpenCat}
            countOf={countIn}
            rootLabel="Zbytky"
          />
          {openCat != null && openPackaging && (() => {
            const inCat = matcher(allCats as any, openCat);
            return (
              <CategoryStockView
                category={openCategory?.name ?? ''}
                packaging={normalizeCategoryPackaging(openPackaging)}
                items={items.filter(inCat) as any}
                canEdit={smiZapsat}
                onChanged={u => { setItems(list => list.map(x => x.id === u.id ? { ...x, ...u } : x)); obnovDataWidgetu(URL_SKLAD); }}
              />
            );
          })()}
        </div>
      )}

      <Card pad="none" aria-labelledby="sklad-zam-seznam">
        <div className="px-5 pt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="sklad-zam-seznam" className="t-card flex items-center gap-2">
              {showParked ? 'Momentálně nevedeme' : 'Všechny položky'}
              {sklad.data && <Chip tone="muted" size="sm">{filtered.length.toLocaleString('cs-CZ')}</Chip>}
            </h2>
            {(parkedCount > 0 || showParked) && (
              <button type="button" aria-pressed={showParked} onClick={() => setShowParked(v => !v)}
                className={`filter-pill tap-target-sm ${showParked ? 'seg-on' : 'seg-off glass'}`}>
                Nevedeme · {parkedCount}
              </button>
            )}
          </div>
          <SearchField value={search} onChange={setSearch}
            placeholder="Hledat položku…" ariaLabel="Hledat ve skladu" storageKey="inventory-employee"
            suggestions={Array.from(new Set(items.map(i => i.category).filter(Boolean))).slice(0, 6).map(c => ({ label: String(c), hint: 'kategorie' }))} />
        </div>
        <div className="px-5 pb-2">
          {sklad.error && !sklad.data ? (
            <ErrorState compact title="Sklad se nenačetl" onRetry={sklad.reload} detail={sklad.error} className="!py-6" />
          ) : loading ? (
            <div className="space-y-2 py-3" aria-busy>
              <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12 w-2/3" />
            </div>
          ) : filtered.length === 0 ? (
            items.length === 0
              ? <EmptyState compact illustration="sklad" title="Sklad je zatím prázdný" hint="Položky zakládá vedení. Když něco přivezeš, zapiš to widgetem Zapsat novou věc." className="!py-6" />
              : <EmptyState compact icon="search" title="Nic neodpovídá hledání" hint="Zkus jiné slovo nebo zruš filtr." className="!py-6" />
          ) : (
            <ul className="list">{filtered.map(radek)}</ul>
          )}
        </div>
      </Card>
    </div>
  );

  return (
    <>
      <PlochaWidgetu
        stranka="zamestnanec.sklad"
        hlavicka={{
          title: 'Sklad',
          subtitle: sklad.data ? `${czCount(items.filter(i => i.archived !== true).length, POLOZKA)} · uprav stav, když něco dochází` : 'Uprav stav, když něco dochází — vedení dostane upozornění.',
          hintId: 'inventoryreport',
        }}
        nastroj={nastroj}
      />
      {zprava && <Toast message={zprava.text} tone={zprava.ton} onClose={() => setZprava(null)} />}
    </>
  );
}
