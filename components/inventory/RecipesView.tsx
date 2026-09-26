'use client';

// Receptury: co ze skladu zmizí, když se na pokladně prodá jedna položka.
//
// Ta těžká část není ukládání, ale zadávání. Do Blue Lagoon jde 0,02 l vodky —
// číslo, které se do políčka s krokem 0,1 zadává proti odporu a ve kterém se
// snadno splete řád. Proto se množství zadává v jednotce, kterou má člověk v
// ruce (ml, cl, l), a obrazovka rovnou ukáže, kolik porcí z balení vyjde a co
// ta porce stojí — tam se chyba o řád pozná okamžitě.
//
// Kolo 69 (balík B4): stránka je plocha s widgety. Hlavička jde do PlochaWidgetu
// (dřív vlastní h1 a vedle ruční tlačítko), tři dlaždice s čísly a tónovaný pás
// „Prodává se, ale neodepisuje" jsou widgety (oblasti/receptury.tsx) a tahle
// komponenta kreslí jen nástroj: hledání, kategorie, seznam a editor receptury.
// Data čte přes useDataWidgetu ze stejných adres jako widgety — stránka se ptá
// jednou a po uložení receptury se obnoví nástroj i čísla nahoře zároveň.
//
// N1: „Odepsat prodeje" dřív volalo PATCH /api/pos/products, který neexistuje
// (405 a „Odpis se nepodařil"). Teď POST /api/pos/sync a tlačítko jen s
// pokladna.synchronizovat.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { useMoney, useCost } from '../CurrencyProvider';
import ItemInlineEdit from './ItemInlineEdit';
import NewIngredientInline from './NewIngredientInline';
import { apiMessage, okJson } from '@/lib/api';
import { recipeCost, ingredientCost, marginPct } from '@/lib/recipeCost';
import { obsahujeNekde } from '@/lib/hledani';
import { czCount, type CzNoun } from '@/lib/czech';
import { vyberReceptury, vetaOdpisu, type DataReceptur, type Receptura } from '@/lib/recepturyPrehled';
import {
  Button, Card, Chip, EmptyState, Field, Input, ListRow, Modal, SearchField, Segmented, Select, Skeleton, Stat, Toast, Well,
} from '../ui';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { useOpravneni } from '../role/useOpravneni';
import { URL_RECEPTURY, UDALOST_OTEVRIT_RECEPTURU } from '../widgety/oblasti/receptury';

const URL_SKLAD = '/api/inventory';
const URL_KATEGORIE = '/api/inventory/categories';
const URL_NAVODY = '/api/guides';

type Ingredient = { itemId: string; amount: string; unit: string };
type Draft = { productId: string; productName: string; ingredients: Ingredient[]; existing: boolean };

const SUROVINA: CzNoun = { one: 'surovina', few: 'suroviny', many: 'surovin' };

/** Jednotky, ve kterých se dá zadávat, a jejich převod na základní (l / kg / ks). */
const UNITS: Record<string, { label: string; toBase: number; base: string }[]> = {
  l: [
    { label: 'ml', toBase: 0.001, base: 'l' },
    { label: 'cl', toBase: 0.01, base: 'l' },
    { label: 'dl', toBase: 0.1, base: 'l' },
    { label: 'l', toBase: 1, base: 'l' },
  ],
  kg: [
    { label: 'g', toBase: 0.001, base: 'kg' },
    { label: 'dkg', toBase: 0.01, base: 'kg' },
    { label: 'kg', toBase: 1, base: 'kg' },
  ],
  ks: [{ label: 'ks', toBase: 1, base: 'ks' }],
};

/** Do které rodiny jednotek položka patří — podle toho, co má napsané. */
function familyOf(item: any): 'l' | 'kg' | 'ks' {
  const u = String(item?.contentUnit ?? item?.unit ?? '').toLowerCase();
  if (['l', 'ml', 'cl', 'dl', 'litr'].includes(u)) return 'l';
  if (['kg', 'g', 'dkg'].includes(u)) return 'kg';
  return 'ks';
}

/** Číslo z pole, které přijme i desetinnou čárku — píše se tak česky. */
const num = (s: string) => Number(String(s).replace(',', '.')) || 0;

/** Kolik základní jednotky (l, kg) je jedna jednotka, ve které je vedená
 *  položka. Receptura se ukládá v jednotce položky, protože v ní je i
 *  velikost balení a cena — jinak by se z tabáku vedeného v gramech
 *  odepisovalo tisíckrát míň, než se opravdu použije. */
function itemFactor(item: any): number {
  const u = String(item?.contentUnit ?? item?.unit ?? '').toLowerCase();
  const fam = familyOf(item);
  return UNITS[fam].find(o => o.label === u)?.toBase ?? 1;
}

/** Uložené množství (v jednotce položky) jako řádek editoru v jednotce, ve které to není samá nula (0,02 l → 20 ml). */
function doRadku(itemId: string, amount: number, item: any): Ingredient {
  const opts = UNITS[familyOf(item)];
  const base = (Number(amount) || 0) * itemFactor(item);
  const pick = [...opts].reverse().find(o => base / o.toBase >= 1) ?? opts[0];
  return { itemId, amount: String(+(base / pick.toBase).toFixed(4)), unit: pick.label };
}

// Kolik položek menu se vykreslí najednou. Strop je kvůli výkonu, ale
// musí být vidět — tiché oříznutí je ztráta dat bez upozornění.
const LIMIT = 200;

/** Marže tónem stavu: nad 65 % v pořádku, pod 45 % pozor (stejné prahy jako editor). */
const tonMarze = (m: number) => (m >= 65 ? 'text-ok-ink' : m >= 45 ? 'text-[#16181A]' : 'text-bad-ink');

// Typ je pojmenovaný, aby ho uneslo i líné načtení: u parametru s výchozí
// hodnotou (`= {}`) se props z `import()` samy neodvodí.
export interface RecipesViewProps {
  openProductId?: string;
  onNavigate?: (view: string, arg?: string) => void;
}

// Archivované suroviny zůstávají: receptura je může pořád obsahovat a bez nich by editor
// ukázal prázdný řádek a marže by se spočítala jen z části surovin. Z nabídky se skrývají
// až v Selectu (kromě právě vybrané).
const vyberSklad = (raw: unknown): any[] => (Array.isArray(raw) ? raw.filter((i: any) => i && i.approved !== false) : []);
const vyberKategorie = (raw: unknown) => (Array.isArray(raw) ? raw.map((c: any) => ({ id: Number(c.id), name: String(c.name) })) : []);
const vyberNavody = (raw: any): { id: number; title: string; productId: string | null }[] =>
  (Array.isArray(raw?.guides) ? raw.guides.filter((x: any) => x.productId) : []);

export default function RecipesView({ openProductId, onNavigate }: RecipesViewProps = {}) {
  // Data (návody) přísně přes useSmi — bez jistoty se neptat; tlačítka přes
  // `ma` jako Sklad: do načtení oprávnění ANO, rozhodne server.
  const smi = useSmi();
  const { ma } = useOpravneni();
  const money = useMoney();
  const data = useDataWidgetu<DataReceptur>(URL_RECEPTURY, vyberReceptury);
  const sklad = useDataWidgetu<any[]>(URL_SKLAD, vyberSklad);
  // Kategorie skladu (ne menu) — potřebné, když se surovina zakládá odsud.
  const kategorie = useDataWidgetu(URL_KATEGORIE, vyberKategorie);
  // Návod k položce: „takhle se to dělá" patří vedle „tohle se z toho odepíše".
  const navody = useDataWidgetu(smi('navody.zobrazit') ? URL_NAVODY : null, vyberNavody);

  // Místní úpravy skladu z editoru (upravená nebo nově založená surovina) platí hned,
  // i než se /api/inventory obnoví — jinak by čerstvá surovina v řádku chyběla.
  const [mistniSklad, setMistniSklad] = useState<Record<string, any>>({});
  const items = useMemo(() => {
    const zaklad = sklad.data ?? [];
    const zname = new Set(zaklad.map(i => String(i.id)));
    return [...zaklad.map(i => mistniSklad[String(i.id)] ?? i), ...Object.values(mistniSklad).filter(i => !zname.has(String(i.id)))];
  }, [sklad.data, mistniSklad]);

  const d = data.data;
  const products = d?.produkty ?? [];
  const recipes: Receptura[] = d?.receptury ?? [];
  const [cat, setCat] = useState('Vše');
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [zprava, setZprava] = useState<{ text: string; ton?: 'bad' } | null>(null);
  const [err, setErr] = useState('');
  const nastrojRef = useRef<HTMLDivElement>(null);

  const recipeByProduct = useMemo(() => new Map(recipes.map(r => [r.productId, r])), [recipes]);
  const itemById = useMemo(() => new Map(items.map((i: any) => [String(i.id), i])), [items]);
  const soldByProduct = useMemo(() => new Map((d?.bezReceptury ?? []).map(u => [u.productId, u.prodano])), [d]);

  const openEditor = (productId: string, productName: string) => {
    const r = recipeByProduct.get(productId);
    setErr('');
    setDraft({
      productId, productName, existing: !!r,
      ingredients: r?.ingredients.length
        ? r.ingredients.map(ing => doRadku(String(ing.itemId), ing.amount, itemById.get(String(ing.itemId))))
        : [{ itemId: '', amount: '', unit: 'ks' }],
    });
  };
  const openRef = useRef(openEditor);
  openRef.current = openEditor;

  // Příchod ze skladu („tahle surovina se používá v Blue Lagoon") — otevřeme
  // rovnou jeho recepturu, jakmile jsou data.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (opened || !openProductId || !d || sklad.loading) return;
    const p = products.find(x => x.productId === openProductId);
    const r = recipeByProduct.get(openProductId);
    if (p || r) { openRef.current(openProductId, p?.name ?? r?.productName ?? openProductId); setOpened(true); }
  }, [openProductId, d, sklad.loading, products, recipeByProduct, opened]);

  // Widget „Prodává se, ale neodepisuje" na téže ploše otevře editor tady.
  useEffect(() => {
    const prijmi = (e: Event) => {
      const det = (e as CustomEvent).detail as { productId: string; nazev: string; prijato: boolean };
      if (!det?.productId) return;
      det.prijato = true;
      openRef.current(det.productId, det.nazev);
      requestAnimationFrame(() => nastrojRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    };
    window.addEventListener(UDALOST_OTEVRIT_RECEPTURU, prijmi);
    return () => window.removeEventListener(UDALOST_OTEVRIT_RECEPTURU, prijmi);
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => set.add(p.category || 'Bez kategorie'));
    return ['Vše', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'cs'))];
  }, [products]);

  const q = search.trim();
  const shown = useMemo(() => products.filter(p => {
    if (cat !== 'Vše' && (p.category || 'Bez kategorie') !== cat) return false;
    if (onlyMissing && recipeByProduct.get(p.productId)?.ingredients.length) return false;
    if (q && !obsahujeNekde(q, p.name, p.category)) return false;
    return true;
  }).sort((a, b) => (soldByProduct.get(b.productId) ?? 0) - (soldByProduct.get(a.productId) ?? 0)
    || a.name.localeCompare(b.name, 'cs')),
  [products, cat, onlyMissing, q, recipeByProduct, soldByProduct]);

  /** Co stojí suroviny na jednu porci produktu — a jaká z toho vyjde marže.
   *  Chybí-li u některé suroviny cena nebo balení, vrátíme null: nadhodnocená
   *  marže je horší než žádná, protože se podle ní mění ceny. */
  const economyOf = (productId: string, price: number | null) => {
    const r = recipeByProduct.get(productId);
    if (!r?.ingredients.length) return null;
    const rows = r.ingredients.map(ing => {
      const item = itemById.get(String(ing.itemId));
      return { unitCost: Number(item?.unitCost) || 0, packageSize: Number(item?.packageSize) || 0, amount: Number(ing.amount) || 0 };
    });
    // Jedna surovina bez ceny znamená, že součet není náklad receptury —
    // je to jen jeho část, a ta by marži nafoukla.
    const { total, exact, missingPrice } = recipeCost(rows);
    if (missingPrice > 0) return null;
    // Marže z nezaokrouhleného nákladu: u levného nápoje posune
    // zaokrouhlení na celé koruny procenta o jednotky.
    return { cost: total, marginPct: marginPct(price, exact) };
  };

  const setIng = (idx: number, patch: Partial<Ingredient>) =>
    setDraft(x => x && ({ ...x, ingredients: x.ingredients.map((y, i) => i === idx ? { ...y, ...patch } : y) }));

  /** Uloží recepturu; `smazat` pošle prázdné suroviny rovnou (dřív se čekalo
   *  na překreslení přes setTimeout a odešla stará receptura — nic se nesmazalo). */
  const save = async (smazat = false) => {
    if (!draft) return;
    setSaving(true); setErr('');
    const ingredients = smazat ? [] : draft.ingredients
      .filter(ing => ing.itemId && num(ing.amount) > 0)
      .map(ing => {
        const item = itemById.get(ing.itemId);
        const conv = UNITS[familyOf(item)].find(u => u.label === ing.unit)?.toBase ?? 1;
        const amount = (num(ing.amount) * conv) / itemFactor(item);
        return { itemId: parseInt(ing.itemId), amount: Math.round(amount * 1e6) / 1e6 };
      });
    try {
      await fetch(URL_RECEPTURY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: draft.productId, productName: draft.productName, ingredients }),
      }).then(okJson);
      setDraft(null);
      setZprava({ text: ingredients.length ? 'Receptura uložena.' : 'Receptura smazána.' });
      obnovDataWidgetu(URL_RECEPTURY);
    } catch (e) { setErr(apiMessage(e, 'Uložení se nepodařilo.')); }
    setSaving(false);
  };

  // N1: odpis prodejů přes stejnou synchronizaci jako Nastavení → Pokladna.
  const smiOdepsat = ma('pokladna.synchronizovat') && d?.propojeno === true;
  const sync = async () => {
    setSyncing(true);
    try {
      const r = await fetch('/api/pos/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }),
      }).then(okJson);
      const v = vetaOdpisu(r);
      setZprava({ text: v.text, ton: v.chyba ? 'bad' : undefined });
      obnovDataWidgetu(URL_RECEPTURY);
      obnovDataWidgetu(URL_SKLAD);
    } catch (e) { setZprava({ text: apiMessage(e, 'Odpis se nepodařil.'), ton: 'bad' }); }
    setSyncing(false);
  };

  /** Kolik porcí z balení a co stojí jedna — tady se pozná chyba o řád.
   *  Množství i velikost balení musí být ve stejné jednotce jako položka. */
  const yieldOf = (item: any, amountBase: number) => {
    if (!item || amountBase <= 0) return null;
    const amount = amountBase / itemFactor(item);
    const pkg = Number(item.packageSize) || 0;
    const cost = Number(item.unitCost) || 0;
    const portions = pkg > 0 ? Math.floor(pkg / amount) : null;
    // Nezaokrouhluje se: pět gramů cukru za 25 Kč/kg je dvanáct haléřů
    // a zaokrouhlení po surovině je pošle na nulu. Zaokrouhlí se až součet.
    const perPortion = cost > 0 ? ingredientCost(cost, pkg, amount) : null;
    return { portions, perPortion };
  };

  const hlavicka = {
    title: 'Receptury',
    subtitle: 'Co ze skladu ubude, když se prodá jedna položka. Podle toho se sklad odepisuje sám.',
    hintId: 'recipes',
    secondary: smiOdepsat ? <Button variant="secondary" icon="swap" loading={syncing} onClick={sync}>Odepsat prodeje</Button> : undefined,
    // Vedlejší akce se na telefonu schovají — v „···" musí být i tam.
    menu: smiOdepsat ? [{ label: 'Odepsat prodeje', icon: 'swap', onClick: sync }] : undefined,
  };

  let nastroj: React.ReactNode;
  if (data.error) {
    nastroj = (
      <Card>
        <EmptyState compact icon="warning" title="Receptury se nenačetly" hint={data.error}
          action={<Button variant="secondary" size="sm" onClick={data.reload}>Zkusit znovu</Button>} />
      </Card>
    );
  } else if (!d || sklad.loading) {
    nastroj = (
      <Card aria-busy>
        <Skeleton className="h-11 rounded-2xl" />
        <div className="mt-4 space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      </Card>
    );
  } else if (!d.propojeno) {
    nastroj = (
      <Card>
        <EmptyState icon="receipt" title="Receptury potřebují připojenou pokladnu"
          hint="Propoj pokladnu a pak si u každé položky z menu naklikáš, co a kolik se z ní odepíše ze skladu."
          // Rada, která jmenuje místo, tam musí i zavést — jinak ho člověk hledá v nastavení sám.
          action={onNavigate ? <Button variant="accent" icon="receipt" onClick={() => onNavigate('settings', 'pos')}>Nastavit pokladnu</Button> : undefined} />
      </Card>
    );
  } else if (draft) {
    nastroj = (
      <RecipeEditor
        draft={draft} items={items} itemById={itemById}
        setIng={setIng} setDraft={setDraft} save={save} saving={saving} err={err} yieldOf={yieldOf}
        recipes={recipes} products={products} categories={kategorie.data ?? []}
        smiUpravit={ma('receptury.upravit')}
        guide={(navody.data ?? []).find(g => g.productId === draft.productId) ?? null}
        onItemSaved={patched => { setMistniSklad(m => ({ ...m, [String(patched.id)]: patched })); obnovDataWidgetu(URL_SKLAD); }}
        onItemCreated={created => { setMistniSklad(m => ({ ...m, [String(created.id)]: created })); obnovDataWidgetu(URL_SKLAD); }}
      />
    );
  } else {
    nastroj = (
      <div className="space-y-4">
        {sklad.error && <p className="note note-wait" role="status">Sklad se nenačetl — marže a suroviny teď nespočítám. {sklad.error}</p>}
        {d.chyba && <p className="note note-danger" role="alert">{d.chyba}</p>}
        {/* Procházení menu — hledání, jen chybějící, kategorie */}
        <div className="flex flex-wrap gap-2 items-center">
          <SearchField className="flex-1 min-w-[200px]" value={search} onChange={setSearch}
            placeholder={`Hledat mezi ${products.length} položkami menu…`} storageKey="recipes" ariaLabel="Hledat položku menu" />
          <button type="button" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(v => !v)}
            className={`filter-pill tap-target ${onlyMissing ? 'seg-on' : 'seg-off glass'}`}>
            Jen bez receptury
          </button>
        </div>
        {categories.length > 2 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-thin scroll-fade-x -mx-1 px-1" role="group" aria-label="Kategorie menu">
            {categories.map(c => (
              <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
                className={`filter-pill tap-target whitespace-nowrap shrink-0 ${cat === c ? 'seg-on' : 'seg-off glass'}`}>
                {c}
              </button>
            ))}
          </div>
        )}

        <Card pad="none">
          {shown.length === 0 ? (
            <div className="p-5">
              <EmptyState compact icon="search"
                title={onlyMissing ? 'Všechno tady má recepturu' : 'Nic nenalezeno'}
                hint={onlyMissing ? 'V téhle kategorii se každý prodej odepisuje ze skladu.' : 'Zkus jiné hledání nebo kategorii.'} />
            </div>
          ) : (
            <ul className="list px-5">
              {shown.slice(0, LIMIT).map(p => {
                const r = recipeByProduct.get(p.productId);
                const sRec = !!r?.ingredients.length;
                const sold = soldByProduct.get(p.productId) ?? 0;
                const eco = economyOf(p.productId, p.price ?? null);
                return (
                  <li key={p.productId}>
                    <ListRow as="div" title={p.name}
                      meta={sRec
                        ? r!.ingredients.map(ing => `${Number(ing.amount).toLocaleString('cs-CZ', { maximumFractionDigits: 3 })} ${ing.itemUnit ?? ''} ${ing.itemName ?? '?'}`.replace(/\s+/g, ' ').trim()).join(' + ')
                        : (p.category || 'bez kategorie')}
                      value={eco?.marginPct != null ? <span className={tonMarze(eco.marginPct)}>{eco.marginPct} %</span> : undefined}
                      valueMeta={eco ? `náklad ${money(eco.cost)}` : undefined}
                      aside={sold > 0 ? `prodáno ${sold}×` : undefined}
                      right={sRec ? undefined : <Chip tone="wait" size="sm">bez receptury</Chip>}
                      onClick={() => openEditor(p.productId, p.name)} />
                  </li>
                );
              })}
            </ul>
          )}
          {/* Strop tu byl vždycky, jen o něm nikdo nevěděl: podnik s 250
              položkami menu jich padesát nikdy neuviděl a nikde se to
              nedozvěděl. Řádek to říká nahlas a rovnou nabídne hledání. */}
          {shown.length > LIMIT && (
            <p className="t-meta px-5 pb-4 text-pretty">
              Zobrazeno prvních {LIMIT} z {shown.length} položek. Zbytek najdeš přes hledání nahoře, nebo si vyber kategorii.
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <>
      <PlochaWidgetu stranka="vedeni.receptury" hlavicka={hlavicka} nastroj={<div ref={nastrojRef} className="scroll-mt-4">{nastroj}</div>} />
      {zprava && <Toast message={zprava.text} tone={zprava.ton} onClose={() => setZprava(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Editor jedné receptury. Množství se zadává v jednotce, kterou má člověk v
// ruce, a hned pod ním je vidět, kolik porcí z balení vyjde a co stojí — na
// tom se chyba o řád (0,02 l vs 0,2 l) pozná dřív, než se odepíše sklad.
// ---------------------------------------------------------------------------
function RecipeEditor({ draft, items, itemById, setIng, setDraft, save, saving, err, yieldOf, recipes, products, categories, smiUpravit, guide, onItemSaved, onItemCreated }: {
  draft: Draft; items: any[]; itemById: Map<string, any>;
  setIng: (idx: number, patch: Partial<Ingredient>) => void;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  save: (smazat?: boolean) => void; saving: boolean; err: string;
  yieldOf: (item: any, amountBase: number) => { portions: number | null; perPortion: number | null } | null;
  recipes: Receptura[]; products: { productId: string; name: string; price: number | null }[]; categories: { id: number; name: string }[];
  smiUpravit: boolean;
  guide: { id: number; title: string } | null;
  onItemSaved: (item: any) => void;
  onItemCreated: (item: any) => void;
}) {
  const money = useMoney();
  // Surovina může stát míň než korunu; `money` by dvanáct haléřů cukru
  // ukázal jako „0 Kč" a marže by pak seděla na sto procentech.
  const cena = useCost();
  const uid = useId();
  // Která surovina se zrovna upravuje „na místě" — bez odcházení do skladu.
  const [editingItem, setEditingItem] = useState<string | null>(null);
  // Zakládání nové suroviny: index řádku, do kterého se má vložit, nebo -1 pro nový řádek na konci.
  const [creatingAt, setCreatingAt] = useState<number | null>(null);
  const [mazani, setMazani] = useState(false);

  const nameOfProduct = (r: Receptura) => products.find(p => p.productId === r.productId)?.name ?? r.productName ?? r.productId;
  const copyable = recipes
    .filter(r => r.productId !== draft.productId && r.ingredients.length)
    .sort((a, b) => nameOfProduct(a).localeCompare(nameOfProduct(b), 'cs'));

  /** Převezme suroviny z jiné receptury — nápoje se liší jedním sirupem. */
  const copyFrom = (productId: string) => {
    const src = copyable.find(r => r.productId === productId);
    if (!src) return;
    setDraft(x => x && ({ ...x, ingredients: src.ingredients.map(ing => doRadku(String(ing.itemId), ing.amount, itemById.get(String(ing.itemId)))) }));
  };
  const costRows = draft.ingredients.map(ing => {
    const item = itemById.get(ing.itemId);
    // Neznámá surovina (smazaná ze skladu) je díra v součtu, ne nula: množství bez ceny
    // recipeCost započte jako chybějící cenu a marže se neukáže nafouknutá.
    if (!item) return { unitCost: 0, packageSize: 0, amount: ing.itemId ? num(ing.amount) : 0 };
    const conv = UNITS[familyOf(item)].find(u => u.label === ing.unit)?.toBase ?? 1;
    return { unitCost: Number(item.unitCost) || 0, packageSize: Number(item.packageSize) || 0, amount: (num(ing.amount) * conv) / itemFactor(item) };
  });
  // Stejný výpočet jako v seznamu — editor a seznam ukazují u téže receptury totéž číslo.
  const cost = recipeCost(costRows);
  const totalCost = cost.total;

  const menuPrice = products.find(p => p.productId === draft.productId)?.price ?? null;
  const margin = cost.exact > 0 ? marginPct(menuPrice, cost.exact) : null;
  const ready = draft.ingredients.filter(i => i.itemId && num(i.amount) > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>Zpět na seznam</Button>
        <div className="min-w-0 flex-1">
          <h2 className="t-section truncate">{draft.productName}</h2>
          <p className="t-meta">
            {ready === 0 ? 'Zatím bez surovin' : `${czCount(ready, SUROVINA)} v receptuře`}
            {menuPrice != null && <span> · v kase za {money(menuPrice)}</span>}
          </p>
        </div>
      </div>

      {/* Práce je vlevo, čísla vpravo. Editor dřív seděl v úzkém sloupci
          uprostřed a půlka obrazovky zůstala prázdná. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-4 items-start">
        <Card className="space-y-4 min-w-0">
          {/* Opisovat kvůli jednomu sirupu celou recepturu znovu je práce
              navíc, kterou nikdo neudělá — a produkt zůstane bez receptury. */}
          {smiUpravit && copyable.length > 0 && draft.ingredients.every(i => !i.itemId) && (
            <Field id={`${uid}-prevzit`} label="Převzít z jiné položky">
              <Select id={`${uid}-prevzit`} value="" onChange={e => copyFrom(e.target.value)} className="sm:max-w-sm">
                <option value="">Vyber recepturu</option>
                {copyable.map(r => <option key={r.productId} value={r.productId}>{nameOfProduct(r)} ({r.ingredients.length})</option>)}
              </Select>
            </Field>
          )}

          <ul className="space-y-3">
            {draft.ingredients.map((ing, idx) => {
              const item = itemById.get(ing.itemId);
              const opts = UNITS[familyOf(item)];
              const conv = opts.find(u => u.label === ing.unit)?.toBase ?? 1;
              const y = item ? yieldOf(item, num(ing.amount) * conv) : null;
              const idPolozky = `${uid}-s${idx}`;
              return (
                <Well as="li" key={idx} className="space-y-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <Field id={idPolozky} label="Surovina" className="flex-1 min-w-[12rem]">
                      <Select id={idPolozky} value={ing.itemId} disabled={!smiUpravit}
                        onChange={e => {
                          const next = itemById.get(e.target.value);
                          setIng(idx, { itemId: e.target.value, unit: UNITS[familyOf(next)][0].label });
                        }}>
                        <option value="">Vyber ze skladu</option>
                        {items.filter((i: any) => i.archived !== true || String(i.id) === ing.itemId).map((i: any) => (
                          <option key={i.id} value={i.id}>{i.archived === true ? `${i.name} (archivovaná)` : i.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field id={`${idPolozky}-m`} label="Množství" className="w-full sm:w-28">
                      <Input id={`${idPolozky}-m`} inputMode="decimal" value={ing.amount} disabled={!smiUpravit}
                        onChange={e => setIng(idx, { amount: e.target.value })} placeholder="0,02" className="text-center font-semibold tabular-nums" />
                    </Field>
                    {opts.length > 1 && (
                      <Segmented size="sm" ariaLabel={`Jednotka — ${item?.name ?? 'surovina'}`} value={ing.unit}
                        options={opts.map(u => ({ id: u.label, label: u.label }))} onChange={u => smiUpravit && setIng(idx, { unit: u })} />
                    )}
                    {smiUpravit && (
                      <Button variant="ghost" size="sm" iconOnly icon="close" className="tap-target" aria-label={`Odebrat surovinu ${item?.name ?? idx + 1}`}
                        onClick={() => setDraft(x => x && ({ ...x, ingredients: x.ingredients.filter((_, i) => i !== idx) }))} />
                    )}
                  </div>
                  {/* Díly položky — definované u ní, tady se jen vyberou. */}
                  {smiUpravit && item && Array.isArray(item.portions) && item.portions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Díly — ${item.name}`}>
                      <span className="t-meta">Díly:</span>
                      {item.portions.map((pt: any) => {
                        const active = Math.abs((num(ing.amount) * conv) / itemFactor(item) - Number(pt.amount)) < 1e-9;
                        return (
                          <button key={pt.name} type="button" aria-pressed={active}
                            onClick={() => { const r = doRadku(ing.itemId, Number(pt.amount), item); setIng(idx, { amount: r.amount, unit: r.unit }); }}
                            className={`filter-pill tap-target ${active ? 'seg-on' : 'seg-off glass'}`}>
                            {pt.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {item && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 t-meta">
                      {num(ing.amount) > 0 && (y?.portions != null
                        ? <span>Z balení ({Number(item.packageSize).toLocaleString('cs-CZ')} {item.contentUnit ?? item.unit}) vyjde <b className="font-semibold text-[#16181A] tabular-nums">{y.portions}×</b></span>
                        : <span className="text-wait-ink">Chybí velikost balení — porce ani cenu nespočítám.</span>)}
                      {y?.perPortion != null && <span>· surovina za porci <b className="font-semibold text-[#16181A] tabular-nums">{cena(y.perPortion)}</b></span>}
                      {num(ing.amount) > 0 && y?.perPortion == null && !(Number(item.unitCost) > 0) && <span className="text-wait-ink">· chybí cena za balení</span>}
                      {smiUpravit && (
                        <Button variant="ghost" size="sm" icon={editingItem === ing.itemId ? 'close' : 'pencil'} aria-expanded={editingItem === ing.itemId}
                          onClick={() => setEditingItem(editingItem === ing.itemId ? null : ing.itemId)}>
                          {editingItem === ing.itemId ? 'Zavřít úpravu' : 'Upravit položku a díly'}
                        </Button>
                      )}
                    </div>
                  )}

                  {item && editingItem === ing.itemId && (
                    <ItemInlineEdit item={item} onSaved={patched => onItemSaved(patched)} onClose={() => setEditingItem(null)} />
                  )}
                </Well>
              );
            })}
          </ul>

          {/* Surovina, kterou sklad ještě nezná, se dá založit rovnou tady —
              jinak se pro ni odchází jinam a receptura zůstane nedodělaná. */}
          {smiUpravit && (creatingAt != null ? (
            <NewIngredientInline
              categories={categories}
              onCancel={() => setCreatingAt(null)}
              onCreated={created => {
                onItemCreated(created);
                const row = { itemId: String(created.id), amount: '', unit: UNITS[familyOf(created)][0].label };
                setDraft(x => {
                  if (!x) return x;
                  const next = [...x.ingredients];
                  // Prázdný řádek, ze kterého se zakládalo, se surovinou nahradíme; jinak ji přidáme na konec.
                  if (creatingAt >= 0 && next[creatingAt] && !next[creatingAt].itemId) next[creatingAt] = row;
                  else next.push(row);
                  return { ...x, ingredients: next };
                });
                setCreatingAt(null);
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" icon="plus"
                onClick={() => setDraft(x => x && ({ ...x, ingredients: [...x.ingredients, { itemId: '', amount: '', unit: 'ks' }] }))}>
                Další surovina
              </Button>
              <Button variant="ghost" size="sm" icon="box" onClick={() => setCreatingAt(draft.ingredients.findIndex(i => !i.itemId))}>
                Založit novou surovinu
              </Button>
            </div>
          ))}
        </Card>

        {/* Souhrn: co to stojí, co z toho zbude, a uložení na dosah. */}
        <Card as="div" className="space-y-4 lg:sticky lg:top-4">
          <Stat label="Suroviny na porci" value={totalCost > 0 ? money(totalCost) : '—'}
            note={totalCost > 0 ? 'podle cen ve skladu' : 'doplň množství a ceny balení'} />

          {menuPrice != null && (
            <Well className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-black/55">Cena v kase</span>
                <span className="font-semibold tabular-nums text-[#16181A]">{money(menuPrice)}</span>
              </div>
              {margin != null && (
                <>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-black/55">Zbyde na porci</span>
                    <span className="font-semibold tabular-nums text-[#16181A]">{money(menuPrice - totalCost)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden mt-1.5" aria-hidden>
                    <div className={`h-full rounded-full ${margin >= 65 ? 'bg-[#C8F542]' : margin >= 45 ? 'bg-wait' : 'bg-bad'}`}
                      style={{ width: `${Math.max(0, Math.min(100, margin))}%` }} />
                  </div>
                  <p className={`text-[13px] font-semibold ${margin >= 65 ? 'text-ok-ink' : margin >= 45 ? 'text-wait-ink' : 'text-bad-ink'}`}>
                    marže {margin} %
                  </p>
                </>
              )}
            </Well>
          )}

          {err && <p className="note note-danger" role="alert">{err}</p>}
          {smiUpravit ? (
            <div className="space-y-2">
              <Button variant="accent" className="w-full" loading={saving} onClick={() => save()}>Uložit recepturu</Button>
              {draft.existing && (
                <Button variant="danger" className="w-full" disabled={saving} onClick={() => setMazani(true)}>Smazat recepturu</Button>
              )}
            </div>
          ) : (
            <p className="t-meta">Recepturu mění jen ten, kdo smí receptury upravovat.</p>
          )}

          {guide && (
            <a href={`/employer/overview?view=guides&guide=${guide.id}`} className="btn btn-secondary btn-sm w-full min-w-0">
              <Icon name="book" size={15} className="shrink-0" />
              <span className="min-w-0 truncate">Návod: {guide.title}</span>
            </a>
          )}

          <p className="t-meta">Uloženou recepturu odepisuje synchronizace s pokladnou po každém prodeji.</p>
        </Card>
      </div>

      <Modal open={mazani} onClose={() => setMazani(false)} size="sm" title="Smazat recepturu?"
        footer={<>
          <Button variant="secondary" onClick={() => setMazani(false)}>Zrušit</Button>
          <Button variant="danger-solid" loading={saving} onClick={() => { setMazani(false); save(true); }}>Smazat recepturu</Button>
        </>}>
        <p className="t-meta">Prodeje „{draft.productName}" se pak ze skladu přestanou odepisovat, dokud recepturu znovu nesložíš.</p>
      </Modal>
    </div>
  );
}
