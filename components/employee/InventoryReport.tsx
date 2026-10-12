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
//
// Audit kola 6: Z5 — od dvou rozepsaných řádků je nad dokem lišta „Uložit
// n změn" (16 položek dřív znamenalo 32 klepnutí; řádkové Uložit zůstává pro
// jednu opravu). Z6 — klepnutí na řádek Docházejících zásob posílá
// `stav:dochazi|Kategorie` a odsud se dřív brala jen kategorie s balením:
// stránka odskočila nahoru a nic nevybrala. Teď se zapne filtr „Jen co
// dochází" i kategorie (jdou zrušit), seznam se posune do záběru a s
// `polozka:ID` se rovnou zaostří pole množství té položky.

import { rozborSkladArg } from '@/lib/skladPredani';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, ListRow, Menu, Modal, PlovouciLista, SearchField, Skeleton, Toast, runBulk, type MenuItem } from '../ui';
import { Icon } from '../Icons';
import CategoryStockView from '../inventory/CategoryStockView';
import { Poznamky } from '../Poznamky';
import PoleMnozstvi from '../inventory/PoleMnozstvi';
import { normalizeCategoryPackaging } from '@/lib/packaging';
import { pocetDoPole, pocetZPole } from '@/lib/inventura';
import { jednotkaSnesDesetiny } from '@/lib/jednotky';
import { packagingSourceOf, branchTracksOpen, findById, matcher } from '@/lib/categoryTree';
import CategoryNav from '../inventory/CategoryNav';
import { useT } from '@/lib/i18n/client';
import { obsahuje } from '@/lib/hledani';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useOpravneni } from '../role/useOpravneni';
import { useSkrytyNastroj } from '@/lib/useSkrytyNastroj';

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
  /** Zvedne se při každém příchodu z widgetu — stejný argument podruhé (filtr mezitím zrušený) se tak použije znovu. */
  predani?: number;
}

const URL_SKLAD = '/api/inventory';
const URL_KATEGORIE = '/api/inventory/categories';
const URL_FORMAT = '/api/inventory/format';
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

/** Od kolika rozepsaných řádků se ukáže lišta hromadného uložení (jedna oprava má řádkové Uložit). */
const HROMADNE_OD = 2;

export default function InventoryReport({ initialCategory, predani = 0 }: Props) {
  const t = useT('zamestnanec');
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

  // Rozepsané (neuložené) množství po položkách — jako text, ať „2," při psaní
  // nepřijde o čárku (kolo 82: pole s jednotkou a ± místo type="number").
  const [draft, setDraft] = useState<Record<number, string>>({});
  // Desetiny (2,5 kg) jen tam, kde je sloupec NUMERIC a jednotka je snese.
  const sloupce = useDataWidgetu<{ mnozstvi: boolean }>(URL_FORMAT, raw => ({ mnozstvi: (raw as any)?.mnozstvi === true }));
  const [savingId, setSavingId] = useState<number | null>(null);
  const [ukladamVse, setUkladamVse] = useState(false);
  // Filtry z widgetu (Z6): „Jen co dochází" a kategorie; obojí jde zrušit.
  const [jenDochazi, setJenDochazi] = useState(false);
  const [filtrKategorie, setFiltrKategorie] = useState<string | null>(null);
  const [vybranaId, setVybranaId] = useState<number | null>(null);
  const seznamRef = useRef<HTMLDivElement>(null);
  // V úpravách plochy je nástroj schovaný (zůstává připojený) — lišta hromadného uložení se pak nekreslí.
  const korenRef = useRef<HTMLDivElement>(null);
  const schovany = useSkrytyNastroj(korenRef);
  const [zprava, setZprava] = useState<{ text: string; ton?: 'bad' } | null>(null);
  // Položka, ke které jsou otevřené poznámky („···" → Poznámky): zaměstnanec nemá okno Upravit položku,
  // tak je čte a píše tady — ve stejném okně, jaké vidí vedení u položky.
  const [poznamkyK, setPoznamkyK] = useState<InventoryItem | null>(null);
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
    const kategorie = rozborSkladArg(initialCategory).kategorie;
    if (!kategorie || allCats.length === 0) return;
    const hit = allCats.find((c: any) => c.name === kategorie);
    if (hit) setOpenCat(hit.id);
  }, [initialCategory, allCats]);
  // Filtry z argumentu widgetu a posun k seznamu (na telefonu leží pod widgety).
  useEffect(() => {
    if (!initialCategory) return;
    const p = rozborSkladArg(initialCategory);
    setJenDochazi(p.jenDochazi);
    setFiltrKategorie(p.kategorie ?? null);
    setVybranaId(p.polozkaId ?? null);
    if (p.polozkaId) { setSearch(''); setShowParked(false); }
    if (p.jenDochazi || p.kategorie || p.polozkaId) {
      requestAnimationFrame(() => seznamRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [initialCategory, predani]);

  const textOf = (i: InventoryItem) => draft[i.id] ?? pocetDoPole(i.quantity);
  const qtyOf = (i: InventoryItem) => { const p = pocetZPole(textOf(i), true); return p.ok && p.hodnota != null ? p.hodnota : i.quantity; };
  const isDirty = (i: InventoryItem) => draft[i.id] !== undefined && qtyOf(i) !== i.quantity;
  const setQty = (id: number, text: string) => setDraft(prev => ({ ...prev, [id]: text }));

  const save = async (item: InventoryItem) => {
    const newQty = qtyOf(item);
    if (newQty === item.quantity) return;
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQty, note: 'Úprava stavu zaměstnancem' }), // i18n-ok: poznámka do historie skladu
      });
      if (!res.ok) throw new Error();
      const updated = await res.json().catch(() => null);
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, ...(updated ?? { quantity: newQty }) } : x));
      setDraft(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      setZprava({ text: t('{nazev}: uloženo {n} {jednotka}.', { nazev: item.name, n: newQty, jednotka: item.unit }) });
      // Docházející zásoby a další widgety na ploše ať vidí nový stav hned.
      obnovDataWidgetu(URL_SKLAD);
    } catch {
      setZprava({ text: t('Množství se nepodařilo uložit — zkus to znovu.'), ton: 'bad' });
    } finally {
      setSavingId(null);
    }
  };

  const parkedCount = items.filter(i => i.archived === true).length;
  const filtered = useMemo(
    () => items
      .filter(i => (showParked ? i.archived === true : i.archived !== true) && obsahuje(i.name, search))
      .filter(i => !jenDochazi || statusOf(i) !== 'ok' || i.id === vybranaId)
      .filter(i => !filtrKategorie || i.category === filtrKategorie || i.id === vybranaId)
      // Co dochází, nahoře — dřív to byl samostatný blok se stejnými položkami podruhé.
      .sort((a, b) => statusRank[statusOf(a)] - statusRank[statusOf(b)] || a.name.localeCompare(b.name, 'cs')),
    [items, search, showParked, jenDochazi, filtrKategorie, vybranaId],
  );
  // Vybraná položka z widgetu: až je v seznamu, posunout na ni a dát fokus do pole množství.
  useEffect(() => {
    if (vybranaId == null || !filtered.some(i => i.id === vybranaId)) return;
    const id = vybranaId;
    const k = setTimeout(() => {
      const el = document.getElementById(`sklad-mnozstvi-${id}`) as HTMLInputElement | null;
      el?.closest('li')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
      el?.select?.();
    }, 350);
    return () => clearTimeout(k);
  }, [vybranaId, filtered]);

  // Rozepsané řádky (změněné množství) a jejich uložení jedním klepnutím (Z5).
  const rozepsane = useMemo(() => items.filter(isDirty), [items, draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const ulozVse = async () => {
    const davka = rozepsane.map(i => ({ id: i.id, qty: qtyOf(i) }));
    if (davka.length === 0) return;
    setUkladamVse(true);
    const odpovedi = new Map<number, Partial<InventoryItem> | null>();
    // Naráz, ne za sebou (runBulk); co se nepovede, zůstane rozepsané k dalšímu pokusu.
    const { done, failed } = await runBulk(davka.map(d => d.id), async id => {
      const qty = davka.find(d => d.id === id)!.qty;
      const res = await fetch(`/api/inventory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty, note: 'Úprava stavu zaměstnancem' }), // i18n-ok: poznámka do historie skladu
      });
      if (!res.ok) throw new Error();
      odpovedi.set(id, await res.json().catch(() => null));
    });
    const hotove = new Set(done);
    setItems(prev => prev.map(x => (hotove.has(x.id) ? { ...x, ...(odpovedi.get(x.id) ?? { quantity: davka.find(d => d.id === x.id)!.qty }) } : x)));
    setDraft(prev => { const n = { ...prev }; for (const id of done) delete n[id]; return n; });
    setZprava(failed.length === 0
      ? { text: t('Uloženo {n, plural, one {# změna} few {# změny} other {# změn}}.', { n: done.length }) }
      : { text: t('{n} z {celkem} se nepodařilo uložit — zkus to znovu.', { n: failed.length, celkem: davka.length }), ton: 'bad' });
    if (done.length > 0) obnovDataWidgetu(URL_SKLAD);
    setUkladamVse(false);
  };
  const hromadnaLista = smiZapsat && rozepsane.length >= HROMADNE_OD && !schovany;

  // The person at the counter is the one who knows something ran out.
  const setParked = async (item: InventoryItem, archived: boolean) => {
    setItems(prev => prev.map(x => x.id === item.id ? { ...x, archived } : x));
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived, note: archived ? 'Označeno „nevedeme"' : 'Vráceno do skladu' }), // i18n-ok: poznámka do historie skladu
      });
      if (!res.ok) throw new Error();
      obnovDataWidgetu(URL_SKLAD);
    } catch {
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, archived: !archived } : x));
      setZprava({ text: t('Změnu se nepodařilo uložit.'), ton: 'bad' });
    }
  };

  const radek = (item: InventoryItem) => {
    const st = statusOf(item);
    const dirty = isDirty(item);
    const menu: MenuItem[] = [
      { label: t('Poznámky'), icon: 'chat', onClick: () => setPoznamkyK(item) },
      ...(smiZapsat ? [{ label: item.archived ? t('Máme zpátky') : t('Momentálně nevedeme'), icon: 'archive', onClick: () => setParked(item, item.archived !== true) }] : []),
      ...(item.supplierUrl ? [{ label: t('Objednat u dodavatele'), icon: 'external', onClick: () => { window.open(item.supplierUrl, '_blank', 'noopener'); } }] : []),
    ];
    return (
      <li key={item.id} className={vybranaId === item.id ? 'rounded-[var(--r-md)] ring-2 ring-[#C8F542]/60' : undefined}>
        <ListRow as="div"
          lead={<span className={`w-2 h-2 rounded-full shrink-0 ${st === 'critical' ? 'bg-bad' : st === 'low' ? 'bg-wait' : 'bg-ok'}`} aria-hidden />}
          title={<>{item.name}{item.brand && <span className="ml-1.5 font-normal text-black/55">{item.brand}</span>}</>}
          // Stav jde do meta řádku, ne do ocasu jako chip: na telefonu se ocas
          // (chip + krokovač + jednotka + Uložit + „···") do karty 390 px
          // nevešel a Uložit s menu skončily mimo obrazovku. Barvu stavu nese
          // tečka vlevo, slovo tónovaný text.
          meta={(st !== 'ok' || item.approved === false || item.description || item.category) ? <>
            {st !== 'ok' && <span className={`font-medium ${st === 'critical' ? 'text-bad-ink' : 'text-wait-ink'}`}>{st === 'critical' ? t('kriticky') : t('dochází')}</span>}
            {item.approved === false && <span className="font-medium text-wait-ink">{st !== 'ok' ? ' · ' : ''}{t('čeká na potvrzení')}</span>}
            {(item.description || item.category) && <>{st !== 'ok' || item.approved === false ? ' · ' : ''}{item.description || item.category}</>}
          </> : undefined}
          actions={smiZapsat ? <>
            {/* Jednotka je přímo v poli (dřív šedý text vedle, u „balení" useknutý) a ± kolem něj. */}
            <PoleMnozstvi id={`sklad-mnozstvi-${item.id}`}
              value={textOf(item)} onChange={v => setQty(item.id, v)}
              jednotka={item.unit} krok={1} nazev={item.name}
              desetinne={sloupce.data?.mnozstvi === true && jednotkaSnesDesetiny(item.unit)}
              // Bez popisku odečítač přečte jen „číslo" a člověk neví, čeho.
              ariaLabel={item.unit ? t('Množství — {nazev} ({jednotka})', { nazev: item.name, jednotka: item.unit }) : t('Množství — {nazev}', { nazev: item.name })}
              className="!w-44 max-w-full"
            />
            {/* Uložit je `primary` jen s rozepsanou změnou — limetka na obrazovce
                je jedna a v řádku nikdy (DP §3.1). */}
            <Button variant={dirty ? 'primary' : 'secondary'} size="sm" disabled={!dirty} loading={savingId === item.id}
              onClick={() => save(item)}>{t('Uložit')}</Button>
            <Menu size="sm" label={t('Další akce: {nazev}', { nazev: item.name })} items={menu} />
          </> : (<>
            <span className="text-sm font-medium tabular-nums">{item.quantity} {item.unit}</span>
            {/* I kdo jen čte, má k položce poznámky („···"). */}
            <Menu size="sm" label={t('Další akce: {nazev}', { nazev: item.name })} items={menu} />
          </>)}
        />
      </li>
    );
  };

  const nastroj = (
    <div ref={korenRef} className="space-y-4">
      {!loading && packagedCats.length > 0 && (
        <div className="space-y-3">
          <CategoryNav
            categories={packagedCats}
            current={openCat}
            onNavigate={setOpenCat}
            countOf={countIn}
            rootLabel={t('Zbytky')}
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
        <div ref={seznamRef} className="px-5 pt-5 space-y-3 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="sklad-zam-seznam" className="t-card flex items-center gap-2">
              {showParked ? t('Momentálně nevedeme') : t('Všechny položky')}
              {sklad.data && <Chip tone="muted" size="sm">{filtered.length}</Chip>}
            </h2>
            {(parkedCount > 0 || showParked) && (
              <button type="button" aria-pressed={showParked} onClick={() => setShowParked(v => !v)}
                className={`filter-pill tap-target-sm ${showParked ? 'seg-on' : 'seg-off glass'}`}>
                {t('Nevedeme · {n}', { n: parkedCount })}
              </button>
            )}
          </div>
          <SearchField value={search} onChange={setSearch}
            placeholder={t('Hledat položku…')} ariaLabel={t('Hledat ve skladu')} storageKey="inventory-employee"
            suggestions={Array.from(new Set(items.map(i => i.category).filter(Boolean))).slice(0, 6).map(c => ({ label: String(c), hint: t('kategorie') }))} />
          {(jenDochazi || filtrKategorie) && (
            <div className="flex flex-wrap gap-1.5">
              {jenDochazi && (
                <button type="button" onClick={() => setJenDochazi(false)} aria-label={t('Zrušit filtr: {kdo}', { kdo: t('Jen co dochází') })}
                  className="filter-pill tap-target-sm seg-on inline-flex items-center gap-1.5">
                  {t('Jen co dochází')}<Icon name="close" size={12} />
                </button>
              )}
              {filtrKategorie && (
                <button type="button" onClick={() => setFiltrKategorie(null)} aria-label={t('Zrušit filtr: {kdo}', { kdo: filtrKategorie })}
                  className="filter-pill tap-target-sm seg-on inline-flex items-center gap-1.5">
                  {filtrKategorie}<Icon name="close" size={12} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="px-5 pb-2">
          {sklad.error && !sklad.data ? (
            <ErrorState compact title={t('Sklad se nenačetl')} onRetry={sklad.reload} detail={sklad.error} className="!py-6" />
          ) : loading ? (
            <div className="space-y-2 py-3" aria-busy>
              <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12 w-2/3" />
            </div>
          ) : filtered.length === 0 ? (
            items.length === 0
              ? <EmptyState compact illustration="sklad" title={t('Sklad je zatím prázdný')} hint={t('Položky zakládá vedení. Když něco přivezeš, zapiš to widgetem Zapsat novou věc.')} className="!py-6" />
              : <EmptyState compact icon="search" title={t('Nic neodpovídá hledání')} hint={t('Zkus jiné slovo nebo zruš filtr.')} className="!py-6"
                  action={jenDochazi || filtrKategorie ? <Button variant="secondary" size="sm" onClick={() => { setJenDochazi(false); setFiltrKategorie(null); }}>{t('Zrušit filtry')}</Button> : undefined} />
          ) : (
            <ul className="list">{filtered.map(radek)}</ul>
          )}
        </div>
      </Card>
      {/* Místo pod lištou hromadného uložení, ať nezakryje poslední řádek. */}
      {hromadnaLista && <div aria-hidden className="h-16" />}
    </div>
  );

  return (
    <>
      <PlochaWidgetu
        stranka="zamestnanec.sklad"
        hlavicka={{
          title: t('Sklad'),
          subtitle: sklad.data ? t('{n, plural, one {# položka} few {# položky} other {# položek}} · uprav stav, když něco dochází', { n: items.filter(i => i.archived !== true).length }) : t('Uprav stav, když něco dochází — vedení dostane upozornění.'),
          hintId: 'inventoryreport',
        }}
        nastroj={nastroj}
      />
      {/* Jediná limetka obrazovky (řádkové Uložit je tmavé): uloží všechny rozepsané řádky naráz. */}
      {hromadnaLista && (
        <PlovouciLista label={t('Rozepsané změny skladu')}>
          <span className="text-sm font-semibold whitespace-nowrap px-1 tabular-nums">
            {t('Rozepsáno {n}', { n: rozepsane.length })}
          </span>
          <button type="button" onClick={() => { void ulozVse(); }} disabled={ukladamVse} aria-busy={ukladamVse || undefined}
            className="btn btn-accent btn-sm tap-target whitespace-nowrap disabled:opacity-60">
            {t('Uložit {n, plural, one {# změnu} few {# změny} other {# změn}}', { n: rozepsane.length })}
          </button>
        </PlovouciLista>
      )}
      {zprava && <Toast message={zprava.text} tone={zprava.ton} onClose={() => setZprava(null)} />}
      {poznamkyK && (
        <Modal open onClose={() => setPoznamkyK(null)} size="md" title={poznamkyK.name} subtitle={poznamkyK.category || undefined}>
          <Poznamky typ="inventory_item" id={poznamkyK.id} />
        </Modal>
      )}
    </>
  );
}
