'use client';

// Sklad (vedení) — plocha s widgety a položky skladu jako hlavní nástroj
// (kolo 69, balík B3, spec §6.2).
//
// Do kola 68 byly nad seznamem natvrdo až čtyři tónované karty (chybějící
// údaje, návrhy od týmu, souhrn „kriticky/dochází", K výrobě) a panel
// objednávek; hlášení od týmu a inventura se schovávaly v menu. Všechno
// z jednoho velkého načtení a všechno bez ohledu na oprávnění. Bloky jsou teď
// widgety (components/widgety/oblasti/sklad.tsx), každý se svým dotazem za
// svým oprávněním; kdo je nechce, odebere je. Tady zůstaly položky skladu
// s hledáním, kategoriemi, řazením, hromadnými úpravami a okna, která s nimi
// pracují (položka, nákupní seznam, kategorie, dodavatelé, inventura).
//
// Položky se berou přes useDataWidgetu: widget, který schválí návrh nebo
// přijme objednávku, obnoví tutéž URL a seznam se srovná sám (a na stránku
// je to jeden dotaz na /api/inventory, ne tři). Kroky ± se dál ukládají
// optimisticky do místního stavu, ten se s další odpovědí serveru přepíše.
//
// Widgety s nástrojem mluví událostmi (lib/skladPrehled.ts): „Objednat"
// v Nákupním seznamu otevře okno nákupu, řádek v Surovinách bez ceny
// otevře úpravu položky. Z jiné stránky žádost počká v sessionStorage.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Icon } from '../Icons';
import {
  Button, Card, Chip, EmptyState, ErrorState, Field, ListRow, Menu, Modal, SearchField, Segmented, Skeleton, Toast,
  BulkBar, SelectBox, Avatar, SwitchRow, type MenuItem,
} from '../ui';
import CategoryStockView from '../inventory/CategoryStockView';
import {
  normalizeCategoryPackaging, normalizeScale, stockStatus, thresholdUnitLabel,
  formatStock, totalContent, fmtAmount, itemContentUnit,
  CONTENT_UNITS, type ScaleStep, type CategoryPackaging,
} from '@/lib/packaging';
import ConsumeControl from '../inventory/ConsumeControl';
import { vyznamCeny, jednotkaSnesDesetiny } from '@/lib/jednotky';
import { pocetDoPole } from '@/lib/inventura';
import {
  buildTree, flattenTree, scopeIds, pathOfId, childrenOfId, possibleParents,
  packagingSourceOf, ancestryOfId, findById, matcher, type TreeNode,
} from '@/lib/categoryTree';
import CategoryNav from '../inventory/CategoryNav';
import { type ItemDefaults, DEFAULT_FIELDS, mergeDefaults, hasDefaults } from '@/lib/itemDefaults';
import StocktakeModal from '../inventory/Stocktake';
import ItemRecipeLinks from '../inventory/ItemRecipeLinks';
import ProductionRecipe from '../inventory/ProductionRecipe';
import { useMoney, usePrice, useSymbol } from '../CurrencyProvider';
import { okJson } from '@/lib/api';
import { openPrint, esc } from '@/lib/printDoc';
import { obsahujeNekde } from '@/lib/hledani';
import { cenaDoPole, cenaZFormulare } from '@/lib/cena';
import { pocetZPole } from '@/lib/inventura';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { useOpravneni } from '../role/useOpravneni';
import {
  KLIC_NAKUP, KLIC_UPRAVIT, UDALOST_NAKUP, UDALOST_UPRAVIT, hodnotaZasob, navrhMnozstvi,
} from '@/lib/skladPrehled';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { useLocale } from './jazyk';

const URL_SKLAD = '/api/inventory';
const URL_FORMAT = '/api/inventory/format';
const URL_KATEGORIE = '/api/inventory/categories';



interface Item {
  id: number;
  name: string;
  category: string;
  categoryId?: number | null;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  maxQuantity: number;
  unit: string;
  supplier?: string;
  supplierUrl?: string;
  unitCost?: number | null;
  packageSize?: number | null;
  openAmount?: number | null;
  contentUnit?: string | null;
  brand?: string | null;
  description?: string | null;
  archived?: boolean;
  hideFromOverview?: boolean;
  highlight?: string | null;
  approved?: boolean;
  submittedBy?: number | null;
  updatedAt?: string;
  updatedByName?: string;
  madeInHouse?: boolean;
  batchYield?: number | null;
  productionLabel?: string | null;
  /** koupit kvůli výrobě těchhle vlastních produktů */
  buyFor?: { itemId: number; name: string; amount: number | null }[];
}

interface Category {
  id: number;
  name: string;
  position: number;
  parentId?: number | null;
  defaults?: ItemDefaults;
  tracksOpen?: boolean;
  thresholdUnit?: 'package' | 'content';
  contentUnit?: string | null;
  defaultPackageSize?: number | null;
  scale?: any;
  hideFromOverview?: boolean;
  /** Kategorie zdrojového podniku organizace (kolo 60) — jen ke čtení. */
  zOrganizace?: boolean;
  /** Naše kategorie, kterou vidí i ostatní podniky organizace. */
  sdileno?: boolean;
  /** Název podniku, který cizí kategorii spravuje. */
  spravuje?: string | null;
}

type SortKey = 'name' | 'qtyAsc' | 'qtyDesc' | 'status' | 'updated';
type View = 'list' | 'grid';

// Výchozí kategorie musí dávat smysl kavárně, restauraci i čajovně —
// proto obecné skupiny, ne konkrétní sortiment.
const inputClass = 'field';
/** Číslo z pole, které snese i desetinnou čárku. V poli type="number"
 *  se „0,7" zahodí na prázdno — a velikost balení pak tiše zmizí. */
const dec = (v: string | number) => Number(String(v).replace(',', '.')) || 0;

const emptyForm = { name: '', categoryId: null as number | null, quantity: '10', minQuantity: '5', criticalQuantity: '2', maxQuantity: '50', unit: 'ks', supplier: '', supplierUrl: '', unitCost: '', brand: '', description: '', packageSize: '', contentUnit: '', openAmount: '', portions: [] as { name: string; amount: string }[], archived: false, hideFromOverview: false, highlight: '' };

// Popisky řazení slovy — šipky ↑↓ a „A→Z" v textu nahrazovaly ikonu (DP §6.8).
const razeni = (t: PrekladFn): { key: SortKey; label: string }[] => [
  { key: 'name', label: t('Podle názvu') },
  { key: 'qtyAsc', label: t('Od nejmenšího množství') },
  { key: 'qtyDesc', label: t('Od největšího množství') },
  { key: 'status', label: t('Podle stavu') },
  { key: 'updated', label: t('Naposledy upraveno') },
];

// Packaged categories decide what the thresholds are counted in, so the status
// always comes from the same helper the stock view and the server alert use.
type PackagingLookup = (item: { category?: string; categoryId?: number | null }) => CategoryPackaging | null;

function statusOf(i: Item, pk?: PackagingLookup): 'ok' | 'low' | 'critical' {
  return stockStatus(i as any, pk ? pk(i) : null);
}
const statusRank = { critical: 0, low: 1, ok: 2 } as const;
const STAV_CHIP: Record<'ok' | 'low' | 'critical', 'ok' | 'wait' | 'bad'> = { ok: 'ok', low: 'wait', critical: 'bad' };

// Návrh množství k objednání je jeden pro nástroj i widget Nákupní seznam
// (lib/skladPrehled.ts navrhMnozstvi) — dřív si ho počítal každý sám.
const suggestedAmount = (i: Item): number => navrhMnozstvi(i);

function relTime(iso: string | undefined, t: PrekladFn, loc: string) {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (isNaN(d)) return '';
  const diff = Date.now() - d;
  const min = Math.round(diff / 60000);
  if (min < 1) return t('právě teď');
  if (min < 60) return t('před {n} min', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('před {n} h', { n: h });
  const days = Math.round(h / 24);
  if (days < 30) return t('před {n} d', { n: days });
  return new Date(iso).toLocaleDateString(loc, { day: 'numeric', month: 'numeric' });
}

/** Potvrzení nevratné akce — místo confirm() (DP §3.10, audit: 8× confirm v tomhle souboru). */
interface Potvrzeni { titulek: string; text: string; akce: string; provest: () => Promise<void> | void }

function OknoPotvrzeni({ p, onZavrit }: { p: Potvrzeni; onZavrit: () => void }) {
  const t = useT('sprava');
  const [pracuji, setPracuji] = useState(false);
  return (
    <Modal open onClose={onZavrit} size="sm" title={p.titulek}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>{t('Zrušit')}</Button>
        <Button variant="danger-solid" loading={pracuji} onClick={async () => {
          setPracuji(true);
          try { await p.provest(); } finally { setPracuji(false); onZavrit(); }
        }}>{p.akce}</Button>
      </>}>
      <p className="t-meta">{p.text}</p>
    </Modal>
  );
}

export default function Inventory({ initialCategory, onNavigate }: {
  user?: any; initialCategory?: string; onNavigate?: (view: string, arg?: string) => void;
}) {
  const loc = useLocale();
  const t = useT('sprava');
  const smi = useSmi();
  // Položky a kategorie přes sdílenou mezipaměť widgetů (viz hlavička souboru).
  const sklad = useDataWidgetu<Item[]>(URL_SKLAD, raw => (Array.isArray(raw) ? raw : []));
  const katData = useDataWidgetu<Category[]>(URL_KATEGORIE, raw => (Array.isArray(raw) ? raw : []));
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => { if (sklad.data) setItems(sklad.data); }, [sklad.data]);
  useEffect(() => { if (katData.data) setCategories(katData.data); }, [katData.data]);
  const loading = sklad.data == null && !sklad.error;
  // Which category is open, by id. Names may repeat across branches, ids never do.
  const [catId, setCatId] = useState<number | null>(null);
  // A label used by items whose category was deleted; browsed on its own.
  const [orphanCat, setOrphanCat] = useState<string | null>(null);
  // A quick-access tile still points at a category by name; resolve it once the
  // categories are loaded. An ambiguous name resolves to the first match.
  useEffect(() => {
    if (!initialCategory || categories.length === 0) return;
    const hit = categories.find(c => c.name === initialCategory);
    if (hit) { setCatId(hit.id); setOrphanCat(null); }
    else { setOrphanCat(initialCategory); setCatId(null); }
  }, [initialCategory, categories]);

  const current = findById(categories, catId) ?? null;
  const catLabel = orphanCat ?? (current ? current.name : '');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  // Výchozí je seznam v jedné kartě (DP §3.6); karty na položku jsou volitelný pohled.
  const [view, setView] = useState<View>('list');
  const [showForm, setShowForm] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm);
  // Množství a prahy jsou v databázi INTEGER, dokud se sloupce nepřevedou na NUMERIC;
  // desetiny (2,5 kg) se nabídnou jen tam, kde je sloupec unese, a jen u kg / l
  // (g, ml a kusy zůstávají celé).
  const sloupce = useDataWidgetu<{ mnozstvi: boolean; prahy: boolean }>(URL_FORMAT, raw => ({ mnozstvi: raw?.mnozstvi === true, prahy: raw?.prahy === true }));
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const money = useMoney();
  const symbol = useSymbol();
  const [newCatInline, setNewCatInline] = useState('');
  // Which parent a category created from inside the item form goes under.
  const [inlineParent, setInlineParent] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [showShopping, setShowShopping] = useState(false);
  // Jen dodavatel z widgetu Nákupní seznam (nastavení widgetu) — okno ukáže jeho skupinu.
  const [shoppingSupplier, setShoppingSupplier] = useState<string | null>(null);
  // Reports employees filed via "Nahlásit chybějící" on the tablet/phone.
  const [reports, setReports] = useState<any[]>([]);
  const [showReports, setShowReports] = useState(false);
  const [showStocktake, setShowStocktake] = useState(false);
  // Supplier entities — the address an order can actually be sent to.
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [showSuppliers, setShowSuppliers] = useState(false);
  // Movement history of the item being edited — who changed the stock and when.
  const [itemLog, setItemLog] = useState<any[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  // Items carried from an employee report straight into the shopping list.
  const [shoppingExtra, setShoppingExtra] = useState<Item[]>([]);
  // Parked items live behind a toggle so they can't clutter the active stock.
  const [showArchived, setShowArchived] = useState(false);
  // Bulk editing: a selection mode with a bar of actions for what is ticked.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulk, setShowBulk] = useState(false);
  const [potvrzeni, setPotvrzeni] = useState<Potvrzeni | null>(null);
  // Lišta nástroje má dvě podoby a ŽÁDNÁ z nich při posunu nemění výšku
  // v toku stránky. Plná (hledání, Seznam/Karty, mřížka kategorií) leží v toku
  // a nelepí se. Kompaktní (hledání + dvě ikony + pás kategorií) se ukáže
  // jako plovoucí vrstva nad obsahem, až plná odjede nad horní hranu
  // posuvné oblasti — v obalu výšky 0, takže nic neposune.
  //
  // Dřív jedna přilepená lišta při přilepení zmizela o ~300 px (mřížka →
  // pás): obsah pod prstem poskočil, hlídač se na hraně přepínal tam a zpět
  // a posun se „sekal a nechtěl pustit". A „nevidím značku" se bralo jako
  // „přilepeno", takže na počítači, kde nástroj začíná pod widgety mimo
  // obrazovku, se lišta sbalila hned bez posunu.
  //
  // Hlídač se zapíná, když plná lišta vznikne (callback ref) — na ploše
  // widgetů přijde nástroj až s rozložením (kolo 69). Kořen je posuvný
  // <main> layoutu, ne okno: jen tak jde poznat „odjela nahoru".
  const [plovouci, setPlovouci] = useState(false);
  const [plnaListaEl, setPlnaListaEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!plnaListaEl || typeof IntersectionObserver === 'undefined') return;
    const koren = plnaListaEl.closest('main');
    const io = new IntersectionObserver(([e]) => {
      const horni = e.rootBounds?.top ?? 0;
      // Plovoucí jen když lišta NENÍ vidět a je NAD horní hranou (ne pod
      // spodní — to je stav „ještě jsem k ní nedojel").
      setPlovouci(!e.isIntersecting && e.boundingClientRect.bottom <= horni + 1);
    }, { root: koren, threshold: 0 });
    io.observe(plnaListaEl);
    return () => { io.disconnect(); setPlovouci(false); };
  }, [plnaListaEl]);
  // Potvrzení akce jako Toast (DP §3.17) místo ručně limetkového boxu na stránce.
  const [notice, setNotice] = useState<{ text: string; ton?: 'bad' } | null>(null);
  const showNotice = (text: string, ton?: 'bad') => setNotice({ text, ton });

  // Oprávnění nástroje (katalog kola 67). Server hlídá každý zápis sám; tady
  // jde o to, aby se tlačítko, které skončí 403, vůbec nekreslilo. Tlačítka
  // berou `ma()` (záchyt „ukázat vše", dokud /api/teams/mine nedorazí nebo
  // když ho starší server neposílá — nástroj nesmí zmizet celý), dotazy na
  // data přísné `smi()` (useSmi: bez jistoty se neptat, jinak 403 v konzoli).
  const { ma } = useOpravneni();
  const smiPridat = ma('sklad.pridat');
  const smiUpravit = ma('sklad.upravit');
  const smiMazat = ma('sklad.mazat');
  const smiStav = ma(['sklad.zapsat_stav', 'sklad.upravit']);
  const smiKategorie = ma('sklad.kategorie');
  const smiCeny = smi('sklad.ceny');
  const smiInventura = ma('inventura.pocitat');
  const smiHlaseni = smi('sklad.hlaseni_vyridit');
  const smiReceptury = smi('receptury.zobrazit');
  const smiObjednat = ma('nakup.vytvorit');
  const smiDodavatele = ma('dodavatele.zobrazit');

  const nactiDodavatele = useCallback(() => {
    fetch('/api/suppliers').then(okJson)
      .then(d => setSuppliers(Array.isArray(d.suppliers) ? d.suppliers : []))
      .catch(() => {});
  }, []);
  const nactiHlaseni = useCallback(() => {
    if (!smiHlaseni) return;
    fetch('/api/inventory/reports').then(okJson)
      .then(d => setReports(Array.isArray(d.reports) ? d.reports : []))
      .catch(() => {});
  }, [smiHlaseni]);
  useEffect(() => { nactiDodavatele(); }, [nactiDodavatele]);
  useEffect(() => { nactiHlaseni(); }, [nactiHlaseni]);

  /** Znovu načíst sklad — nástroji i všem widgetům na ploše (sdílená mezipaměť). */
  const load = async () => {
    obnovDataWidgetu(URL_SKLAD);
    obnovDataWidgetu(URL_KATEGORIE);
  };

  // Category names available for the pick-list: custom categories, plus any
  // category strings already used by items (so nothing gets orphaned in the UI).
  const flatCats = useMemo(() => flattenTree(categories), [categories]);
  // Nová kategorie jde zanořit jen pod vlastní — kategorie z organizace
  // spravuje jiný podnik a server zanoření pod ně odmítne.
  const flatOwnCats = useMemo(() => flattenTree(categories.filter(c => !c.zOrganizace)), [categories]);
  // Category strings used by items but no longer configured — kept at the top
  // level so nothing becomes unreachable.
  const orphanNames = useMemo(() => {
    const knownIds = new Set(categories.map(c => c.id));
    const set = new Set<string>();
    items.forEach(i => {
      const orphan = i.categoryId != null
        ? !knownIds.has(i.categoryId)
        : !categories.some(c => c.name === i.category);
      if (i.category && orphan) set.add(i.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'cs'));
  }, [categories, items]);

  const subCats = useMemo(
    () => (catId == null ? [] : childrenOfId(categories, catId)),
    [categories, catId],
  );

  // Packaging settings by category name, inherited from the nearest ancestor
  // that has them. Everything that judges stock levels goes through this.
  const pk = useMemo<PackagingLookup>(() => {
    const byId = new Map<number, CategoryPackaging>();
    const byName = new Map<string, CategoryPackaging>();
    categories.forEach(c => {
      const source = packagingSourceOf(categories, c);
      if (!source) return;
      const settings = normalizeCategoryPackaging(source);
      byId.set(c.id, settings);
      if (!byName.has(c.name)) byName.set(c.name, settings);
    });
    // Items carry an id after the migration; the label is the fallback until then.
    return (i: { category?: string; categoryId?: number | null }) =>
      (i.categoryId != null ? byId.get(i.categoryId) : undefined)
      ?? (i.category ? byName.get(i.category) : undefined) ?? null;
  }, [categories]);

  // Parked items are out of the active stock entirely — they must not show up
  // in counts, alerts or the shopping list.
  const active = useMemo(() => items.filter(i => i.archived !== true && i.approved !== false), [items]);
  const archivedCount = items.filter(i => i.archived === true && i.approved !== false).length;

  // Counts on the navigation buttons include everything nested below.
  const countIn = useMemo(() => (id: number) => {
    const inCat = matcher(categories, id, null);
    return active.filter(inCat).length;
  }, [categories, active]);

  const alertsIn = useMemo(() => (id: number) => {
    const inCat = matcher(categories, id, null);
    return active.filter(i => inCat(i) && statusOf(i, pk) !== 'ok').length;
  }, [categories, active, pk]);

  // A category that tracks open packages renders its own two-mode view.
  // Subcategories inherit the setting from their parent, so packaging is
  // configured once on "Tabáky" and every subcategory under it behaves the same.
  const packagedCat = useMemo(
    () => (current ? packagingSourceOf(categories, current) : null),
    [categories, current],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Picking a parent category includes everything filed under its subcategories.
    const inCat = matcher(categories, catId, orphanCat);
    // On the "Vše" overview, items flagged "jen ve své kategorii" (or living in
    // a hidden category) stay out of sight — unless the person is searching.
    const hiddenCatIds = new Set(
      categories.filter(c => c.hideFromOverview).flatMap(c => Array.from(scopeIds(categories, c.id))),
    );
    const hiddenOnOverview = (i: Item) =>
      catId === null && q === '' &&
      (i.hideFromOverview === true || (i.categoryId != null && hiddenCatIds.has(i.categoryId)));
    const list = items.filter(i =>
      i.approved !== false &&
      (showArchived ? i.archived === true : i.archived !== true) &&
      inCat(i) &&
      !hiddenOnOverview(i) &&
      obsahujeNekde(q, i.name, i.brand, i.supplier));
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'qtyAsc': return a.quantity - b.quantity;
        case 'qtyDesc': return b.quantity - a.quantity;
        case 'status': {
          const d = statusRank[statusOf(a, pk)] - statusRank[statusOf(b, pk)];
          return d !== 0 ? d : a.name.localeCompare(b.name, 'cs');
        }
        case 'updated': {
          const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return tb - ta;
        }
        default: return a.name.localeCompare(b.name, 'cs');
      }
    });
    return sorted;
  }, [items, categories, catId, orphanCat, search, sort, pk, showArchived]);

  // Items to (re)order: critical first, then low, alphabetically within each group.
  // Vlastní výroba do nákupu nepatří — ta dostává úkol „vyrobit". Naopak
  // surovina, která chybí na dávku, jde do nákupu i když sama pod limitem není.
  const toBuy = useMemo(() =>
    active
      .filter(i => !i.madeInHouse && (statusOf(i, pk) !== 'ok' || (i.buyFor?.length ?? 0) > 0))
      .sort((a, b) => {
        const d = statusRank[statusOf(a, pk)] - statusRank[statusOf(b, pk)];
        return d !== 0 ? d : a.name.localeCompare(b.name, 'cs');
      }),
  [active, pk]);

  // N8: hodnota zásob jedním výpočtem se stejným vzorcem jako Finance
  // (bez archivovaných, s podílem načatého balení). Dřív tu bylo Σ množství ×
  // cena včetně archivovaných a bez načatých balení — jiné číslo za totéž.
  const hodnota = useMemo(() => (smiCeny ? hodnotaZasob(items).hodnota : 0), [items, smiCeny]);

  // Defaults for a category = everything its ancestors set, overridden by its
  // own, so a rule high up still holds while a subcategory can tweak one field.
  const defaultsFor = useMemo(() => (id: number | null): ItemDefaults =>
    mergeDefaults(ancestryOfId(categories, id).map(c => c.defaults)),
  [categories]);

  // Choosing a category while creating re-applies its prefill; while editing an
  // existing item it only re-files it, so nothing typed gets overwritten.
  const pickCategory = (id: number | null) => {
    if (editing) { setForm(f => ({ ...f, categoryId: id })); return; }
    setForm(f => ({ ...seedForm(id), name: f.name, quantity: f.quantity }));
  };

  const seedForm = (categoryId: number | null) => {
    const d = defaultsFor(categoryId);
    return {
      ...emptyForm,
      categoryId,
      brand: d.brand ?? '',
      description: d.description ?? '',
      unit: d.unit ?? emptyForm.unit,
      supplier: d.supplier ?? '',
      supplierUrl: d.supplierUrl ?? '',
      unitCost: cenaDoPole(d.unitCost),
      packageSize: d.packageSize != null ? String(d.packageSize) : '',
      minQuantity: d.minQuantity != null ? String(d.minQuantity) : emptyForm.minQuantity,
      criticalQuantity: d.criticalQuantity != null ? String(d.criticalQuantity) : emptyForm.criticalQuantity,
      maxQuantity: d.maxQuantity != null ? String(d.maxQuantity) : emptyForm.maxQuantity,
    };
  };

  const openNew = () => {
    setFormErr('');
    setEditing(null);
    setForm(seedForm(catId ?? categories[0]?.id ?? null));
    setNewCatInline('');
    setItemLog([]); setLogOpen(false);
    setShowForm(true);
  };
  // Kde se položka používá v kase — čte jen tabulku párování, takže se to dá
  // ukázat rovnou v editaci položky bez čekání na pokladnu. Jen s oprávněním
  // na receptury (jinak by dotaz skončil 403 v konzoli).
  const [posUsage, setPosUsage] = useState<Record<string, { productId: string; productName: string | null; amount: number }[]>>({});
  useEffect(() => {
    if (!smiReceptury) return;
    fetch('/api/pos/usage').then(okJson)
      .then(d => setPosUsage(d?.usage ?? {}))
      .catch(() => {});
  }, [smiReceptury]);

  const openEdit = (i: Item) => {
    setFormErr('');
    setEditing(i);
    setForm({ name: i.name, categoryId: i.categoryId ?? categories.find(c => c.name === i.category)?.id ?? null, quantity: pocetDoPole(i.quantity), minQuantity: pocetDoPole(i.minQuantity), criticalQuantity: pocetDoPole(i.criticalQuantity), maxQuantity: pocetDoPole(i.maxQuantity), unit: i.unit, supplier: i.supplier ?? '', supplierUrl: i.supplierUrl ?? '', unitCost: cenaDoPole(i.unitCost), brand: i.brand ?? '', description: i.description ?? '', packageSize: i.packageSize != null ? String(i.packageSize) : '', contentUnit: i.contentUnit ?? '', openAmount: i.openAmount != null ? String(i.openAmount) : '', portions: Array.isArray((i as any).portions) ? (i as any).portions.map((p: any) => ({ name: String(p.name ?? ''), amount: String(p.amount ?? '') })) : [], archived: i.archived === true, hideFromOverview: i.hideFromOverview === true, highlight: i.highlight ?? '' });
    setNewCatInline('');
    setItemLog([]); setLogOpen(false);
    if (smi('sklad.historie')) {
      fetch(`/api/inventory/log?itemId=${i.id}`).then(okJson)
        .then(d => setItemLog(Array.isArray(d.log) ? d.log : Array.isArray(d) ? d : []))
        .catch(() => {});
    }
    setShowForm(true);
  };

  // ---- Žádosti z widgetů (lib/skladPrehled.ts) ----
  // Nástroj je přijme synchronně (detail.prijato), z jiné stránky počkají
  // v sessionStorage, než se sem člověk přepne.
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [cekaUprava, setCekaUprava] = useState<number | null>(null);
  useEffect(() => {
    const nakup = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      d.prijato = true;
      setShoppingSupplier(typeof d.dodavatel === 'string' ? d.dodavatel : null);
      setShowShopping(true);
    };
    const uprav = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      d.prijato = true;
      if (Number.isFinite(Number(d.id))) setCekaUprava(Number(d.id));
    };
    window.addEventListener(UDALOST_NAKUP, nakup);
    window.addEventListener(UDALOST_UPRAVIT, uprav);
    try {
      const n = sessionStorage.getItem(KLIC_NAKUP);
      if (n != null) {
        sessionStorage.removeItem(KLIC_NAKUP);
        const d = JSON.parse(n || '{}');
        setShoppingSupplier(typeof d?.dodavatel === 'string' ? d.dodavatel : null);
        setShowShopping(true);
      }
      const u = sessionStorage.getItem(KLIC_UPRAVIT);
      if (u != null) {
        sessionStorage.removeItem(KLIC_UPRAVIT);
        const d = JSON.parse(u || '{}');
        if (Number.isFinite(Number(d?.id))) setCekaUprava(Number(d.id));
      }
    } catch { /* soukromé okno */ }
    return () => {
      window.removeEventListener(UDALOST_NAKUP, nakup);
      window.removeEventListener(UDALOST_UPRAVIT, uprav);
    };
  }, []);
  // Úprava položky čeká, až dorazí seznam (ze Skladu je hned, z Přehledu ne).
  useEffect(() => {
    if (cekaUprava == null || items.length === 0) return;
    const i = itemsRef.current.find(x => x.id === cekaUprava);
    setCekaUprava(null);
    if (i) openEditRef.current(i);
  }, [cekaUprava, items]);

  const createCategory = async (name: string, parentId?: number | null): Promise<boolean> => {
    const clean = name.trim();
    if (!clean) return false;
    try {
      const res = await fetch(URL_KATEGORIE, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean, parentId: parentId ?? null }),
      });
      if (!res.ok) return false;
      const cats = await fetch(URL_KATEGORIE).then(okJson);
      if (Array.isArray(cats)) { setCategories(cats); lastCats.current = cats; }
      obnovDataWidgetu(URL_KATEGORIE);
      return true;
    } catch { return false; }
  };
  // Fresh list from the last createCategory call — state updates land too late
  // for the caller that needs the new id right away.
  const lastCats = useRef<any[]>([]);

  // Inline "+ nová kategorie" inside the item form.
  const addInlineCategory = async () => {
    const clean = newCatInline.trim();
    if (!clean) return;
    setAddingCat(true);
    const parentId = inlineParent ? parseInt(inlineParent) : null;
    const ok = await createCategory(clean, parentId);
    setAddingCat(false);
    if (ok) {
      const created = lastCats.current.find((c: any) =>
        c.name === clean && (parentId == null ? c.parentId == null : Number(c.parentId) === parentId));
      if (created) setForm(f => ({ ...f, categoryId: created.id }));
      setNewCatInline('');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // Cena smí mít haléře (4,99 €); co cenou není, se nesmí tiše uložit jako
    // nula — dřív parseInt z „4,99" udělal 4 a z „abc" nulu.
    const cena = cenaZFormulare(form.unitCost);
    if (!cena.ok) { setFormErr(t('Cena musí být číslo, třeba 4,99.')); return; }
    // Množství a prahy: české číslo s čárkou i tečkou; kde se počítá na celé, desetina je chyba, ne tiché zaokrouhlení.
    const cisla = { quantity: 0, minQuantity: 0, criticalQuantity: 0, maxQuantity: 0 };
    for (const [klic, text, desetinne] of [
      ['quantity', form.quantity, desMnozstvi], ['minQuantity', form.minQuantity, desPrahy],
      ['criticalQuantity', form.criticalQuantity, desPrahy], ['maxQuantity', form.maxQuantity, desPrahy],
    ] as const) {
      const p = pocetZPole(text, desetinne);
      if (!p.ok) { setFormErr(p.duvod === 'cele' ? t('Tahle jednotka se eviduje v celých číslech — zapiš celé číslo.') : t('Množství a limity musí být čísla.')); return; }
      cisla[klic] = p.hodnota ?? 0;
    }
    setSaving(true);
    const payload = {
      name: form.name,
      category: findById(categories, form.categoryId)?.name ?? '',
      categoryId: form.categoryId,
      unit: form.unit, supplier: form.supplier, supplierUrl: form.supplierUrl,
      quantity: cisla.quantity, minQuantity: cisla.minQuantity,
      criticalQuantity: cisla.criticalQuantity, maxQuantity: cisla.maxQuantity,
      unitCost: cena.hodnota,
      brand: form.brand, description: form.description, archived: form.archived, hideFromOverview: form.hideFromOverview, highlight: form.highlight || null,
      packageSize: form.packageSize === '' ? null : dec(form.packageSize) || null,
      contentUnit: form.contentUnit || null,
      portions: (form.portions ?? [])
        .filter(p => p.name.trim() && Number(String(p.amount).replace(',', '.')) > 0)
        .map(p => ({ name: p.name.trim(), amount: Number(String(p.amount).replace(',', '.')) })),
      openAmount: form.openAmount === '' ? null : Math.max(0, dec(form.openAmount)),
    };
    // Bez práva měnit ceny server cenu zahodí (kolo 67) — neposílat ji vůbec,
    // ať úprava jiného pole nevypadá, že přepsala cenu na nic.
    if (!ma('sklad.ceny_upravit')) delete (payload as any).unitCost;
    setFormErr('');
    try {
      const res = editing
        ? await fetch(`/api/inventory/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch(URL_SKLAD, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setShowForm(false);
        showNotice(editing ? t('Položka uložena.') : t('Položka přidána.'));
        await load();
      } else {
        // Keep the form open with what was typed — closing it would look like
        // a successful save and quietly lose the work.
        const d = await res.json().catch(() => ({}));
        setFormErr(d.error || t('Položku se nepodařilo uložit.'));
      }
    } catch {
      setFormErr(t('Nepodařilo se spojit se serverem.'));
    }
    setSaving(false);
  };

  const step = async (i: Item, delta: number) => {
    const q = Math.max(0, i.quantity + delta);
    setItems(prev => prev.map(x => x.id === i.id ? { ...x, quantity: q } : x));
    try {
      const res = await fetch(`/api/inventory/${i.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: q }) });
      if (!res.ok) throw new Error();
    } catch {
      // Put the old number back — a stepper that lies is worse than one that fails.
      setItems(prev => prev.map(x => x.id === i.id ? { ...x, quantity: i.quantity } : x));
      showNotice(t('Množství se nepodařilo uložit.'), 'bad');
    }
  };

  // Parking and un-parking an item is one click — no dialog, no form.
  const setArchived = async (i: Item, archived: boolean) => {
    setItems(prev => prev.map(x => x.id === i.id ? { ...x, archived } : x));
    try {
      const res = await fetch(`/api/inventory/${i.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // I HTTP chyba (ne jen síť): vrať stav zpět, ať UI neukazuje odmítnutou změnu.
      setItems(prev => prev.map(x => x.id === i.id ? { ...x, archived: !archived } : x));
      showNotice(archived ? t('Zaparkování se nepodařilo.') : t('Odparkování se nepodařilo.'), 'bad');
    }
  };

  // A write-off returns the item's fresh state from the server (packages may
  // have been cracked open) — merge it in place instead of refetching the list.
  const onConsumed = (updated: any) =>
    setItems(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
  // Selhání odpisu se u vedení dřív spolklo (na rozdíl od kiosku a zaměstnance):
  // tlačítko se odemklo, číslo se nezměnilo a nikdo nevěděl, jestli je odepsáno.
  const onConsumeFail = () => showNotice(t('Odpis se nepodařilo uložit. Zkontroluj připojení a zkus to znovu.'), 'bad');

  const toggleSelected = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const exitSelection = () => { setSelecting(false); setSelected(new Set()); };

  const bulkPatch = async (patch: Record<string, any>) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return false;
    try {
      const res = await fetch('/api/inventory/bulk', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, patch }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showNotice(d.error || t('Hromadnou úpravu se nepodařilo uložit.'), 'bad');
        return false;
      }
      const d = await res.json().catch(() => ({}));
      await load();
      showNotice(`Upraveno: ${t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: d.count ?? ids.length })}.`);
      return true;
    } catch {
      showNotice(t('Nepodařilo se spojit se serverem.'), 'bad');
      return false;
    }
  };

  const bulkDelete = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setPotvrzeni({
      titulek: t('Smazat {n, plural, one {# položka} few {# položky} other {# položek}}?', { n: ids.length }),
      text: t('Položky zmizí ze skladu i z historie. Tohle nejde vrátit — jestli je jen teď nevedete, odlož je.'),
      akce: t('Smazat'),
      provest: async () => {
        try {
          const res = await fetch('/api/inventory/bulk', {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });
          if (res.ok) {
            setItems(prev => prev.filter(x => !ids.includes(x.id)));
            exitSelection();
            showNotice(t('Smazáno: {n, plural, one {# položka} few {# položky} other {# položek}}.', { n: ids.length }));
            await load();
          } else showNotice(t('Smazání se nepodařilo.'), 'bad');
        } catch { showNotice(t('Nepodařilo se spojit se serverem.'), 'bad'); }
      },
    });
  };

  const remove = (i: Item) => {
    setPotvrzeni({
      titulek: t('Smazat „{nazev}"?', { nazev: i.name }),
      text: t('Položka zmizí ze skladu i z historie. Jestli ji jen teď nevedete, odlož ji — jde vrátit jedním klepnutím.'),
      akce: t('Smazat položku'),
      provest: async () => {
        setItems(prev => prev.filter(x => x.id !== i.id));
        try {
          const res = await fetch(`/api/inventory/${i.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error();
          await load();
        } catch {
          setItems(prev => [...prev, i].sort((a, b) => a.name.localeCompare(b.name, 'cs')));
          showNotice(t('Položku se nepodařilo smazat.'), 'bad');
        }
      },
    });
  };

  // ---- Hlavička ----
  const noveHlaseni = reports.filter(r => r.status !== 'done').length;
  const menu: MenuItem[] = [
    ...(toBuy.length > 0 ? [{ label: t('Nakoupit ({n})', { n: toBuy.length }), icon: 'cart', onClick: () => { setShoppingSupplier(null); setShowShopping(true); },
      hint: t('Nákupní seznam z položek pod limitem.') }] : []),
    ...(smiUpravit || smiMazat ? [{ label: t('Vybrat víc položek'), icon: 'check', onClick: () => setSelecting(true) }] : []),
    ...(smiKategorie ? [{ label: t('Kategorie a balení'), icon: 'settings', onClick: () => setShowCats(true) }] : []),
    ...(smiDodavatele ? [{ label: t('Dodavatelé'), icon: 'users', onClick: () => setShowSuppliers(true) }] : []),
    ...(smiInventura ? [{ label: t('Inventura'), icon: 'clipboard', onClick: () => setShowStocktake(true),
      hint: t('Přepočítat sklad a zapsat rozdíly.') }] : []),
    ...(archivedCount > 0 || showArchived ? [{
      label: showArchived ? t('Zpět na aktivní sklad') : t('Momentálně nevedeme ({n})', { n: archivedCount }), icon: 'archive',
      onClick: () => setShowArchived(v => !v),
    }] : []),
    // Párování s kasou má vlastní obrazovku — dvě místa na jednu věc
    // byla hlavní důvod, proč to působilo krkolomně.
    ...(smiReceptury && onNavigate ? [{ label: t('Receptury a prodeje z kasy'), icon: 'card', onClick: () => onNavigate('recipes') }] : []),
    ...(smiHlaseni && reports.length > 0 ? [{
      label: noveHlaseni > 0 ? t('Hlášení od týmu ({n} nových)', { n: noveHlaseni }) : t('Hlášení od týmu'),
      icon: 'inbox', onClick: () => setShowReports(true),
    }] : []),
  ];

  const subtitle = <>
    {t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: active.length })}
    {hodnota > 0 ? <> · {t('hodnota zásob')} <span className="font-semibold text-[#16181A]">{money(hodnota)}</span></> : ` · ${t('přidávej položky a hlídej limity')}`}
  </>;

  // Obsah lišty ve dvou podobách (viz hlídač výš). Hledání sdílí stav,
  // takže rozepsaný dotaz je v obou stejný.
  const lista = (kompakt: boolean) => (
    <>
        {/* V klidu: hledání přes celou šířku, pod ním Seznam/Karty a řazení.
            Přilepená: jeden řádek — hledání a vedle dvě ikonová tlačítka
            (zobrazení, řazení), pod ním posuvný pás kategorií. Dřív měla
            přilepená lišta na telefonu tři řádky (157 px, pětina obrazovky)
            a pás kategorií byl na pravé hraně useknutý bez náznaku. */}
        <div className={`flex gap-2 ${kompakt ? 'items-center' : 'flex-col lg:flex-row gap-3 lg:items-center'}`}>
          <SearchField
            className="flex-1 min-w-0"
            value={search} onChange={setSearch}
            placeholder={kompakt ? t('Hledat ve skladu…') : t('Hledat položku nebo dodavatele…')}
            ariaLabel={t('Hledat ve skladu')}
            storageKey="inventory"
            suggestions={[
              ...categories.map(c => ({ label: c.name, hint: t('kategorie') })),
              ...Array.from(new Set(items.map(i => (i.supplier ?? '').trim()).filter(Boolean))).slice(0, 6).map(sp => ({ label: sp, hint: t('dodavatel') })),
            ]}
            inputClassName={kompakt ? '!py-2' : ''}
          />
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            {selecting && <Button variant="secondary" size={kompakt ? 'sm' : 'md'} onClick={exitSelection}>{t('Zrušit výběr')}</Button>}
            {kompakt ? (
              <Button variant="secondary" iconOnly icon={view === 'list' ? 'grid' : 'menu'}
                aria-label={view === 'list' ? t('Zobrazit jako karty') : t('Zobrazit jako seznam')}
                onClick={() => setView(view === 'list' ? 'grid' : 'list')} />
            ) : (
              <Segmented ariaLabel={t('Zobrazení')} size="sm" value={view} onChange={setView}
                options={[{ id: 'list', label: t('Seznam'), icon: 'menu' }, { id: 'grid', label: t('Karty'), icon: 'grid' }]} />
            )}
            <Menu label={t('Řadit: {druh}', { druh: razeni(t).find(s => s.key === sort)?.label ?? '' })} icon="swap"
              items={razeni(t).map(s => ({ label: s.label, icon: s.key === sort ? 'check' : undefined, onClick: () => setSort(s.key) }))} />
          </div>
        </div>
        <CategoryNav
          categories={categories}
          current={catId}
          onNavigate={id => { setCatId(id); setOrphanCat(null); }}
          countOf={countIn}
          alertOf={alertsIn}
          extraRoots={orphanNames}
          onNavigateOrphan={name => { setOrphanCat(name); setCatId(null); }}
          condensed={kompakt}
        />
    </>
  );

  const nastroj = (
    <div className="space-y-4">
      {/* Toolbar — v klidu leží na papíře; až se přilepí nahoru, stane se plovoucím chromem. */}
      {/* Kompaktní lišta: obal výšky 0 lepí k horní hraně, vrstva uvnitř
          plave nad obsahem a v toku nezabírá místo. */}
      <div className="sticky top-0 z-20 h-0">
        {plovouci && (
          <div className="absolute inset-x-0 top-0 -mx-4 px-4 sm:-mx-6 sm:px-6 py-2 space-y-2 glass-strong rounded-b-3xl shadow-[shadow:var(--shadow-float)] pop-in">
            {lista(true)}
          </div>
        )}
      </div>
      <div ref={setPlnaListaEl} className="py-1 space-y-3">
        {lista(false)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="t-meta">
          {t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: filtered.length })}
          {orphanCat ? ` v „${orphanCat}"` : catId != null ? ` v „${pathOfId(categories, catId)}"` : ''}
          {catId != null && subCats.length > 0 ? ` ${t('včetně podkategorií')}` : ''}
          {showArchived ? ` · ${t('momentálně nevedeme')}` : ''}
        </p>
        {showArchived && (
          <Button variant="secondary" size="sm" onClick={() => setShowArchived(false)}>{t('Zpět na aktivní sklad')}</Button>
        )}
      </div>

      {sklad.error && !sklad.data ? (
        <Card><ErrorState compact title={t('Sklad se nenačetl')} onRetry={sklad.reload} detail={sklad.error} /></Card>
      ) : loading ? (
        <Card aria-busy className="space-y-2">
          <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12 w-2/3" />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          {items.length === 0 ? (
            <EmptyState compact illustration="sklad" title={t('Sklad je zatím prázdný')}
              hint={t('Přidej první položku — pak tu uvidíš, co dochází, a nákupní seznam se sestaví sám.')}
              action={smiPridat ? <Button variant="secondary" icon="plus" onClick={openNew}>{t('Přidat položku')}</Button> : undefined} />
          ) : (
            <EmptyState compact icon="search" title={t('Nic neodpovídá filtru')}
              hint={search ? t('Zkus hledat jinak, nebo vyber jinou kategorii.') : t('V téhle kategorii zatím nic není.')} />
          )}
        </Card>
      ) : packagedCat ? (
        <CategoryStockView
          category={catLabel}
          packaging={normalizeCategoryPackaging(packagedCat)}
          items={filtered as any}
          canEdit={smiStav}
          onChanged={updated => setItems(list => list.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
          onEditItem={smiUpravit ? (i => openEdit(items.find(x => x.id === i.id) ?? (i as any))) : undefined}
          onRemoveItem={smiMazat ? (i => remove(items.find(x => x.id === i.id) ?? (i as any))) : undefined}
          onStep={smiStav ? ((i, d) => step(items.find(x => x.id === i.id) ?? (i as any), d)) : undefined}
        />
      ) : view === 'list' ? (
        <ListView items={filtered} step={smiStav ? step : undefined} openEdit={smiUpravit ? openEdit : undefined} remove={smiMazat ? remove : undefined} pk={pk}
          setArchived={smiUpravit || smiStav ? setArchived : undefined} selecting={selecting} selected={selected} onToggle={toggleSelected}
          onConsumed={onConsumed} onConsumeFail={onConsumeFail} />
      ) : (
        <GridView items={filtered} step={smiStav ? step : undefined} openEdit={smiUpravit ? openEdit : undefined} remove={smiMazat ? remove : undefined} money={money} pk={pk}
          setArchived={smiUpravit || smiStav ? setArchived : undefined} selecting={selecting} selected={selected} onToggle={toggleSelected}
          onConsumed={onConsumed} onConsumeFail={onConsumeFail} />
      )}
    </div>
  );

  const idFormulare = 'sklad-polozka-formular';
  const jednotkaPrahu = thresholdUnitLabel(pk(form), form.unit || 'ks');
  const cenaZaBaleni = vyznamCeny(form.packageSize || pk(form)?.defaultPackageSize) === 'baleni';
  const desMnozstvi = sloupce.data?.mnozstvi === true && jednotkaSnesDesetiny(form.unit);
  // Prahy se počítají v jednotce položky, nebo obsahu (gramy jsou celé) — to říká `jednotkaPrahu`.
  const desPrahy = sloupce.data?.prahy === true && jednotkaSnesDesetiny(jednotkaPrahu);
  // Krok ± u množství: o jedničku, v desetinném poli bez plovoucí chyby, s českou čárkou.
  const krokMnozstvi = (delta: number) => setForm(f => ({ ...f, quantity: pocetDoPole(Math.max(0, (dec(f.quantity)) + delta)) }));

  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.sklad"
        hlavicka={{
          title: t('Sklad'),
          subtitle,
          hintId: 'inventory',
          secondary: toBuy.length > 0
            ? <Button variant="secondary" icon="cart" onClick={() => { setShoppingSupplier(null); setShowShopping(true); }}>{t('Nakoupit ({n})', { n: toBuy.length })}</Button>
            : undefined,
          menu,
          primary: smiPridat ? <Button variant="accent" icon="plus" onClick={openNew}>{t('Přidat položku')}</Button> : undefined,
        }}
        nastroj={nastroj}
      />

      {notice && <Toast message={notice.text} tone={notice.ton} onClose={() => setNotice(null)} />}

      {/* Formulář položky — jedno okno z ui (dřív ruční překryv s blur hlavičkou,
          limetkovým čtvercem v titulku a limetkou v patičce). */}
      <Modal open={showForm} onClose={() => setShowForm(false)} size="lg"
        title={editing ? t('Upravit položku') : t('Nová položka')}
        subtitle={editing ? editing.name : t('Přidej novou zásobu do skladu.')}
        footer={<>
          <Button variant="secondary" onClick={() => setShowForm(false)}>{t('Zrušit')}</Button>
          <Button type="submit" form={idFormulare} variant="primary" icon="check" loading={saving}>{t('Uložit položku')}</Button>
        </>}>
        <form id={idFormulare} onSubmit={save} className="space-y-6">
          {/* Druhá strana provázání: co se z týhle položky na kase prodává.
              Bez toho člověk mění gramáž nebo cenu naslepo. */}
          {editing && smiReceptury && (
            <ItemRecipeLinks
              item={{ id: editing.id, name: editing.name }}
              links={posUsage[String(editing.id)] ?? []}
              unitLabel={editing.contentUnit ?? editing.unit}
              onChanged={next => setPosUsage(u => ({ ...u, [String(editing.id)]: next }))}
              onOpenRecipe={pid => { setShowForm(false); onNavigate?.('recipes', pid); }}
            />
          )}
          {/* Z čeho se položka dělá — když ji vyrábíme sami. */}
          {editing && (
            <ProductionRecipe
              item={{ id: editing.id, name: editing.name, unit: editing.unit }}
              items={items.filter(i => !i.archived)}
              onSaved={r => setItems(prev => prev.map(x => x.id === r.itemId
                ? { ...x, madeInHouse: r.madeInHouse, batchYield: r.batchYield, productionLabel: r.productionLabel || null } : x))}
            />
          )}

          {/* Skupiny oddělené rozestupem a štítkem (DP §4.D) — dřív šedý box
              na každou skupinu a v něm další box (karta v kartě). */}
          <section className="space-y-3" aria-labelledby="sklad-f-zaklad">
            <p id="sklad-f-zaklad" className="t-label">{t('Základní informace')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="sklad-f-nazev" label={t('Název')}>
                <input id="sklad-f-nazev" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('Např. Mléko plnotučné')} className={inputClass} />
              </Field>
              <Field id="sklad-f-znacka" label={t('Značka')}>
                <input id="sklad-f-znacka" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder={t('Např. Stanislaw')} className={inputClass} />
              </Field>
            </div>
            <Field id="sklad-f-popis" label={t('Krátký popis')} hint={t('Uvidí ho obsluha rovnou na kartě.')}>
              <textarea id="sklad-f-popis" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                placeholder={t('Např. medová, jemná, pro začátečníky')}
                className={`${inputClass} resize-none`} />
            </Field>
            <div>
              <p className="field-label" id="sklad-f-kat">{t('Kategorie')}</p>
              {(flatCats.length > 0 || orphanNames.length > 0) && (
                <div role="group" aria-labelledby="sklad-f-kat" className="space-y-1.5 mb-2.5 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                  {flatCats.map(({ cat: c, depth }) => (
                    <div key={c.id} style={{ paddingLeft: depth * 14 }}
                      className={depth > 0 ? 'border-l border-black/[0.08] ml-1' : ''}>
                      <CatChip name={c.zOrganizace ? `${c.name} · ${t('z organizace')}` : c.name} active={form.categoryId === c.id} small={depth > 0}
                        onPick={() => pickCategory(c.id)} />
                    </div>
                  ))}
                  {orphanNames.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {orphanNames.map(c => (
                        <CatChip key={c} name={c} active={false} onPick={async () => {
                          if (await createCategory(c)) {
                            const created = lastCats.current.find((x: any) => x.name === c);
                            if (created) pickCategory(created.id);
                          }
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {smiKategorie && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={newCatInline} onChange={e => setNewCatInline(e.target.value)} placeholder={t('Nová kategorie')}
                    aria-label={t('Nová kategorie')}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInlineCategory(); } }}
                    className={`${inputClass} flex-1 min-w-0`} />
                  <select value={inlineParent} onChange={e => setInlineParent(e.target.value)}
                    aria-label={t('Kam novou kategorii zařadit')}
                    className={`${inputClass} !w-full sm:!w-40 shrink-0`}>
                    <option value="">{t('Hlavní')}</option>
                    {flatOwnCats.map(({ cat: c, depth }) => (
                      <option key={c.id} value={String(c.id)}>{' '.repeat(depth * 2)}{t('pod {nazev}', { nazev: c.name })}</option>
                    ))}
                  </select>
                  <Button type="button" variant="secondary" icon="plus" onClick={addInlineCategory} loading={addingCat} disabled={!newCatInline.trim()}>{t('Přidat')}</Button>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="sklad-f-mnozstvi">
            <p id="sklad-f-mnozstvi" className="t-label">{t('Množství')}</p>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="sklad-f-q" className="field-label">{t('Aktuální množství')}</label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" size="sm" iconOnly icon="minus" aria-label={t('Ubrat')}
                    onClick={() => krokMnozstvi(-1)} />
                  <input id="sklad-f-q" inputMode={desMnozstvi ? 'decimal' : 'numeric'} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    className={`${inputClass} flex-1 min-w-0 text-center tabular-nums`} />
                  <Button type="button" variant="secondary" size="sm" iconOnly icon="plus" aria-label={t('Přidat')}
                    onClick={() => krokMnozstvi(1)} />
                </div>
              </div>
              <Field id="sklad-f-jednotka" label={t('Jednotka')}>
                <input id="sklad-f-jednotka" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="ks" className={inputClass} />
              </Field>
              <Field id="sklad-f-max" label={t('Max. množství')}>
                <input id="sklad-f-max" inputMode={desPrahy ? 'decimal' : 'numeric'} value={form.maxQuantity} onChange={e => setForm(f => ({ ...f, maxQuantity: e.target.value }))} className={inputClass} />
              </Field>
            </div>

            {/* Partial consumption: any item can say how big one package is
                and what's left in the open one — a bottle of wine doesn't
                leave whole when one glass is poured. */}
            <div className="well p-4 space-y-3">
              <p className="t-card">{t('Načaté balení')}</p>
              <p className="t-meta -mt-2">{t('Pro zboží, ze kterého se spotřebovává jen část (lahev vína, plechovka tabáku…).')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sklad-f-baleni" className="field-label">{t('Velikost balení')}</label>
                  <div className="flex gap-2">
                    <input id="sklad-f-baleni" inputMode="decimal" value={form.packageSize} onChange={e => setForm(f => ({ ...f, packageSize: e.target.value }))}
                      placeholder={String(pk(form)?.defaultPackageSize ?? '750')} className={`${inputClass} min-w-0`} />
                    <select aria-label={t('Jednotka obsahu')} value={form.contentUnit} onChange={e => setForm(f => ({ ...f, contentUnit: e.target.value }))}
                      className={`${inputClass} !w-20 shrink-0 px-2`}>
                      <option value="">{pk(form)?.contentUnit ?? '—'}</option>
                      {CONTENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="sklad-f-nacate" className="field-label">{t('V načatém zbývá')}</label>
                  <div className="relative">
                    <input id="sklad-f-nacate" inputMode="decimal" value={form.openAmount} onChange={e => setForm(f => ({ ...f, openAmount: e.target.value }))}
                      placeholder="0" className={`${inputClass} pr-12`} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/55">{form.contentUnit || pk(form)?.contentUnit || ''}</span>
                  </div>
                </div>
              </div>
              <p className="t-meta">
                
                {t('Aktuální množství pak počítá jen zavřená balení; odpisy (ruční i z pokladny) berou nejdřív z načatého.')}
                {pk(form) ? ` ${t('Prázdná velikost = výchozí z kategorie.')}` : ''}
              </p>

              {/* Dílčí díly: pojmenované porce, které pak receptury jen
                  vybírají — místo aby se 0,02 přepisovalo u každého drinku. */}
              <div className="pt-1 space-y-2">
                <p className="field-label">{t('Dílčí díly')} <span className="font-normal text-black/55">{t('— porce k výběru v recepturách')}</span></p>
                {(form.portions ?? []).map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input value={p.name} placeholder={t('panák')} aria-label={t('Název dílu {n}', { n: idx + 1 })}
                      onChange={e => setForm(f => ({ ...f, portions: f.portions.map((x, i) => i === idx ? { ...x, name: e.target.value } : x) }))}
                      className={`${inputClass} flex-1 min-w-0`} />
                    <input value={p.amount} placeholder="0,04" inputMode="decimal" aria-label={t('Množství dílu {n}', { n: idx + 1 })}
                      onChange={e => setForm(f => ({ ...f, portions: f.portions.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x) }))}
                      className={`${inputClass} !w-24 text-center`} />
                    <span className="text-xs text-black/55 w-8">{form.contentUnit || pk(form)?.contentUnit || form.unit}</span>
                    <Button type="button" variant="ghost" size="sm" iconOnly icon="trash" aria-label={t('Odebrat díl {nazev}', { nazev: p.name || idx + 1 })}
                      onClick={() => setForm(f => ({ ...f, portions: f.portions.filter((_, i) => i !== idx) }))} />
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" icon="plus"
                  onClick={() => setForm(f => ({ ...f, portions: [...(f.portions ?? []), { name: '', amount: '' }] }))}>
                  
                  {t('Přidat díl')}
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="sklad-f-hlidani">
            <p id="sklad-f-hlidani" className="t-label">{t('Hlídání zásob · v {jednotka}', { jednotka: jednotkaPrahu })}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sklad-f-min" className="field-label flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-wait" aria-hidden /> {t('Upozornit při')}</label>
                <div className="relative">
                  <input id="sklad-f-min" inputMode={desPrahy ? 'decimal' : 'numeric'} value={form.minQuantity} onChange={e => setForm(f => ({ ...f, minQuantity: e.target.value }))} className={`${inputClass} pr-14`} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/55">{jednotkaPrahu}</span>
                </div>
              </div>
              <div>
                <label htmlFor="sklad-f-krit" className="field-label flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-bad" aria-hidden /> {t('Kriticky málo při')}</label>
                <div className="relative">
                  <input id="sklad-f-krit" inputMode={desPrahy ? 'decimal' : 'numeric'} value={form.criticalQuantity} onChange={e => setForm(f => ({ ...f, criticalQuantity: e.target.value }))} className={`${inputClass} pr-14`} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/55">{jednotkaPrahu}</span>
                </div>
              </div>
            </div>
            {pk(form)?.thresholdUnit === 'content' && (
              <p className="note note-info text-[13px]">
                {t('Kategorie „{nazev}" hlídá zásoby podle obsahu, ne podle počtu balení — započítá se i zbytek v načatém balení.', { nazev: findById(categories, form.categoryId)?.name })}
              </p>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="sklad-f-dodavatel">
            <p id="sklad-f-dodavatel" className="t-label">{t('Dodavatel · volitelné')}</p>
            {/* Pole znamená cenu BALENÍ, když má položka velikost balení (vlastní nebo
                z kategorie), jinak cenu jednotky — popisek i přípona se řídí tím, co
                právě znamená, a při změně velikosti balení se přepnou (lib/recipeCost). */}
            {ma('sklad.ceny_upravit') && (
              <Field id="sklad-f-cena" label={cenaZaBaleni ? t('Cena za balení') : t('Cena za jednotku')} hint={t('Slouží k výpočtu hodnoty zásob a marže.')}>
                <div className="relative">
                  <input id="sklad-f-cena" inputMode="decimal" value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} placeholder="0" className={`${inputClass} pr-14`} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/55">{cenaZaBaleni ? symbol : `${symbol}/${form.unit || 'ks'}`}</span>
                </div>
              </Field>
            )}
            <Field id="sklad-f-dod" label={t('Název dodavatele')}>
              <input id="sklad-f-dod" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder={t('Např. Velkoobchod s.r.o.')} className={inputClass} list="managero-suppliers" />
            </Field>
            <Field id="sklad-f-url" label={t('Odkaz na objednání')}>
              <input id="sklad-f-url" type="url" inputMode="url" value={form.supplierUrl} onChange={e => setForm(f => ({ ...f, supplierUrl: e.target.value }))} placeholder="https://..." className={inputClass} />
            </Field>
          </section>

          <section className="space-y-3" aria-labelledby="sklad-f-zobrazeni">
            <p id="sklad-f-zobrazeni" className="t-label">{t('Zobrazení')}</p>
            <ul className="list">
              <SwitchRow title={t('Momentálně nevedeme')}
                hint={t('Zůstane v katalogu, ale zmizí z aktivního skladu i z hlídání zásob. Až přijde, jedním klepnutím ji vrátíš.')}
                checked={form.archived} onChange={v => setForm(f => ({ ...f, archived: v }))} />
              <SwitchRow title={t('Jen ve své kategorii')}
                hint={t('V přehledu „Vše“ se nezobrazí — uvidíš ji až po otevření kategorie. Hlídání zásob funguje dál.')}
                checked={form.hideFromOverview} onChange={v => setForm(f => ({ ...f, hideFromOverview: v }))} />
              <li className="py-3">
                <p className="text-sm font-medium text-[#16181A]" id="sklad-f-zvyraznit">{t('Zvýraznit zákazníkům')}</p>
                <p className="t-meta mt-0.5 mb-2">{t('Na sdílené stránce dostane odznak a řadí se nahoru.')}</p>
                <Segmented ariaLabel={t('Zvýraznit zákazníkům')} size="sm" value={(form.highlight || 'nic') as 'nic' | 'new' | 'tip'}
                  onChange={v => setForm(f => ({ ...f, highlight: v === 'nic' ? '' : v }))}
                  options={[{ id: 'nic', label: t('Nic') }, { id: 'new', label: t('Novinka') }, { id: 'tip', label: t('Tip') }]} />
              </li>
            </ul>
          </section>

          {editing && itemLog.length > 0 && (
            <section className="space-y-2">
              <Button type="button" variant="ghost" size="sm" iconAfter="chevron" aria-expanded={logOpen}
                className={logOpen ? '[&_svg]:rotate-180' : ''} onClick={() => setLogOpen(o => !o)}>
                {t('Historie změn ({n})', { n: itemLog.length })}
              </Button>
              {logOpen && (
                <ul className="list max-h-56 overflow-y-auto scrollbar-thin">
                  {itemLog.map((l: any) => {
                    const delta = Number(l.newQuantity) - Number(l.oldQuantity);
                    // Odpis podle receptury často ubere jen z načatého balení —
                    // kusy se nezmění a bez tohohle by řádek hlásil „0".
                    const openDelta = l.oldOpen != null && l.newOpen != null
                      ? Math.round((Number(l.newOpen) - Number(l.oldOpen)) * 1000) / 1000 : 0;
                    const label = delta !== 0
                      ? (delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`)
                      : openDelta !== 0
                        ? `${openDelta > 0 ? '+' : '−'}${Math.abs(openDelta).toLocaleString(loc, { maximumFractionDigits: 3 })}${l.contentUnit ? ' ' + l.contentUnit : ''}`
                        : '0';
                    const tone = delta || openDelta;
                    return (
                      <ListRow key={l.id}
                        title={`${l.userName ?? t('Někdo')}${l.note ? ` · ${l.note}` : ''}`}
                        meta={new Date(l.createdAt).toLocaleDateString(loc, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        value={<span className={tone > 0 ? 'text-ok-ink' : tone < 0 ? 'text-bad-ink' : 'text-black/55'}>{label}</span>} />
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          {formErr && <p className="note note-danger" role="alert">{formErr}</p>}
        </form>
      </Modal>

      {/* Lišta, ze které tenhle vzor vzešel — teď už sdílená komponenta,
          takže vypadá stejně tady i ve frontách ke schválení. */}
      {selecting && (
        <BulkBar
          count={selected.size}
          totalLabel={t('Vybrat vše ({n})', { n: filtered.length })}
          onSelectAll={() => setSelected(new Set(filtered.map(i => i.id)))}
          onExit={exitSelection}
          actions={[
            ...(smiUpravit ? [{ label: t('Upravit'), primary: true, onClick: () => setShowBulk(true) }] : []),
            ...(smiUpravit ? [{ label: showArchived ? t('Naskladnit') : t('Odložit', {}, 'sklad'),
              onClick: async () => { if (await bulkPatch({ archived: !showArchived })) exitSelection(); } }] : []),
            ...(smiMazat ? [{ label: t('Smazat'), danger: true, onClick: bulkDelete }] : []),
          ]}
        />
      )}

      {showBulk && (
        <BulkEditModal
          count={selected.size}
          categories={categories}
          symbol={symbol}
          smiCenu={ma('sklad.ceny_upravit')}
          onClose={() => setShowBulk(false)}
          onApply={async patch => {
            const ok = await bulkPatch(patch);
            if (ok) { setShowBulk(false); exitSelection(); }
            return ok;
          }}
        />
      )}

      {showCats && (
        <CategoryManager
          categories={categories}
          onClose={() => setShowCats(false)}
          onChanged={load}
          createCategory={createCategory}
          potvrdit={setPotvrzeni}
        />
      )}

      <datalist id="managero-suppliers">
        {suppliers.map(sp => <option key={sp.id} value={sp.name} />)}
      </datalist>

      {showSuppliers && (
        <SuppliersModal suppliers={suppliers} smiUpravit={ma('dodavatele.upravit')} onClose={() => setShowSuppliers(false)}
          onChanged={nactiDodavatele} potvrdit={setPotvrzeni} />
      )}

      {showStocktake && (
        <StocktakeModal smiZahajit={ma('inventura.spravovat')} smiDokoncit={ma('inventura.dokoncit')} smiZtraty={ma('finance.ztraty')} onClose={() => { setShowStocktake(false); obnovDataWidgetu('/api/stocktake'); }} onApplied={load} />
      )}

      <Modal open={showReports} onClose={() => setShowReports(false)} size="md" title={t('Hlášení ze skladu')}
        subtitle={t('Co tým nahlásil jako docházející nebo chybějící.')}>
        {reports.length === 0 ? (
          <p className="t-meta">{t('Žádná hlášení od týmu.')}</p>
        ) : (
          <ul className="list">
            {reports.map(r => {
              let list: any[] = [];
              try { list = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items ?? []); } catch { list = []; }
              const done = r.status === 'done';
              const nazvy = list.map((it: any) =>
                typeof it === 'string' ? it
                  : typeof it === 'number' ? (items.find(x => x.id === it)?.name ?? t('Položka #{id}', { id: it }))
                    : `${it.name ?? it.title ?? '?'}${it.quantity ? ` — ${it.quantity}` : ''}${it.note ? ` (${it.note})` : ''}`);
              return (
                <li key={r.id}>
                  <ListRow as="div"
                    lead={<Avatar emoji={r.author_avatar} size="sm" />}
                    title={nazvy.length > 0 ? nazvy.join(', ') : t('Bez položek')}
                    meta={[r.author_name ?? t('Zaměstnanec'),
                      new Date(r.created_at).toLocaleDateString(loc, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }),
                      r.note ? `„${r.note}"` : null].filter(Boolean).join(' · ')}
                    right={!done ? <Chip tone="wait" size="sm">{t('nové')}</Chip> : undefined}
                    actions={<>
                      <Button variant="secondary" size="sm" icon="cart" onClick={() => {
                        const wanted: Item[] = [];
                        list.forEach((it: any) => {
                          const id = typeof it === 'number' ? it : it?.id;
                          const found = items.find(x => x.id === id)
                            ?? items.find(x => x.name === (typeof it === 'string' ? it : it?.name));
                          if (found && !wanted.some(w => w.id === found.id)) wanted.push(found);
                        });
                        setShoppingExtra(wanted);
                        setShowReports(false);
                        setShoppingSupplier(null);
                        setShowShopping(true);
                      }}>{t('Do nákupu')}</Button>
                      <Button variant={done ? 'ghost' : 'primary'} size="sm" onClick={async () => {
                        const res = await fetch('/api/inventory/reports', {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: r.id, status: done ? 'new' : 'done' }),
                        }).catch(() => null);
                        if (res?.ok) {
                          setReports(prev => prev.map(x => x.id === r.id ? { ...x, status: done ? 'new' : 'done' } : x));
                          obnovDataWidgetu('/api/inventory/reports');
                        } else showNotice(t('Uložení se nepodařilo.'), 'bad');
                      }}>{done ? t('Znovu otevřít') : t('Vyřízeno')}</Button>
                    </>}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      {showShopping && (
        <ShoppingListModal
          suppliers={suppliers}
          items={[...toBuy, ...shoppingExtra.filter(e => !toBuy.some(t => t.id === e.id))]
            .filter(i => !shoppingSupplier || (i.supplier ?? '').trim() === shoppingSupplier)}
          pk={pk}
          smiObjednat={smiObjednat}
          smiOdeslat={ma('nakup.odeslat')}
          onClose={() => { setShowShopping(false); setShoppingExtra([]); setShoppingSupplier(null); }}
          onOrdered={(count, zadano) => {
            setShowShopping(false);
            setShoppingExtra([]);
            setShoppingSupplier(null);
            if (count > 0) {
              showNotice(count === zadano ? t('Vytvořeno: {n, plural, one {# objednávka} few {# objednávky} other {# objednávek}}.', { n: count }) : t('Vytvořeno {n} z {celkem, plural, one {# objednávka} few {# objednávky} other {# objednávek}} — zbytek zkus znovu.', { n: count, celkem: zadano }), count === zadano ? undefined : 'bad');
              obnovDataWidgetu('/api/orders');
            } else {
              showNotice(t('Objednávku se nepodařilo vytvořit.'), 'bad');
            }
          }}
        />
      )}
      {/* Potvrzení až na konci: otevírá se i nad oknem kategorií a dodavatelů. */}
      {potvrzeni && <OknoPotvrzeni p={potvrzeni} onZavrit={() => setPotvrzeni(null)} />}
    </>
  );
}

/* ---------- Bulk edit ---------- */
// Only the ticked fields are sent, so a bulk edit changes exactly what was asked
// for and leaves everything else on each item alone.
const bulkFields = (t: PrekladFn): { key: string; label: string; kind: 'text' | 'number' | 'url' | 'multiline' | 'category' }[] => [
  { key: 'categoryId', label: t('Kategorie'), kind: 'category' },
  { key: 'brand', label: t('Značka'), kind: 'text' },
  { key: 'description', label: t('Popis'), kind: 'multiline' },
  { key: 'unit', label: t('Jednotka'), kind: 'text' },
  { key: 'packageSize', label: t('Velikost balení'), kind: 'number' },
  { key: 'minQuantity', label: t('Upozornit při'), kind: 'number' },
  { key: 'criticalQuantity', label: t('Kriticky málo při'), kind: 'number' },
  { key: 'maxQuantity', label: t('Max. množství'), kind: 'number' },
  // Hromadně se mění položky s balením i bez: pole je u nich cena balení, jinak jednotky.
  { key: 'unitCost', label: t('Cena (za balení, jinak za jednotku)'), kind: 'number' },
  { key: 'supplier', label: t('Dodavatel'), kind: 'text' },
  { key: 'supplierUrl', label: t('Odkaz na objednání'), kind: 'url' },
];

function BulkEditModal({ count, categories, symbol, smiCenu, onClose, onApply }: {
  count: number;
  categories: Category[];
  symbol: string;
  smiCenu: boolean;
  onClose: () => void;
  onApply: (patch: Record<string, any>) => Promise<boolean>;
}) {
  const t = useT('sprava');
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const flat = useMemo(() => flattenTree(categories), [categories]);
  const pole = bulkFields(t).filter(f => f.key !== 'unitCost' || smiCenu);
  const chosen = pole.filter(f => on[f.key]);

  const [chyba, setChyba] = useState<string | null>(null);

  const apply = async () => {
    const patch: Record<string, any> = {};
    const spatne: string[] = [];
    chosen.forEach(f => {
      const raw = values[f.key] ?? '';
      if (f.kind === 'category') { if (raw) patch.categoryId = Number(raw); return; }
      // Textové pole s čárkou („0,7", „4,99"): Number('4,99') je NaN. Cenu server
      // parsuje sám (lib/cena), tak jde dál jako text.
      if (f.key === 'unitCost') { if (raw.trim() !== '') patch[f.key] = raw; return; }
      if (f.kind === 'number') {
        // Nečíslo („abc", „5 ks") se neposílá: NaN by v JSONu skončilo jako null
        // a dřív z něj server udělal nulu pro všechny vybrané položky.
        if (raw.trim() === '') return;
        const p = pocetZPole(raw, true);
        if (!p.ok || p.hodnota == null) { spatne.push(f.label); return; }
        patch[f.key] = p.hodnota;
        return;
      }
      patch[f.key] = raw;   // empty string clears the field on purpose
    });
    if (spatne.length) {
      setChyba(t('{pole}: napiš číslo, třeba 12 nebo 0,5.', { pole: spatne.join(', ') }));
      return;
    }
    setChyba(null);
    setBusy(true);
    await onApply(patch);
    setBusy(false);
  };

  return (
    <Modal open onClose={onClose} size="md" title={t('Hromadná úprava')}
      subtitle={t('Změní se {n, plural, one {# položka} few {# položky} other {# položek}} — jen zaškrtnutá pole.', { n: count })}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button variant="primary" loading={busy} disabled={chosen.length === 0} onClick={apply}>
          {t('Použít na {n, plural, one {# položka} few {# položky} other {# položek}}', { n: count })}
        </Button>
      </>}>
      {chyba && <p className="note note-danger mb-3" role="alert">{chyba}</p>}
      <ul className="list">
        {pole.map(f => {
          const id = `sklad-hromadne-${f.key}`;
          return (
            <li key={f.key} className="py-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={!!on[f.key]}
                  onChange={e => setOn(v => ({ ...v, [f.key]: e.target.checked }))}
                  className="h-4 w-4 accent-[#16181A]" />
                <span className="text-sm font-medium text-[#16181A]">{f.label}</span>
              </label>
              {on[f.key] && (
                <div className="mt-2.5">
                  {f.kind === 'category' ? (
                    <select id={id} aria-label={f.label} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                      className={inputClass}>
                      <option value="">{t('— vyber kategorii —')}</option>
                      {flat.map(({ cat: c, depth }) => (
                        <option key={c.id} value={String(c.id)}>{' '.repeat(depth * 2)}{c.name}{c.zOrganizace ? ` · ${t('z organizace')}` : ''}</option>
                      ))}
                    </select>
                  ) : f.kind === 'multiline' ? (
                    <textarea id={id} aria-label={f.label} rows={2} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={t('Prázdné pole popis smaže')}
                      className={`${inputClass} resize-none`} />
                  ) : (
                    <div className="relative">
                      <input id={id} aria-label={f.label} type={f.kind === 'url' ? 'url' : 'text'}
                        inputMode={f.kind === 'number' ? 'decimal' : undefined}
                        value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                        placeholder={f.kind === 'text' || f.kind === 'url' ? t('Prázdné pole hodnotu smaže') : ''}
                        className={`${inputClass} ${f.key === 'unitCost' ? 'pr-12' : ''}`} />
                      {f.key === 'unitCost' && (
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/55">{symbol}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/* ---------- One category chip in the item form ---------- */
// Vybraná kategorie je inkoustová pilulka (DP §3.8) — dřív limetková, jako by šlo o akci.
function CatChip({ name, active, small, onPick }: {
  name: string; active: boolean; small?: boolean; onPick: () => void;
}) {
  return (
    <button type="button" onClick={onPick} aria-pressed={active}
      className={`filter-pill tap-target-sm inline-flex items-center gap-1.5 ${small ? '!text-[12px]' : ''} ${active ? 'seg-on' : 'seg-off glass'}`}>
      {active && <Icon name="check" size={small ? 12 : 13} />}{name}
    </button>
  );
}

/** Akce řádku položky: nejvýš dvě tlačítka, zbytek v „···" (DP §3.6). */
function akcePolozky(t: PrekladFn, i: Item, h: { openEdit?: (i: Item) => void; remove?: (i: Item) => void; setArchived?: (i: Item, a: boolean) => void; objednat?: boolean }): MenuItem[] {
  return [
    // Seznam nemá pro odkaz na dodavatele místo v řádku (akce nejvýš dvě),
    // tak jde do „···" — dřív ho měl řádek i karta a kdo přes něj objednával,
    // v seznamu ho po kole 69 nenašel. Karty mají vlastní tlačítko „Objednat".
    ...(h.objednat && i.supplierUrl ? [{ label: t('Objednat u dodavatele'), icon: 'external', onClick: () => { window.open(i.supplierUrl, '_blank', 'noopener'); } }] : []),
    ...(h.openEdit ? [{ label: t('Upravit položku'), icon: 'pencil', onClick: () => h.openEdit!(i) }] : []),
    ...(h.setArchived ? [{ label: i.archived ? t('Vrátit do skladu') : t('Momentálně nevedeme'), icon: 'archive', onClick: () => h.setArchived!(i, !i.archived) }] : []),
    ...(h.remove ? [{ label: t('Smazat položku…'), icon: 'trash', danger: true, onClick: () => h.remove!(i) }] : []),
  ];
}

/** Krokovač ± (ikonová tlačítka s popiskem — dřív holé znaky − a + bez aria-label). */
function Krokovac({ i, step }: { i: Item; step: (i: Item, d: number) => void }) {
  const t = useT('sprava');
  return (
    <span className="flex items-center gap-1">
      <Button variant="secondary" size="sm" iconOnly icon="minus" aria-label={t('Ubrat — {nazev}', { nazev: i.name })} onClick={() => step(i, -1)} />
      <Button variant="secondary" size="sm" iconOnly icon="plus" aria-label={t('Přidat — {nazev}', { nazev: i.name })} onClick={() => step(i, 1)} />
    </span>
  );
}

const stavPopisek = (t: PrekladFn, st: 'ok' | 'low' | 'critical', vyroba?: boolean) =>
  st === 'critical' ? (vyroba ? t('Vyrobit') : t('Kriticky')) : st === 'low' ? (vyroba ? t('Vyrobit') : t('Dochází')) : t('OK');

/* ---------- List view: jedna karta s linkami (DP §3.6) ---------- */
function ListView({ items, step, openEdit, remove, pk, setArchived, selecting, selected, onToggle, onConsumed, onConsumeFail }: {
  items: Item[]; step?: (i: Item, d: number) => void; openEdit?: (i: Item) => void; remove?: (i: Item) => void;
  pk: PackagingLookup; setArchived?: (i: Item, archived: boolean) => void;
  selecting: boolean; selected: Set<number>; onToggle: (id: number) => void;
  onConsumed: (updated: any) => void; onConsumeFail: () => void;
}) {
  const t = useT('sprava');
  const loc = useLocale();
  return (
    <Card pad="none" className="px-5">
      <ul className="list">
        {items.map(i => {
          const st = statusOf(i, pk);
          const cu = itemContentUnit(i, pk(i));
          const mnozstvi = Number(i.packageSize) > 0 ? formatStock(i, cu, i.unit) : `${i.quantity} ${i.unit}`;
          // Popis (jak se položka používá, co s ní) patří do meta jako na
          // Skladu zaměstnance — seznam je výchozí pohled, karty ho mají zvlášť.
          const meta = [i.brand, i.description || null, i.category || null, i.supplier || null, i.updatedAt ? `${relTime(i.updatedAt, t, loc)}${i.updatedByName ? ` · ${i.updatedByName}` : ''}` : null]
            .filter(Boolean).join(' · ');
          const menu = akcePolozky(t, i, { openEdit, remove, setArchived, objednat: true });
          return (
            <li key={i.id}>
              <ListRow as="div"
                lead={selecting
                  ? <SelectBox checked={selected.has(i.id)} onChange={() => onToggle(i.id)} label={t('Vybrat {nazev}', { nazev: i.name })} />
                  : <span className={`w-2 h-2 rounded-full shrink-0 ${st === 'critical' ? 'bg-bad' : st === 'low' ? 'bg-wait' : 'bg-ok'}`} aria-hidden />}
                title={i.name}
                meta={meta || undefined}
                value={<span className="tabular-nums">{mnozstvi}</span>}
                right={st !== 'ok' ? <Chip tone={STAV_CHIP[st]} size="sm">{stavPopisek(t, st, i.madeInHouse)}</Chip> : undefined}
                onClick={selecting ? () => onToggle(i.id) : undefined}
                actions={selecting ? undefined : <>
                  {Number(i.packageSize) > 0 && step && (
                    <ConsumeControl itemId={i.id} unit={cu} onDone={onConsumed} onFail={onConsumeFail} />
                  )}
                  {i.archived && setArchived
                    ? <Button variant="primary" size="sm" onClick={() => setArchived(i, false)}>{t('Naskladnit')}</Button>
                    : step ? <Krokovac i={i} step={step} /> : null}
                  {menu.length > 0 && <Menu size="sm" label={t('Další akce: {nazev}', { nazev: i.name })} items={menu} />}
                </>}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- Grid view (karta na položku — volitelný pohled) ---------- */
function GridView({ items, step, openEdit, remove, money, pk, setArchived, selecting, selected, onToggle, onConsumed, onConsumeFail }: {
  items: Item[]; step?: (i: Item, d: number) => void; openEdit?: (i: Item) => void; remove?: (i: Item) => void;
  money: (n: number) => string; pk: PackagingLookup; setArchived?: (i: Item, archived: boolean) => void;
  selecting: boolean; selected: Set<number>; onToggle: (id: number) => void;
  onConsumed: (updated: any) => void; onConsumeFail: () => void;
}) {
  const t = useT('sprava');
  const loc = useLocale();
  // Nákupní cena balení smí mít haléře (4,99 €) — money() ji ukáže jako 5 €.
  const cena = usePrice();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map(i => {
        const st = statusOf(i, pk);
        const pct = Math.min(100, Math.round((i.quantity / Math.max(1, i.maxQuantity)) * 100));
        const barColor = st === 'critical' ? 'bg-bad' : st === 'low' ? 'bg-wait' : 'bg-ok';
        const menu = akcePolozky(t, i, { openEdit, remove, setArchived });
        return (
          <Card key={i.id} className={`flex flex-col h-full ${selecting && selected.has(i.id) ? 'ring-2 ring-[#16181A]' : ''}`}>
            <div className="flex items-start justify-between gap-x-2 gap-y-1">
              {selecting && <SelectBox checked={selected.has(i.id)} onChange={() => onToggle(i.id)} label={t('Vybrat {nazev}', { nazev: i.name })} />}
              <div className="min-w-0 flex-1">
                <h3 className="t-card line-clamp-2">
                  {i.name}
                  {i.brand && <span className="ml-1.5 font-normal text-black/55">{i.brand}</span>}
                </h3>
                {i.description && <p className="t-meta line-clamp-2 mt-0.5">{i.description}</p>}
                <p className="t-meta line-clamp-2 mt-0.5">{i.category}{i.supplier ? ` · ${i.supplier}` : ''}</p>
              </div>
              <span className="flex items-center gap-1 shrink-0">
                {i.madeInHouse && <Chip tone="info" size="sm">{t('vyrábíme')}</Chip>}
                <Chip tone={STAV_CHIP[st]} size="sm">{stavPopisek(t, st, i.madeInHouse)}</Chip>
              </span>
            </div>
            <div className="mt-3 h-1.5 bg-black/[0.06] rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-[width,background-color]`} style={{ width: `${pct}%` }} />
            </div>
            {Number(i.packageSize) > 0 && (() => {
              const cu = itemContentUnit(i, pk(i));
              return (
                <div className={`mt-2.5 flex flex-wrap items-center justify-between gap-2 ${selecting ? 'hidden' : ''}`}>
                  <span className="t-meta tabular-nums min-w-0">
                    {formatStock(i, cu, i.unit)}
                    {cu ? <> · {t('celkem {mnozstvi} {jednotka}', { mnozstvi: fmtAmount(totalContent(i)), jednotka: cu })}</> : null}
                  </span>
                  {step && <ConsumeControl itemId={i.id} unit={cu} onDone={onConsumed} onFail={onConsumeFail} />}
                </div>
              );
            })()}
            <div className={`mt-auto pt-3 flex items-center justify-between gap-2 ${selecting ? 'hidden' : ''}`}>
              <div className="flex items-center gap-2">
                {step && <Button variant="secondary" size="sm" iconOnly icon="minus" aria-label={t('Ubrat — {nazev}', { nazev: i.name })} onClick={() => step(i, -1)} />}
                <span className="text-[18px] font-semibold text-[#16181A] min-w-[4rem] text-center tabular-nums">{i.quantity} <span className="text-xs font-normal text-black/55">{i.unit}</span></span>
                {step && <Button variant="secondary" size="sm" iconOnly icon="plus" aria-label={t('Přidat — {nazev}', { nazev: i.name })} onClick={() => step(i, 1)} />}
              </div>
              <div className="flex items-center gap-1">
                {i.archived && setArchived ? (
                  <Button variant="primary" size="sm" onClick={() => setArchived(i, false)}>{t('Naskladnit')}</Button>
                ) : i.supplierUrl ? (
                  <a href={i.supplierUrl} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
                    <Icon name="external" size={15} />  {t('Objednat')}
                  </a>
                ) : null}
                {menu.length > 0 && <Menu size="sm" label={t('Další akce: {nazev}', { nazev: i.name })} items={menu} />}
              </div>
            </div>
            <p className="t-meta mt-2">{t('Limit: {limit} · kriticky: {krit} {jednotka}', { limit: i.minQuantity, krit: i.criticalQuantity, jednotka: thresholdUnitLabel(pk(i), i.unit) })}{i.unitCost ? ` · ${cena(i.unitCost)}/${i.unit}` : ''}{i.updatedByName ? ` · ${relTime(i.updatedAt, t, loc)} ${i.updatedByName}` : ''}</p>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------- Shopping list modal ---------- */
function ShoppingListModal({ items, onClose, onOrdered, pk, suppliers = [], smiObjednat, smiOdeslat }: {
  items: Item[];
  onClose: () => void;
  onOrdered: (createdCount: number, requested: number) => void;
  pk: PackagingLookup;
  suppliers?: any[];
  /** nakup.vytvorit — bez něj jde seznam jen zkopírovat, vytisknout nebo poslat. */
  smiObjednat: boolean;
  /** nakup.odeslat — objednávka e-mailem přímo dodavateli. */
  smiOdeslat: boolean;
}) {
  const loc = useLocale();
  const t = useT('sprava');
  const supplierByName = (name: string) => suppliers.find(sp => sp.name === name) ?? null;
  const [emailing, setEmailing] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const emailGroup = async (supplier: string, list: Item[]) => {
    const sp = supplierByName(supplier);
    if (!sp?.email) return;
    setEmailing(supplier); setEmailMsg(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier, supplierId: sp.id, sendEmail: true,
          items: list.map(i => ({ name: i.name, qty: suggestedAmount(i), unit: i.unit, itemId: i.id })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.emailed) setEmailMsg({ text: t('Objednávka odeslána na {email}.', { email: sp.email }), ok: true });
      // Server teď říká i proč. Dřív se tu psalo obecné „nepodařilo se"
      // — a hlavně se sem často ani nedostalo, protože odmítnutý e-mail
      // se tvářil jako odeslaný.
      else if (res.ok) setEmailMsg({ text: d.emailError ? t('Objednávka je vytvořená, ale e-mail neodešel ({chyba}) — pošli ji ručně.', { chyba: d.emailError }) : t('Objednávka je vytvořená, ale e-mail neodešel — pošli ji ručně.'), ok: false });
      else setEmailMsg({ text: d.error || t('Odeslání se nepodařilo.'), ok: false });
      if (res.ok) obnovDataWidgetu('/api/orders');
    } catch { setEmailMsg({ text: t('Odeslání se nepodařilo.'), ok: false }); }
    setEmailing(null);
  };
  const [copied, setCopied] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const hasSuppliers = items.some(i => (i.supplier ?? '').trim() !== '');

  // Group by supplier (keeps the critical-first ordering inside each group).
  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    items.forEach(i => {
      const key = (i.supplier ?? '').trim(); // '' = bez dodavatele (klíč se nepřekládá, popisek až při výpisu)
      const arr = map.get(key);
      if (arr) arr.push(i); else map.set(key, [i]);
    });
    return Array.from(map.entries());
  }, [items]);
  const popisDodavatele = (s: string) => s || t('Bez dodavatele');

  const buildText = () => {
    const date = new Date().toLocaleDateString(loc);
    const lines: string[] = [t('Nákupní seznam – Managero ({datum})', { datum: date })];
    groups.forEach(([supplier, list]) => {
      lines.push('');
      lines.push(`${popisDodavatele(supplier)}:`);
      list.forEach(i => {
        const why = (i.buyFor?.length ?? 0) > 0 ? ` — ${t('na výrobu: {seznam}', { seznam: i.buyFor!.map(f => f.name).join(', ') })}` : '';
        lines.push(`• ${i.name} — ${t('objednat {mnozstvi} {jednotka} (zbývá {zbyva})', { mnozstvi: suggestedAmount(i), jednotka: i.unit, zbyva: i.quantity })}${why}`);
      });
    });
    return lines.join('\n');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildText());
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch { /* schránka nedostupná — tlačítko zůstane „Zkopírovat" */ }
  };

  // Do velkoobchodu se nejde s telefonem v ruce a prstem po seznamu —
  // jde se s papírem a tužkou. Čtvereček u každé položky je na odškrtání.
  const [printFailed, setPrintFailed] = useState(false);
  const printList = () => {
    const rows = groups.map(([supplier, list]) => `
      <h2>${esc(popisDodavatele(supplier))}</h2>
      <table>
        <thead><tr><th style="width:8mm"></th><th>${esc(t('Položka'))}</th><th class="num">${esc(t('Objednat'))}</th><th class="num">${esc(t('Zbývá'))}</th></tr></thead>
        <tbody>${list.map(i => `<tr>
          <td><span class="tick"></span></td>
          <td>${esc(i.name)}${(i.buyFor?.length ?? 0) > 0
            ? `<div class="note">${esc(t('na výrobu: {seznam}', { seznam: i.buyFor!.map(x => x.name).join(', ') }))}</div>` : ''}</td>
          <td class="num">${esc(suggestedAmount(i))} ${esc(i.unit)}</td>
          <td class="num">${esc(i.quantity)} ${esc(i.unit)}</td>
        </tr>`).join('')}</tbody>
      </table>`).join('');
    const n = items.length;
    const ok = openPrint({
      title: t('Nákupní seznam'),
      subtitle: `${t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: n })} · ${new Date().toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
      body: rows,
    });
    setPrintFailed(!ok);
  };

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const share = async () => {
    try { await navigator.share({ title: t('Nákupní seznam'), text: buildText() }); } catch { /* zrušeno */ }
  };

  // One order per supplier group.
  const createOrders = async () => {
    if (ordering) return;
    setOrdering(true);
    let created = 0;
    for (const [supplier, list] of groups) {
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplier: supplier === '' ? null : supplier,
            items: list.map(i => ({ name: i.name, qty: suggestedAmount(i), unit: i.unit, itemId: i.id })),
          }),
        });
        if (res.ok) created++;
      } catch { /* spočítá se jako nevytvořená */ }
    }
    setOrdering(false);
    onOrdered(created, groups.length);
  };

  const mailto = `mailto:?subject=${encodeURIComponent(t('Objednávka – {datum}', { datum: new Date().toLocaleDateString(loc) }))}&body=${encodeURIComponent(buildText())}`;

  return (
    <Modal open onClose={onClose} size="lg" title={t('Nákupní seznam')} subtitle={t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: items.length })}
      footer={<>
        <Menu label={t('Další možnosti seznamu')} items={[
          { label: t('Vytisknout'), icon: 'print', hint: t('S čtverečky k odškrtání v obchodě.'), onClick: printList },
          { label: t('Poslat e-mailem'), icon: 'mail', hint: t('Otevře e-mail s předvyplněným seznamem.'), onClick: () => { window.location.href = mailto; } },
          ...(canShare ? [{ label: t('Sdílet'), icon: 'send', onClick: share }] : []),
        ]} />
        <Button variant="secondary" icon="copy" onClick={copy}>{copied ? t('Zkopírováno') : t('Zkopírovat')}</Button>
        {smiObjednat && (
          <Button variant="primary" loading={ordering} disabled={items.length === 0} onClick={createOrders}>{t('Vytvořit objednávku')}</Button>
        )}
      </>}>
      <div className="space-y-4">
        {emailMsg && <p className={`note ${emailMsg.ok ? 'note-ok' : 'note-wait'}`} role="status">{emailMsg.text}</p>}
        {printFailed && (
          <p className="note note-wait">
            
            {t('Tiskové okno prohlížeč zablokoval. Povol vyskakovací okna pro tuhle stránku, nebo si seznam zkopíruj a vytiskni odjinud.')}
          </p>
        )}
        {items.length === 0 && <p className="t-meta">{t('Od tohoto dodavatele teď nic nechybí.')}</p>}
        {groups.map(([supplier, list]) => (
          <section key={supplier || '_bez'} aria-label={popisDodavatele(supplier)}>
            {hasSuppliers && (
              <div className="flex items-center justify-between gap-2">
                <p className="t-label">{popisDodavatele(supplier)}</p>
                {smiOdeslat && supplierByName(supplier)?.email && (
                  <Button variant="secondary" size="sm" icon="send" loading={emailing === supplier} onClick={() => emailGroup(supplier, list)}>
                    
                    {t('Objednat e-mailem')}
                  </Button>
                )}
              </div>
            )}
            <ul className="list mt-1">
              {list.map(i => {
                const st = statusOf(i, pk);
                return (
                  <ListRow key={i.id}
                    title={i.name}
                    meta={[t('zbývá {n} {jednotka}', { n: i.quantity, jednotka: i.unit }), (i.buyFor?.length ?? 0) > 0 ? t('na výrobu: {seznam}', { seznam: i.buyFor!.map(f => f.name).join(', ') }) : null].filter(Boolean).join(' · ')}
                    value={<span className="tabular-nums">+{suggestedAmount(i)} {i.unit}</span>}
                    right={<Chip tone={st === 'critical' ? 'bad' : st === 'low' ? 'wait' : 'info'} size="sm">{st === 'critical' ? t('kriticky') : st === 'low' ? t('dochází') : t('na výrobu')}</Chip>}
                    actions={i.supplierUrl ? (
                      <a href={i.supplierUrl} target="_blank" rel="noopener" className="btn-icon" aria-label={t('Objednat {nazev} u dodavatele', { nazev: i.name })}>
                        <Icon name="external" size={15} />
                      </a>
                    ) : undefined} />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}

/* ---------- Category management modal ---------- */
function CategoryManager({ categories, onClose, onChanged, createCategory, potvrdit }: {
  categories: Category[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  createCategory: (name: string, parentId?: number | null) => Promise<boolean>;
  potvrdit: (p: Potvrzeni) => void;
}) {
  const t = useT('sprava');
  const [newName, setNewName] = useState('');
  const [newParent, setNewParent] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [packId, setPackId] = useState<number | null>(null);
  const [moveId, setMoveId] = useState<number | null>(null);
  const [prefillId, setPrefillId] = useState<number | null>(null);
  const [err, setErr] = useState('');

  // Vlastní a cizí zvlášť: kategorie z organizace (kolo 60) se tu jen čtou
  // a mají vlastní blok pod našimi. Rodič se vždy drží uvnitř skupiny
  // (server zanoření napříč podniky odmítá), takže dva stromy jsou bezpečné.
  const own = useMemo(() => categories.filter(c => !c.zOrganizace), [categories]);
  const cizi = useMemo(() => categories.filter(c => c.zOrganizace), [categories]);
  const tree = useMemo(() => buildTree(own), [own]);
  const ciziTree = useMemo(() => buildTree(cizi), [cizi]);
  const flat = useMemo(() => flattenTree(own), [own]);
  const spravuje = cizi.find(c => c.spravuje)?.spravuje ?? null;

  // Nesting has no fixed depth, so a branch renders itself.
  const renderNode = (node: TreeNode<Category>, siblings: Category[], depth: number, readOnly = false): React.ReactNode => {
    const c = node.cat;
    const idx = siblings.findIndex(s => s.id === c.id);
    const inherited = packagingSourceOf(readOnly ? cizi : own, c.name);
    return (
      <div key={c.id} className={depth === 0 ? 'py-2.5 space-y-2' : 'space-y-2'}>
        <CategoryRow
          c={c} siblings={siblings} idx={idx} busy={busy} nested={depth > 0} readOnly={readOnly}
          editing={editId === c.id} editName={editName} setEditName={setEditName}
          startEdit={() => { setEditId(c.id); setEditName(c.name); }}
          cancelEdit={() => setEditId(null)} saveRename={() => saveRename(c.id)}
          move={move} onDelete={() => del(c)}
          packOpen={packId === c.id} togglePack={() => setPackId(packId === c.id ? null : c.id)}
          moveOpen={moveId === c.id} toggleMove={() => { setMoveId(moveId === c.id ? null : c.id); setErr(''); }}
          parentOptions={readOnly ? [] : possibleParents(own, c.id)} setParent={p => setParent(c, p)}
          childCount={node.children.length}
          inheritsPackaging={!c.tracksOpen && inherited != null}
          prefillOpen={prefillId === c.id}
          togglePrefill={() => setPrefillId(prefillId === c.id ? null : c.id)}
          hasPrefill={hasDefaults(c.defaults)}
          pathLabel={target => pathOfId(own, target)}
          onToggleHide={async () => {
            const res = await fetch(`/api/inventory/categories/${c.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hideFromOverview: !(c.hideFromOverview === true) }),
            }).catch(() => null);
            if (res?.ok) await onChanged();
            else setErr(t('Skrytí kategorie se nepodařilo uložit.'));
          }}
        />
        {!readOnly && prefillId === c.id && (
          <DefaultsEditor
            category={c}
            inherited={mergeDefaults(ancestryOfId(own, c.id).slice(0, -1).map(a => a.defaults))}
            onSaved={onChanged}
          />
        )}
        {!readOnly && packId === c.id && <PackagingEditor category={c} onSaved={onChanged} />}
        {node.children.length > 0 && (
          <div className="ml-3 pl-3 border-l border-black/[0.08] space-y-2">
            {node.children.map(child => renderNode(child, node.children.map(n => n.cat), depth + 1, readOnly))}
          </div>
        )}
      </div>
    );
  };

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const ok = await createCategory(newName, newParent ? parseInt(newParent) : null);
    setBusy(false);
    if (ok) { setNewName(''); await onChanged(); }
    else setErr(t('Kategorii se nepodařilo vytvořit.'));
  };

  // Re-file a category: null lifts it back to the top level.
  const setParent = async (c: Category, parentId: number | null) => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/inventory/categories/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || t('Přesun se nepodařil.'));
      } else {
        setMoveId(null);
        await onChanged();
      }
    } catch { setErr(t('Nepodařilo se spojit se serverem.')); }
    setBusy(false);
  };

  const vychoziKategorie = ['Nápoje', 'Suroviny', 'Nádobí', 'Drogerie']; // i18n-ok (obsah podniku: ukládá se na server česky, nezávisle na jazyce prohlížení)
  const seedDefaults = async () => {
    setBusy(true);
    const existing = new Set(own.map(c => c.name.toLowerCase()));
    for (const name of vychoziKategorie) {
      if (!existing.has(name.toLowerCase())) await createCategory(name);
    }
    setBusy(false);
    await onChanged();
  };

  const saveRename = async (id: number) => {
    const name = editName.trim();
    if (!name) { setEditId(null); return; }
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/inventory/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || t('Přejmenování se nepodařilo.'));
        setBusy(false);
        return; // keep the editor open — closing would throw the typed name away
      }
    } catch {
      setErr(t('Nepodařilo se spojit se serverem.'));
      setBusy(false);
      return;
    }
    setBusy(false);
    setEditId(null);
    await onChanged();
  };

  // Reordering happens inside a sibling group, so subcategories move within
  // their parent instead of jumping across the whole list.
  const move = async (siblings: Category[], idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= siblings.length) return;
    const a = siblings[idx], b = siblings[target];
    setBusy(true); setErr('');
    try {
      const res = await Promise.all([
        fetch(`/api/inventory/categories/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: b.position }) }),
        fetch(`/api/inventory/categories/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: a.position }) }),
      ]);
      if (res.some(r => !r.ok)) setErr(t('Pořadí se nepodařilo uložit.'));
    } catch { setErr(t('Nepodařilo se spojit se serverem.')); }
    setBusy(false);
    await onChanged();
  };

  const del = (c: Category) => {
    const kids = own.filter(x => x.parentId === c.id).length;
    const extra = kids > 0 ? ` ${t('{n, plural, one {# podkategorie se přesune na hlavní úroveň.} few {# podkategorie se přesunou na hlavní úroveň.} other {# podkategorií se přesune na hlavní úroveň.}}', { n: kids })}` : '';
    potvrdit({
      titulek: t('Smazat kategorii „{nazev}"?', { nazev: c.name }),
      text: `${t('Položky si svůj štítek ponechají.')}${extra}`,
      akce: t('Smazat kategorii'),
      provest: async () => {
        setBusy(true); setErr('');
        try {
          const res = await fetch(`/api/inventory/categories/${c.id}`, { method: 'DELETE' });
          if (!res.ok) setErr(t('Kategorii se nepodařilo smazat.'));
        } catch { setErr(t('Nepodařilo se spojit se serverem.')); }
        setBusy(false);
        await onChanged();
      },
    });
  };

  return (
    <Modal open onClose={onClose} size="lg" title={t('Kategorie a balení')}
      subtitle={t('Pořadí, zanoření, předvyplnění nových položek a sledování načatých balení.')}
      footer={<Button variant="secondary" onClick={onClose}>{t('Hotovo')}</Button>}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('Název nové kategorie')}
            aria-label={t('Název nové kategorie')}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            className={`${inputClass} flex-1 min-w-0`} />
          {flat.length > 0 && (
            <select value={newParent} onChange={e => setNewParent(e.target.value)}
              aria-label={t('Kam novou kategorii zařadit')}
              className={`${inputClass} !w-full sm:!w-40 shrink-0`}>
              <option value="">{t('Hlavní')}</option>
              {flat.map(({ cat: c, depth }) => (
                <option key={c.id} value={String(c.id)}>{' '.repeat(depth * 2)}{t('pod {nazev}', { nazev: c.name })}</option>
              ))}
            </select>
          )}
          <Button variant="primary" icon="plus" onClick={add} loading={busy} disabled={!newName.trim()}>{t('Přidat')}</Button>
        </div>

        {err && <p className="note note-danger" role="alert">{err}</p>}

        {own.length === 0 ? (cizi.length > 0 ? (
          // Bez vlastních kategorií, ale s kategoriemi z organizace: sklad
          // prázdný není a výchozí sada by se dublovala s tou sdílenou.
          <p className="t-meta py-2">{t('Vlastní kategorie zatím nemáš — používáš kategorie z organizace níže. Vlastní přidáš nahoře.')}</p>
        ) : (
          <EmptyState illustration="sklad" title={t('Sklad je zatím prázdný')} compact
            hint={t('Začni kategoriemi — nápoje, suroviny, nádobí, drogerie. Můžeš je nechat založit a pak upravit.')}
            action={<Button variant="secondary" onClick={seedDefaults} loading={busy}>{t('Přidat výchozí: {seznam}', { seznam: vychoziKategorie.join(', ') })}</Button>} />
        )) : (
          <div className="divide-y divide-black/[0.06]">
            {tree.map(node => renderNode(node, tree.map(t => t.cat), 0))}
          </div>
        )}

        {/* Kategorie zdrojového podniku organizace — jen ke čtení; položky
            na ně můžou ukazovat, ale upraví je vedení podniku, který je spravuje. */}
        {ciziTree.length > 0 && (
          <section className="space-y-1 pt-2" aria-labelledby="sklad-kat-org">
            <p id="sklad-kat-org" className="t-label flex items-center gap-2">
              {t('Z organizace')} <Chip tone="muted" size="sm">{t('{n, plural, one {# kategorie} few {# kategorie} other {# kategorií}}', { n: cizi.length })}</Chip>
            </p>
            {spravuje && <p className="t-meta">{t('Spravuje: {kdo}. Upraví je jeho vedení.', { kdo: spravuje })}</p>}
            <div className="divide-y divide-black/[0.06]">
              {ciziTree.map(node => renderNode(node, ciziTree.map(t => t.cat), 0, true))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}

/* ---------- One row in the category manager ---------- */
// Akce řádku jsou v jedné nabídce „···" (DP §3.6: nejvýš dvě tlačítka v řádku).
// Dřív šest kulatých tlačítek, řazení znaky ▲▼, skrytí emoji a mazání ikonou
// křížku s popiskem „Zavřít".
function CategoryRow({
  c, siblings, idx, busy, nested, readOnly, editing, editName, setEditName, startEdit, cancelEdit, saveRename,
  move, onDelete, packOpen, togglePack, moveOpen, toggleMove, parentOptions, setParent, childCount,
  inheritsPackaging, prefillOpen, togglePrefill, hasPrefill, pathLabel, onToggleHide,
}: {
  c: Category; siblings: Category[]; idx: number; busy: boolean; nested?: boolean;
  /** Kategorie z organizace: bez úprav, přesunu, mazání i editorů. */
  readOnly?: boolean;
  onToggleHide: () => void;
  editing: boolean; editName: string; setEditName: (v: string) => void;
  startEdit: () => void; cancelEdit: () => void; saveRename: () => void;
  move: (siblings: Category[], idx: number, dir: -1 | 1) => void;
  onDelete: () => void;
  packOpen: boolean; togglePack: () => void;
  moveOpen: boolean; toggleMove: () => void;
  parentOptions: Category[]; setParent: (parentId: number | null) => void;
  childCount: number; inheritsPackaging?: boolean;
  prefillOpen: boolean; togglePrefill: () => void; hasPrefill: boolean;
  /** Full path of a category, so two same-named options stay distinguishable. */
  pathLabel: (id: number) => string;
}) {
  const t = useT('sprava');
  // Anything can be re-filed except under its own branch, which possibleParents
  // has already excluded.
  const canMove = parentOptions.length > 0 || c.parentId != null;
  const nazev = (
    <span className={`flex-1 min-w-0 truncate ${nested ? 'text-[13px] text-black/70' : 'text-sm text-[#16181A] font-medium'}`}>
      {c.name}
      {childCount > 0 && <span className="text-xs text-black/55 ml-1.5">{t('{n} podkat.', { n: childCount })}</span>}
      {inheritsPackaging && !c.tracksOpen && <span className="text-xs text-black/55 ml-1.5">{t('balení dědí')}</span>}
    </span>
  );
  if (readOnly) {
    return (
      <div className="flex items-center gap-2">
        {nazev}
        <Chip tone="muted" size="sm" className="shrink-0">{t('z organizace')}</Chip>
      </div>
    );
  }
  const stavy = [
    c.sdileno ? <Chip key="s" tone="info" size="sm">{t('sdíleno')}</Chip> : null,
    c.hideFromOverview ? <Chip key="h" tone="muted" size="sm">{t('skrytá ve Vše')}</Chip> : null,
    hasPrefill ? <Chip key="p" tone="muted" size="sm">{t('předvyplnění')}</Chip> : null,
    c.tracksOpen ? <Chip key="b" tone="muted" size="sm">{t('balení')}</Chip> : null,
  ].filter(Boolean);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {editing ? (
          <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} aria-label={t('Nový název kategorie {nazev}', { nazev: c.name })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveRename(); } if (e.key === 'Escape') cancelEdit(); }}
            onBlur={saveRename}
            className={`${inputClass} flex-1 min-w-0`} />
        ) : nazev}
        {stavy.length > 0 && <span className="hidden sm:flex items-center gap-1 shrink-0">{stavy}</span>}
        <Menu size="sm" label={t('Další akce: {nazev}', { nazev: c.name })} items={[
          { label: t('Přejmenovat'), icon: 'pencil', onClick: startEdit },
          ...(idx > 0 ? [{ label: t('Posunout výš'), icon: 'chevron', onClick: () => { if (!busy) move(siblings, idx, -1); } }] : []),
          ...(idx < siblings.length - 1 ? [{ label: t('Posunout níž'), icon: 'chevron', onClick: () => { if (!busy) move(siblings, idx, 1); } }] : []),
          ...(canMove ? [{ label: moveOpen ? t('Zavřít přesun') : t('Přesunout pod jinou…'), icon: 'swap', onClick: toggleMove }] : []),
          { label: c.hideFromOverview ? t('Ukázat v přehledu „Vše"') : t('Skrýt z přehledu „Vše"'), icon: 'search', onClick: onToggleHide },
          { label: prefillOpen ? t('Zavřít předvyplnění') : t('Předvyplnění nových položek'), icon: 'clipboard', onClick: togglePrefill },
          { label: packOpen ? t('Zavřít balení') : t('Balení a zbytky'), icon: 'box', onClick: togglePack },
          { label: t('Smazat kategorii…'), icon: 'trash', danger: true, onClick: onDelete },
        ]} />
      </div>

      {moveOpen && (
        <div className="well flex flex-wrap items-center gap-1.5 px-3 py-2" role="group" aria-label={t('Kam zařadit {nazev}', { nazev: c.name })}>
          <span className="t-meta">{t('Zařadit:')}</span>
          <button type="button" onClick={() => setParent(null)} disabled={busy || c.parentId == null} aria-pressed={c.parentId == null}
            className={`filter-pill tap-target-sm disabled:opacity-40 ${c.parentId == null ? 'seg-on' : 'seg-off glass'}`}>
            
            {t('Hlavní úroveň')}
          </button>
          {parentOptions.map(p => (
            <button type="button" key={p.id} onClick={() => setParent(p.id)} disabled={busy || c.parentId === p.id}
              title={pathLabel(p.id)} aria-pressed={c.parentId === p.id}
              className={`filter-pill tap-target-sm disabled:opacity-40 ${c.parentId === p.id ? 'seg-on' : 'seg-off glass'}`}>
              {t('pod {cesta}', { cesta: pathLabel(p.id) })}
            </button>
          ))}
          {parentOptions.length === 0 && c.parentId == null && (
            <span className="t-meta">{t('Zatím není kam ji zanořit.')}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Per-category prefill for new items ---------- */
// The fields a shop fills in the same way for every product in a category are
// set here once; a new item in the category starts with them already filled.
function DefaultsEditor({ category, inherited, onSaved }: {
  category: Category;
  inherited: ItemDefaults;
  onSaved: () => Promise<void> | void;
}) {
  const t = useT('sprava');
  const [values, setValues] = useState<Record<string, string>>(() => {
    const own = category.defaults ?? {};
    const out: Record<string, string> = {};
    DEFAULT_FIELDS.forEach(f => { out[f.key] = (own as any)[f.key] != null ? String((own as any)[f.key]) : ''; });
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  // Výchozí cena je cena balení, když kategorie předvyplňuje i velikost balení (vlastní nebo zděděnou).
  const cenaZaBaleni = vyznamCeny(values.packageSize || (inherited as any).packageSize) === 'baleni';

  const save = async () => {
    setBusy(true); setSaved(false); setErr('');
    const payload: Record<string, any> = {};
    DEFAULT_FIELDS.forEach(f => {
      const v = values[f.key]?.trim();
      // Česká čárka: type="number" ji nepustí, proto textové pole a převod tady.
      if (v) payload[f.key] = f.kind === 'number' ? Number(v.replace(',', '.')) : v;
    });
    try {
      const res = await fetch(`/api/inventory/categories/${category.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaults: payload }),
      });
      if (res.ok) { setSaved(true); await onSaved(); setTimeout(() => setSaved(false), 1800); }
      else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || t('Předvyplnění se nepodařilo uložit.'));
      }
    } catch { setErr(t('Nepodařilo se spojit se serverem.')); }
    setBusy(false);
  };

  return (
    <div className="mt-2.5 well p-4 space-y-3">
      <p className="t-meta">{t('Nová položka v této kategorii se předvyplní tímhle. Cokoliv jde u položky přepsat.')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {DEFAULT_FIELDS.map(f => {
          const fromParent = (inherited as any)[f.key];
          const id = `sklad-predvyplneni-${category.id}-${f.key}`;
          return (
            <Field key={f.key} id={id} label={f.key === 'unitCost' ? (cenaZaBaleni ? t('Cena za balení') : t('Cena za jednotku')) : f.label} className={f.kind === 'multiline' ? 'sm:col-span-2' : ''}
              hint={fromParent != null && !values[f.key] ? t('Zdědí se z nadřazené kategorie.') : undefined}>
              {f.kind === 'multiline' ? (
                <textarea id={id} rows={2} value={values[f.key]} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={fromParent != null ? String(fromParent) : f.hint}
                  className={`${inputClass} resize-none`} />
              ) : (
                <input id={id} type={f.kind === 'url' ? 'url' : 'text'}
                  inputMode={f.kind === 'number' ? 'decimal' : undefined}
                  value={values[f.key]} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={fromParent != null ? String(fromParent) : f.hint}
                  className={inputClass} />
              )}
            </Field>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={save} loading={busy}>{t('Uložit')}</Button>
        {saved && <span className="text-xs font-medium text-ok-ink" role="status">{t('Uloženo')}</span>}
        {err && <span className="text-xs font-medium text-bad-ink" role="alert">{err}</span>}
      </div>
    </div>
  );
}

/* ---------- Per-category packaging settings ---------- */
// Turning this on makes every item in the category track how much is left in
// its open package, and gives staff a tap-scale instead of a scale-and-weigh.
function PackagingEditor({ category, onSaved }: {
  category: Category;
  onSaved: () => Promise<void> | void;
}) {
  const t = useT('sprava');
  const [on, setOn] = useState(category.tracksOpen === true);
  const [unit, setUnit] = useState(category.contentUnit ?? 'g');
  const [size, setSize] = useState(category.defaultPackageSize != null ? String(category.defaultPackageSize) : '');
  const [steps, setSteps] = useState<ScaleStep[]>(() => normalizeScale(category.scale).steps);
  const [thresholdUnit, setThresholdUnit] = useState<'package' | 'content'>(
    category.thresholdUnit === 'content' ? 'content' : 'package',
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true); setSaved(false); setErr('');
    try {
      const res = await fetch(`/api/inventory/categories/${category.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracksOpen: on,
          contentUnit: unit || null,
          defaultPackageSize: size === '' ? null : Number(size),
          thresholdUnit,
          scale: { kind: 'fraction', steps },
        }),
      });
      if (res.ok) {
        setSaved(true); await onSaved(); setTimeout(() => setSaved(false), 1800);
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || t('Nastavení se nepodařilo uložit.'));
      }
    } catch {
      setErr(t('Nepodařilo se spojit se serverem.'));
    }
    setBusy(false);
  };

  const setStep = (i: number, patch: Partial<ScaleStep>) =>
    setSteps(list => list.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const idK = `sklad-baleni-${category.id}`;

  return (
    <div className="mt-2.5 well p-4 space-y-3">
      <SwitchRow as="div" title={t('Sledovat zbytek v načatém balení')}
        hint={t('Obsluha na konci směny jen ťukne, jak je krabička plná — nic neváží.')}
        checked={on} onChange={setOn} />

      {on && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Field id={`${idK}-jednotka`} label={t('Jednotka obsahu')}>
              <select id={`${idK}-jednotka`} value={unit} onChange={e => setUnit(e.target.value)} className={inputClass}>
                {CONTENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field id={`${idK}-velikost`} label={t('Výchozí balení')}>
              <input id={`${idK}-velikost`} type="number" inputMode="numeric" min={0} value={size} onChange={e => setSize(e.target.value)} placeholder="100"
                className={`${inputClass} tabular-nums`} />
            </Field>
          </div>

          <div>
            <p className="field-label">{t('Hlídat zásoby podle')}</p>
            <Segmented ariaLabel={t('Hlídat zásoby podle')} size="sm" value={thresholdUnit} onChange={setThresholdUnit}
              options={[{ id: 'package', label: t('Balení') }, { id: 'content', label: unit ? t('Obsahu ({jednotka})', { jednotka: unit }) : t('Obsahu') }]} />
            <p className="t-meta mt-1.5">
              {thresholdUnit === 'content'
                ? t('„Upozornit při" a „Kriticky málo při" se u položek zadávají v {jednotka} — počítá se všechno dohromady, zavřená balení i zbytek v načatém.', { jednotka: unit || t('jednotkách obsahu') })
                : t('Prahy se zadávají v balení; načaté balení se počítá jako část (půl krabičky = 0,5).')}
            </p>
            {thresholdUnit !== (category.thresholdUnit === 'content' ? 'content' : 'package') && (
              <p className="note note-wait mt-1.5 text-[13px]">
                {t('Prahy u položek v této kategorii jsou zadané v {jednotka} — po uložení je bude potřeba přepsat, jinak budou hlásit nesmysl.', { jednotka: thresholdUnit === 'content' ? t('balení') : (unit || t('jednotkách obsahu')) })}
              </p>
            )}
          </div>

          <div>
            <p className="field-label">{t('Stupně měřítka')}</p>
            <div className="space-y-1.5">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={s.label} onChange={e => setStep(i, { label: e.target.value })} aria-label={t('Název stupně {n}', { n: i + 1 })}
                    className={`${inputClass} flex-1 min-w-0`} />
                  <div className="flex items-center gap-1 shrink-0">
                    <input type="number" inputMode="numeric" min={0} max={100} value={s.pct ?? 0} aria-label={t('Procenta stupně {nazev}', { nazev: s.label || i + 1 })}
                      onChange={e => setStep(i, { pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className={`${inputClass} !w-20 tabular-nums`} />
                    <span className="text-xs text-black/55">%</span>
                  </div>
                  <Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={t('Odebrat stupeň {nazev}', { nazev: s.label || i + 1 })}
                    onClick={() => setSteps(l => l.filter((_, idx) => idx !== i))} />
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" icon="plus" className="mt-2" onClick={() => setSteps(l => [...l, { label: t('Nový stupeň'), pct: 50 }])}>
              
              {t('Přidat stupeň')}
            </Button>
            <p className="t-meta mt-1.5">
              
              {t('Procenta platí pro jakoukoliv velikost balení — „Půl" je 50 g u stogramové i 25 g u padesátigramové.')}
            </p>
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={save} loading={busy}>{t('Uložit')}</Button>
        {saved && <span className="text-xs font-medium text-ok-ink" role="status">{t('Uloženo')}</span>}
        {err && <span className="text-xs font-medium text-bad-ink" role="alert">{err}</span>}
      </div>
    </div>
  );
}

// Suppliers manager: name + e-mail is all an order needs to leave the app.
function SuppliersModal({ suppliers, smiUpravit, onClose, onChanged, potvrdit }: {
  suppliers: any[];
  /** dodavatele.upravit — bez něj se seznam jen čte. */
  smiUpravit: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  potvrdit: (p: Potvrzeni) => void;
}) {
  const t = useT('sprava');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr('');
    const res = await fetch('/api/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim() || null, phone: phone.trim() || null }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) { setName(''); setEmail(''); setPhone(''); await onChanged(); }
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || t('Uložení se nepodařilo.')); }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={t('Dodavatelé')}
      subtitle={t('S vyplněným e-mailem jde objednávka poslat rovnou z nákupního seznamu. Jméno dodavatele u položek vybíráš našeptávačem.')}>
      <div className="space-y-4">
        {err && <p className="note note-danger" role="alert">{err}</p>}
        {smiUpravit && (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <Field id="sklad-dod-nazev" label={t('Název dodavatele')}>
              <input id="sklad-dod-nazev" value={name} onChange={e => setName(e.target.value)} maxLength={120} className={inputClass} />
            </Field>
            <Field id="sklad-dod-email" label={t('E-mail pro objednávky')}>
              <input id="sklad-dod-email" value={email} onChange={e => setEmail(e.target.value)} placeholder="objednavky@dodavatel.cz" type="email" maxLength={200} className={inputClass} />
            </Field>
            <Button variant="primary" icon="plus" onClick={add} loading={busy} disabled={!name.trim()}>{t('Přidat')}</Button>
          </div>
        )}

        {suppliers.length === 0 ? (
          <EmptyState illustration="sklad" title={t('Zatím žádný dodavatel')} hint={t('S dodavatelem u položky pošleš objednávku e-mailem rovnou z nákupního seznamu.')} compact />
        ) : (
          <ul className="list">
            {suppliers.map(sp => (
              <li key={sp.id}>
                <ListRow as="div"
                  title={<>
                    {sp.name}
                    {sp.zOrganizace && <Chip tone="muted" size="sm" className="ml-1.5 align-middle">{t('z organizace')}</Chip>}
                    {sp.sdileno && <Chip tone="info" size="sm" className="ml-1.5 align-middle">{t('sdíleno')}</Chip>}
                  </>}
                  meta={editId === sp.id ? undefined : <span className={sp.email ? '' : 'text-wait-ink'}>{sp.email ?? t('bez e-mailu')}</span>}
                  actions={sp.zOrganizace || !smiUpravit ? undefined : editId === sp.id ? (
                    <span className="flex items-center gap-1.5">
                      <input value={editEmail} onChange={e => setEditEmail(e.target.value)} type="email" aria-label={t('E-mail dodavatele {nazev}', { nazev: sp.name })}
                        className={`${inputClass} !w-full sm:!w-52`} />
                      <Button variant="primary" size="sm" onClick={async () => {
                        const res = await fetch('/api/suppliers', {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: sp.id, email: editEmail.trim() || null }),
                        }).catch(() => null);
                        if (res?.ok) { setEditId(null); await onChanged(); }
                        else setErr(t('E-mail se nepodařilo uložit.'));
                      }}>{t('Uložit')}</Button>
                    </span>
                  ) : (
                    <Menu size="sm" label={t('Další akce: {nazev}', { nazev: sp.name })} items={[
                      { label: t('Upravit e-mail'), icon: 'pencil', onClick: () => { setEditId(sp.id); setEditEmail(sp.email ?? ''); } },
                      { label: t('Smazat dodavatele…'), icon: 'trash', danger: true, onClick: () => potvrdit({
                        titulek: t('Smazat dodavatele „{nazev}"?', { nazev: sp.name }),
                        text: t('U položek zůstane jeho jméno jako text, jen z něj nepůjde poslat objednávka e-mailem.'),
                        akce: t('Smazat dodavatele'),
                        provest: async () => {
                          const res = await fetch(`/api/suppliers?id=${sp.id}`, { method: 'DELETE' }).catch(() => null);
                          if (res?.ok) await onChanged();
                          else setErr(t('Dodavatele se nepodařilo smazat.'));
                        },
                      }) },
                    ]} />
                  )}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
