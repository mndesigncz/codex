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
import SkladZalozky from './SkladZalozky';
import { polozkaArg } from '@/lib/skladPredani';
import { apiMessage, okJson } from '@/lib/api';
import { recipeCost, ingredientCost, marginPct } from '@/lib/recipeCost';
import { obsahujeNekde } from '@/lib/hledani';
import { JEDNOTKY_RODIN, rodinaJednotky, faktorJednotky } from '@/lib/jednotky';
import { baleniPolozky, jednotkaPolozky } from '@/lib/packaging';
import { tg } from '@/lib/i18n/stav';
import { useJazyk, useT } from '@/lib/i18n/client';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
import {
  vyberReceptury, vetaOdpisu, tonMarze, jePodCilem, cilMarze, seradReceptury, RAZENI_RECEPTUR,
  type DataReceptur, type Receptura, type RazeniReceptur, type TonMarze,
} from '@/lib/recepturyPrehled';
import {
  Avatar, Button, Card, Chip, EmptyState, Field, Input, ListRow, Menu, Modal, SearchField, Segmented, Select, Skeleton, Stat, Textarea, Toast, Well,
} from '../ui';
import type { StavDat } from '../widgety/useDataWidgetu';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { Poznamky } from '../Poznamky';
import { urlPoctu, vyberPocty } from '@/lib/poznamky';
import { useSmi } from '../widgety/NavigaceKontext';
import { useOpravneni } from '../role/useOpravneni';
import { URL_RECEPTURY, URL_HISTORIE, URL_NAVRHY, UDALOST_OTEVRIT_RECEPTURU, RadkyRozdilu, stavNavrhuText } from '../widgety/oblasti/receptury';
import {
  cekajiciNavrhy, dopadNaPorci, jeBezeZmeny, mnozstviText, mujPosledniNavrh, odkazNaNavodZEditoru, rezimEditoru, rozdilVerzi, vyberHistorii, vyberNavrhy,
  MAX_DELKA_DUVODU, type NavrhReceptury, type RezimEditoru, type VerzeReceptury,
} from '@/lib/recepturyVerze';
import { fmtDatum } from '@/lib/i18n/format';
import { dbTimeDayHM } from '@/lib/pragueTime';

const URL_SKLAD = '/api/inventory';
const URL_KATEGORIE = '/api/inventory/categories';
const URL_NAVODY = '/api/guides';

type Ingredient = { itemId: string; amount: string; unit: string };
type Draft = { productId: string; productName: string; ingredients: Ingredient[]; existing: boolean };

/** Vnitřní hodnoty filtru kategorií (zobrazují se přeložené, porovnávají se tyhle). */
const VSE = 'Vše';
const BEZ_KATEGORIE = 'Bez kategorie';

/** Jednotky, ve kterých se dá zadávat, a jejich převod na základní (l / kg / ks) — společné s kroky návodů (lib/jednotky). */
const UNITS = JEDNOTKY_RODIN;

/** Do které rodiny jednotek položka patří — podle jednotky, v níž je vedená
 *  (obsah u balených, včetně zděděného z kategorie). */
function familyOf(item: any): 'l' | 'kg' | 'ks' {
  return rodinaJednotky(jednotkaPolozky(item));
}

/** Číslo z pole, které přijme i desetinnou čárku — píše se tak česky. */
const num = (s: string) => Number(String(s).replace(',', '.')) || 0;

/** Kolik základní jednotky (l, kg) je jedna jednotka, ve které je vedená
 *  položka. Receptura se ukládá v jednotce položky, protože v ní je i
 *  velikost balení a cena — jinak by se z tabáku vedeného v gramech
 *  odepisovalo tisíckrát míň, než se opravdu použije. */
function itemFactor(item: any): number {
  return faktorJednotky(jednotkaPolozky(item));
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

/** Marže v seznamu tónem stavu proti cíli podniku (lib/recepturyPrehled.tonMarze); „ujde" inkoustem jako dřív. */
const TEXT_MARZE: Record<TonMarze, string> = { ok: 'text-ok-ink', wait: 'text-[#16181A]', bad: 'text-bad-ink' };
/** Pruh a věta marže v editoru — stejné prahy, „ujde" tady žlutě (je to stav jedné receptury, ne sloupec čísel). */
const PRUH_MARZE: Record<TonMarze, string> = { ok: 'bg-[#C8F542]', wait: 'bg-wait', bad: 'bg-bad' };
const VETA_MARZE: Record<TonMarze, string> = { ok: 'text-ok-ink', wait: 'text-wait-ink', bad: 'text-bad-ink' };

/** Řazení seznamu si prohlížeč pamatuje (jako Sklad); soukromé okno ho jen nezapamatuje. */
const KLIC_RAZENI = 'managero-receptury-razeni';
const nactiRazeni = (): RazeniReceptur => {
  try { const v = localStorage.getItem(KLIC_RAZENI); return (RAZENI_RECEPTUR as readonly string[]).includes(v ?? '') ? (v as RazeniReceptur) : 'prodeje'; }
  catch { return 'prodeje'; }
};
const vyberCil = (raw: any): { cil: number | null } => ({ cil: cilMarze(raw?.team?.margin_target_pct) });

// Typ je pojmenovaný, aby ho uneslo i líné načtení: u parametru s výchozí
// hodnotou (`= {}`) se props z `import()` samy neodvodí.
export interface RecipesViewProps {
  openProductId?: string;
  onNavigate?: (view: string, arg?: string) => void;
  /** Plocha, na které se stránka kreslí: vedení (výchozí) nebo zaměstnanec (kolo 5 — receptury i pro tým). */
  stranka?: 'vedeni.receptury' | 'zamestnanec.receptury';
}

// Archivované suroviny zůstávají: receptura je může pořád obsahovat a bez nich by editor
// ukázal prázdný řádek a marže by se spočítala jen z části surovin. Z nabídky se skrývají
// až v Selectu (kromě právě vybrané).
const vyberSklad = (raw: unknown): any[] => (Array.isArray(raw) ? raw.filter((i: any) => i && i.approved !== false) : []);
const vyberKategorie = (raw: unknown) => (Array.isArray(raw) ? raw.map((c: any) => ({ id: Number(c.id), name: String(c.name) })) : []);
const vyberNavody = (raw: any): { id: number; title: string; productId: string | null }[] =>
  (Array.isArray(raw?.guides) ? raw.guides.filter((x: any) => x.productId) : []);

export default function RecipesView({ openProductId, onNavigate, stranka = 'vedeni.receptury' }: RecipesViewProps = {}) {
  // Data (návody) přísně přes useSmi — bez jistoty se neptat; tlačítka přes
  // `ma` jako Sklad: do načtení oprávnění ANO, rozhodne server.
  const t = useT('sklad');
  const { jazyk } = useJazyk();
  const smi = useSmi();
  const { ma } = useOpravneni();
  const money = useMoney();
  const data = useDataWidgetu<DataReceptur>(URL_RECEPTURY, vyberReceptury);
  const sklad = useDataWidgetu<any[]>(URL_SKLAD, vyberSklad);
  // Kategorie skladu (ne menu) — potřebné, když se surovina zakládá odsud.
  const kategorie = useDataWidgetu(URL_KATEGORIE, vyberKategorie);
  // Návod k položce: „takhle se to dělá" patří vedle „tohle se z toho odepíše".
  const navody = useDataWidgetu(smi('navody.zobrazit') ? URL_NAVODY : null, vyberNavody);
  // Cílová marže podniku (Nastavení › Profil podniku); stejná adresa jako Provoz podniku a Tým.
  const tym = useDataWidgetu('/api/teams', vyberCil);
  const cil = tym.data?.cil ?? null;
  // Kolo 8 (R8-5): kdo smí jen navrhovat, posílá návrh ke schválení; návrhy a historie verzí
  // se čtou přes sdílenou mezipaměť (widget Receptury čte tytéž adresy).
  const rezim: RezimEditoru = rezimEditoru(ma);
  const navrhy = useDataWidgetu<NavrhReceptury[]>(smi(['receptury.navrhnout', 'receptury.upravit']) ? URL_NAVRHY : null, vyberNavrhy);
  const [navrhuji, setNavrhuji] = useState(false);
  // Bublina „💬 3" v řádku: kolik poznámek pod recepturou je, tučně když od poslední návštěvy přibyla cizí.
  const pocty = useDataWidgetu(urlPoctu('recipe'), vyberPocty);
  // Verze načtená z historie do editoru — uložení ji zapíše s poznámkou „Vráceno na verzi z …".
  const [poznamkaVerze, setPoznamkaVerze] = useState<string | null>(null);

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
  const [cat, setCat] = useState(VSE);
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [podCilem, setPodCilem] = useState(false);
  const [razeni, setRazeniStav] = useState<RazeniReceptur>('prodeje');
  useEffect(() => { setRazeniStav(nactiRazeni()); }, []);
  const setRazeni = (r: RazeniReceptur) => { setRazeniStav(r); try { localStorage.setItem(KLIC_RAZENI, r); } catch { /* soukromé okno */ } };
  const [draft, setDraft] = useState<Draft | null>(null);
  const historie = useDataWidgetu<VerzeReceptury[]>(draft ? `${URL_HISTORIE}?productId=${encodeURIComponent(draft.productId)}` : null, vyberHistorii);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [zprava, setZprava] = useState<{ text: string; ton?: 'bad' } | null>(null);
  const [err, setErr] = useState('');
  const nastrojRef = useRef<HTMLDivElement>(null);

  const recipeByProduct = useMemo(() => new Map(recipes.map(r => [r.productId, r])), [recipes]);
  const itemById = useMemo(() => new Map(items.map((i: any) => [String(i.id), i])), [items]);
  const soldByProduct = useMemo(() => new Map((d?.bezReceptury ?? []).map(u => [u.productId, u.prodano])), [d]);
  // Produkty s návrhem, který čeká — v seznamu dostanou Chip, ať je fronta vidět tam, kde se receptury hledají.
  const sNavrhem = useMemo(() => new Set(cekajiciNavrhy(navrhy.data ?? []).map(n => n.productId)), [navrhy.data]);

  const openEditor = (productId: string, productName: string) => {
    const r = recipeByProduct.get(productId);
    setErr('');
    setPoznamkaVerze(null);
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
    products.forEach(p => set.add(p.category || BEZ_KATEGORIE));
    return [VSE, ...Array.from(set).sort((a, b) => a.localeCompare(b, LOCALE_PRO_JAZYK[jazyk]))];
  }, [products, jazyk]);

  /** Co stojí suroviny na jednu porci produktu — a jaká z toho vyjde marže.
   *  Chybí-li u některé suroviny cena nebo balení, vrátíme null: nadhodnocená
   *  marže je horší než žádná, protože se podle ní mění ceny. */
  const economyOf = (productId: string, price: number | null) => {
    const r = recipeByProduct.get(productId);
    if (!r?.ingredients.length) return null;
    const rows = r.ingredients.map(ing => {
      const item = itemById.get(String(ing.itemId));
      return { unitCost: Number(item?.unitCost) || 0, packageSize: baleniPolozky(item).packageSize ?? 0, amount: Number(ing.amount) || 0 };
    });
    // Jedna surovina bez ceny znamená, že součet není náklad receptury —
    // je to jen jeho část, a ta by marži nafoukla.
    const { total, exact, missingPrice } = recipeCost(rows);
    if (missingPrice > 0) return null;
    // Marže z nezaokrouhleného nákladu: u levného nápoje posune
    // zaokrouhlení na celé koruny procenta o jednotky.
    return { cost: total, marginPct: marginPct(price, exact) };
  };
  // Ekonomika všech položek najednou: podle ní se řadí, počítá „Pod cílem" i kreslí řádek.
  const ekonomika = useMemo(() => new Map(products.map(p => [p.productId, economyOf(p.productId, p.price ?? null)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, recipeByProduct, itemById]);

  const q = search.trim();
  // Filtry kromě „Pod cílem" — z nich se počítá číslo na pilulce (co by klepnutí ukázalo).
  const zakladSeznamu = useMemo(() => products.filter(p => {
    if (cat !== VSE && (p.category || BEZ_KATEGORIE) !== cat) return false;
    if (onlyMissing && recipeByProduct.get(p.productId)?.ingredients.length) return false;
    if (q && !obsahujeNekde(q, p.name, p.category)) return false;
    return true;
  }), [products, cat, onlyMissing, q, recipeByProduct]);
  const nPodCilem = useMemo(() => zakladSeznamu.filter(p => jePodCilem(ekonomika.get(p.productId)?.marginPct, cil)).length, [zakladSeznamu, ekonomika, cil]);
  const shown = useMemo(() => seradReceptury(
    zakladSeznamu
      .filter(p => !podCilem || jePodCilem(ekonomika.get(p.productId)?.marginPct, cil))
      .map(p => ({ p, nazev: p.name, prodano: soldByProduct.get(p.productId) ?? 0, marze: ekonomika.get(p.productId)?.marginPct ?? null, naklad: ekonomika.get(p.productId)?.cost ?? null })),
    razeni, LOCALE_PRO_JAZYK[jazyk],
  ).map(x => x.p), [zakladSeznamu, podCilem, ekonomika, cil, soldByProduct, razeni, jazyk]);
  const NAZVY_RAZENI: Record<RazeniReceptur, string> = {
    prodeje: t('Podle prodejů'), marze: t('Marže od nejnižší'), naklad: t('Náklad od nejvyššího'), nazev: t('Podle názvu'),
  };

  const setIng = (idx: number, patch: Partial<Ingredient>) =>
    setDraft(x => x && ({ ...x, ingredients: x.ingredients.map((y, i) => i === idx ? { ...y, ...patch } : y) }));

  /** Suroviny z editoru v jednotce položky (tak se ukládají i navrhují). */
  const surovinyZDraftu = (dr: Draft) => dr.ingredients
    .filter(ing => ing.itemId && num(ing.amount) > 0)
    .map(ing => {
      const item = itemById.get(ing.itemId);
      const conv = UNITS[familyOf(item)].find(u => u.label === ing.unit)?.toBase ?? 1;
      const amount = (num(ing.amount) * conv) / itemFactor(item);
      return { itemId: parseInt(ing.itemId), amount: Math.round(amount * 1e6) / 1e6 };
    });

  /** Uloží recepturu; `smazat` pošle prázdné suroviny rovnou (dřív se čekalo
   *  na překreslení přes setTimeout a odešla stará receptura — nic se nesmazalo).
   *  `costPerPortion` jde do historie jako snímek nákladu porce. */
  const save = async (smazat = false, costPerPortion: number | null = null) => {
    if (!draft) return;
    setSaving(true); setErr('');
    const ingredients = smazat ? [] : surovinyZDraftu(draft);
    try {
      await fetch(URL_RECEPTURY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: draft.productId, productName: draft.productName, ingredients, costPerPortion, note: poznamkaVerze }),
      }).then(okJson);
      setDraft(null);
      setPoznamkaVerze(null);
      setZprava({ text: ingredients.length ? t('Receptura uložena.') : t('Receptura smazána.') });
      obnovDataWidgetu(URL_RECEPTURY);
      obnovDataWidgetu(URL_HISTORIE);
    } catch (e) { setErr(apiMessage(e, t('Uložení se nepodařilo.'))); }
    setSaving(false);
  };

  /** Návrh změny ke schválení (receptury.navrhnout bez receptury.upravit). */
  const navrhni = async (reason: string, costPerPortion: number | null, puvodniCost: number | null) => {
    if (!draft) return;
    setNavrhuji(true); setErr('');
    try {
      await fetch(URL_NAVRHY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: draft.productId, productName: draft.productName, ingredients: surovinyZDraftu(draft), reason, costPerPortion, puvodniCost }),
      }).then(okJson);
      setDraft(null);
      setZprava({ text: t('Návrh odeslán — vedení dostalo oznámení a rozhodne.') });
      obnovDataWidgetu(URL_NAVRHY);
    } catch (e) { setErr(apiMessage(e, t('Návrh se nepodařilo odeslat.'))); }
    setNavrhuji(false);
  };

  /** Verze z historie do editoru — platit začne až uložením (žádný tichý zápis). */
  const obnovVerzi = (v: VerzeReceptury) => {
    setDraft(x => x && ({ ...x, ingredients: v.ingredients.length
      ? v.ingredients.map(ing => doRadku(String(ing.itemId), ing.amount, itemById.get(String(ing.itemId))))
      : [{ itemId: '', amount: '', unit: 'ks' }] }));
    setPoznamkaVerze(`Vráceno na verzi z ${fmtDatum(v.changedAt, { jazyk: 'cs', styl: 'kratce' })}`); // i18n-ok (poznámka do historie, česky jako audit)
    setZprava({ text: t('Verze načtena do editoru — platit začne, až recepturu uložíš.') });
  };

  // N1: odpis prodejů přes stejnou synchronizaci jako Nastavení → Pokladna.
  const smiOdepsat = ma('pokladna.synchronizovat') && d?.propojeno === true;
  const sync = async () => {
    setSyncing(true);
    try {
      const r = await fetch('/api/pos/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }),
      }).then(okJson);
      const v = vetaOdpisu(r, t);
      setZprava({ text: v.text, ton: v.chyba ? 'bad' : undefined });
      obnovDataWidgetu(URL_RECEPTURY);
      obnovDataWidgetu(URL_SKLAD);
    } catch (e) { setZprava({ text: apiMessage(e, t('Odpis se nepodařil.')), ton: 'bad' }); }
    setSyncing(false);
  };

  /** Kolik porcí z balení a co stojí jedna — tady se pozná chyba o řád.
   *  Množství i velikost balení musí být ve stejné jednotce jako položka. */
  const yieldOf = (item: any, amountBase: number) => {
    if (!item || amountBase <= 0) return null;
    const amount = amountBase / itemFactor(item);
    const pkg = baleniPolozky(item).packageSize ?? 0;
    const cost = Number(item.unitCost) || 0;
    const portions = pkg > 0 ? Math.floor(pkg / amount) : null;
    // Nezaokrouhluje se: pět gramů cukru za 25 Kč/kg je dvanáct haléřů
    // a zaokrouhlení po surovině je pošle na nulu. Zaokrouhlí se až součet.
    const perPortion = cost > 0 ? ingredientCost(cost, pkg, amount) : null;
    return { portions, perPortion };
  };

  const hlavicka = {
    title: t('Receptury'),
    subtitle: t('Co ze skladu ubude, když se prodá jedna položka. Podle toho se sklad odepisuje sám.'),
    hintId: 'recipes',
    secondary: smiOdepsat ? <Button variant="secondary" icon="swap" loading={syncing} onClick={sync}>{t('Odepsat prodeje')}</Button> : undefined,
    // Vedlejší akce se na telefonu schovají — v „···" musí být i tam.
    menu: smiOdepsat ? [{ label: t('Odepsat prodeje'), icon: 'swap', onClick: sync }] : undefined,
    // Sklad › Položky / Receptury z kasy / Inventura — stejné záložky jako na Skladu (kolo 82),
    // takže se z receptur chodí na položky a zpět jedním klepnutím.
    // Inventura je okno nad Skladem vedení; zaměstnanec má zápis stavu rovnou ve svém Skladu.
    aside: <SkladZalozky aktivni="receptury" onNavigate={onNavigate} smiReceptury
      smiInventura={stranka === 'vedeni.receptury' && smi('inventura.pocitat') && smi('sklad.zobrazit')} />,
  };

  let nastroj: React.ReactNode;
  if (data.error) {
    nastroj = (
      <Card>
        <EmptyState compact icon="warning" title={t('Receptury se nenačetly')} hint={data.error}
          action={<Button variant="secondary" size="sm" onClick={data.reload}>{t('Zkusit znovu')}</Button>} />
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
        <EmptyState icon="receipt" title={t('Receptury potřebují připojenou pokladnu')}
          hint={t('Propoj pokladnu a pak si u každé položky z menu naklikáš, co a kolik se z ní odepíše ze skladu.')}
          // Rada, která jmenuje místo, tam musí i zavést — jinak ho člověk hledá v nastavení sám.
          action={onNavigate ? <Button variant="accent" icon="receipt" onClick={() => onNavigate('settings', 'pos')}>{t('Nastavit pokladnu')}</Button> : undefined} />
      </Card>
    );
  } else if (draft) {
    nastroj = (
      <RecipeEditor
        draft={draft} items={items} itemById={itemById}
        setIng={setIng} setDraft={setDraft} save={save} saving={saving} err={err} yieldOf={yieldOf}
        recipes={recipes} products={products} categories={kategorie.data ?? []} cil={cil}
        smiUpravit={rezim !== 'cist'}
        rezim={rezim}
        historie={historie}
        navrh={mujPosledniNavrh(navrhy.data ?? [], draft.productId)}
        onNavrhnout={navrhni} navrhuji={navrhuji}
        onObnovitVerzi={obnovVerzi}
        poznamkaVerze={poznamkaVerze}
        guide={(navody.data ?? []).find(g => g.productId === draft.productId) ?? null}
        // Návod se otvírá podle rozhraní (zaměstnanec /employee, vedení /employer), ne natvrdo (R8-5):
        // přes navigaci stránky, a jen bez ní odkazem.
        onOpenGuide={onNavigate ? (id => onNavigate('guides', String(id))) : undefined}
        guideHref={id => odkazNaNavodZEditoru(stranka, id)}
        onItemSaved={patched => { setMistniSklad(m => ({ ...m, [String(patched.id)]: patched })); obnovDataWidgetu(URL_SKLAD); }}
        onItemCreated={created => { setMistniSklad(m => ({ ...m, [String(created.id)]: created })); obnovDataWidgetu(URL_SKLAD); }}
        // Proklik na celou položku ve Skladu (prahy, dodavatel, výroba) — druhý směr k „Používá se v kase" u položky.
        onOpenItem={onNavigate && smi('sklad.zobrazit') ? (id => onNavigate('inventory', polozkaArg(id))) : undefined}
      />
    );
  } else {
    nastroj = (
      <div className="space-y-4">
        {sklad.error && <p className="note note-wait" role="status">{t('Sklad se nenačetl — marže a suroviny teď nespočítám.')} {sklad.error}</p>}
        {d.chyba && <p className="note note-danger" role="alert">{t(d.chyba)}</p>}
        {/* Procházení menu — hledání; pod ním (na monitoru vedle) filtry a řazení v jednom pásu */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <SearchField className="flex-1 min-w-0" value={search} onChange={setSearch}
            placeholder={t('Hledat mezi {n} položkami menu…', { n: products.length })} storageKey="recipes" ariaLabel={t('Hledat položku menu')} />
          <div className="flex items-center gap-2 min-w-0 sm:shrink-0">
            {/* Pilulky jedou v jednom řádku; co se nevejde (320 px, němčina), posune se prstem uvnitř pásu.
                Na monitoru se nesmršťují — ustoupí hledání. */}
            <div className="flex items-center gap-2 overflow-x-auto min-w-0 flex-1 sm:flex-none sm:overflow-visible py-1" role="group" aria-label={t('Filtry receptur')}>
              <button type="button" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(v => !v)}
                className={`filter-pill tap-target whitespace-nowrap shrink-0 ${onlyMissing ? 'seg-on' : 'seg-off glass'}`}>
                {t('Jen bez receptury')}
              </button>
              {/* Druhý klik ruší; ukáže se, až když je pod cílem aspoň jedna položka (nebo je filtr zapnutý). */}
              {(nPodCilem > 0 || podCilem) && (
                <button type="button" aria-pressed={podCilem} onClick={() => setPodCilem(v => !v)}
                  title={t('Marže pod cílem podniku ({n} %)', { n: cil ?? 65 })}
                  className={`filter-pill tap-target whitespace-nowrap shrink-0 ${podCilem ? 'seg-on' : 'seg-off glass'}`}>
                  {t('Pod cílem · {n}', { n: nPodCilem })}
                </button>
              )}
            </div>
            <Menu label={t('Řadit: {druh}', { druh: NAZVY_RAZENI[razeni] })} icon="swap"
              items={RAZENI_RECEPTUR.map(k => ({ label: NAZVY_RAZENI[k], icon: k === razeni ? 'check' : undefined, onClick: () => setRazeni(k) }))} />
          </div>
        </div>
        {categories.length > 2 && (
          // Zalamuje se; posuvný pás se záporným okrajem (-mx-1) dřív přečníval 4 px za widget.
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('Kategorie menu')}>
            {categories.map(c => (
              <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
                className={`filter-pill tap-target whitespace-nowrap shrink-0 ${cat === c ? 'seg-on' : 'seg-off glass'}`}>
                {c === VSE ? t('Vše') : c === BEZ_KATEGORIE ? t('Bez kategorie') : c}
              </button>
            ))}
          </div>
        )}

        <Card pad="none">
          {shown.length === 0 ? (
            <div className="p-5">
              <EmptyState compact icon="search"
                title={onlyMissing ? t('Všechno tady má recepturu') : podCilem ? t('Nic není pod cílem') : t('Nic nenalezeno')}
                hint={onlyMissing ? t('V téhle kategorii se každý prodej odepisuje ze skladu.') : podCilem ? t('Všechny položky s recepturou mají marži aspoň {n} %.', { n: cil ?? 65 }) : t('Zkus jiné hledání nebo kategorii.')} />
            </div>
          ) : (
            <ul className="list px-5">
              {shown.slice(0, LIMIT).map(p => {
                const r = recipeByProduct.get(p.productId);
                const sRec = !!r?.ingredients.length;
                const sold = soldByProduct.get(p.productId) ?? 0;
                const eco = ekonomika.get(p.productId) ?? null;
                return (
                  <li key={p.productId}>
                    <ListRow as="div" title={p.name}
                      meta={sRec
                        ? r!.ingredients.map(ing => `${Number(ing.amount).toLocaleString(LOCALE_PRO_JAZYK[jazyk], { maximumFractionDigits: 3 })} ${ing.itemUnit ?? ''} ${ing.itemName ?? '?'}`.replace(/\s+/g, ' ').trim()).join(' + ')
                        : (p.category || t('bez kategorie'))}
                      value={eco?.marginPct != null ? <span className={TEXT_MARZE[tonMarze(eco.marginPct, cil)]}>{eco.marginPct} %</span> : undefined}
                      valueMeta={eco ? t('náklad {castka}', { castka: money(eco.cost) }) : undefined}
                      aside={sold > 0 ? t('prodáno {n}×', { n: sold }) : undefined}
                      right={(() => {
                        const pz = pocty.data?.[p.productId];
                        const stav = sNavrhem.has(p.productId)
                          ? <Chip tone="wait" size="sm" icon="pencil">{rezim === 'upravit' ? t('Návrh ke schválení') : t('Návrh čeká')}</Chip>
                          : sRec ? null : <Chip tone="wait" size="sm">{t('bez receptury')}</Chip>;
                        if (!pz && !stav) return undefined;
                        return <span className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                          {pz && <Chip tone="muted" size="sm" icon="chat" className={pz.nove ? 'font-bold' : ''}><span className="sr-only">{t('{n, plural, one {# poznámka} few {# poznámky} other {# poznámek}}', { n: pz.n })}{pz.nove ? `, ${t('nová')}` : ''}</span><span aria-hidden>{pz.n}</span></Chip>}
                          {stav}
                        </span>;
                      })()}
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
              {t('Zobrazeno prvních {limit} z {celkem} položek. Zbytek najdeš přes hledání nahoře, nebo si vyber kategorii.', { limit: LIMIT, celkem: shown.length })}
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <>
      <PlochaWidgetu stranka={stranka} hlavicka={hlavicka} nastroj={<div ref={nastrojRef} className="scroll-mt-4">{nastroj}</div>} />
      {zprava && <Toast message={zprava.text} tone={zprava.ton} onClose={() => setZprava(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Editor jedné receptury. Množství se zadává v jednotce, kterou má člověk v
// ruce, a hned pod ním je vidět, kolik porcí z balení vyjde a co stojí — na
// tom se chyba o řád (0,02 l vs 0,2 l) pozná dřív, než se odepíše sklad.
// ---------------------------------------------------------------------------
function RecipeEditor({ draft, items, itemById, setIng, setDraft, save, saving, err, yieldOf, recipes, products, categories, cil, smiUpravit, rezim, historie, navrh, onNavrhnout, navrhuji, onObnovitVerzi, poznamkaVerze, guide, onOpenGuide, guideHref, onItemSaved, onItemCreated, onOpenItem }: {
  draft: Draft; items: any[]; itemById: Map<string, any>;
  setIng: (idx: number, patch: Partial<Ingredient>) => void;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  save: (smazat?: boolean, costPerPortion?: number | null) => void; saving: boolean; err: string;
  /** upravit = ukládá rovnou; navrhnout = „Navrhnout změnu" + Proč; cist = jen čte. */
  rezim: RezimEditoru;
  historie: StavDat<VerzeReceptury[]>;
  /** Poslední vlastní návrh k téhle receptuře — Chip stavu. */
  navrh: NavrhReceptury | null;
  onNavrhnout: (reason: string, costPerPortion: number | null, puvodniCost: number | null) => Promise<void>;
  navrhuji: boolean;
  onObnovitVerzi: (v: VerzeReceptury) => void;
  poznamkaVerze: string | null;
  yieldOf: (item: any, amountBase: number) => { portions: number | null; perPortion: number | null } | null;
  recipes: Receptura[]; products: { productId: string; name: string; price: number | null }[]; categories: { id: number; name: string }[];
  /** Cílová marže podniku (null = výchozí prahy 65 / 45). */
  cil: number | null;
  smiUpravit: boolean;
  guide: { id: number; title: string } | null;
  /** Otevřít návod navigací stránky (zůstane se ve správném rozhraní); bez ní odkaz z `guideHref`. */
  onOpenGuide?: (guideId: number) => void;
  guideHref: (guideId: number) => string;
  onItemSaved: (item: any) => void;
  onItemCreated: (item: any) => void;
  /** Otevřít položku ve Skladu (celý formulář); bez práva na sklad se nenabízí. */
  onOpenItem?: (itemId: number) => void;
}) {
  const t = useT('sklad');
  const { jazyk } = useJazyk();
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
  // Historie verzí (okno) a návrh ke schválení (důvod).
  const [historieOtevrena, setHistorieOtevrena] = useState(false);
  const [rozbalena, setRozbalena] = useState<number | null>(null);
  const [duvod, setDuvod] = useState('');
  const locale = LOCALE_PRO_JAZYK[jazyk];

  const nameOfProduct = (r: Receptura) => products.find(p => p.productId === r.productId)?.name ?? r.productName ?? r.productId;
  const copyable = recipes
    .filter(r => r.productId !== draft.productId && r.ingredients.length)
    .sort((a, b) => nameOfProduct(a).localeCompare(nameOfProduct(b), LOCALE_PRO_JAZYK[jazyk]));

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
    return { unitCost: Number(item.unitCost) || 0, packageSize: baleniPolozky(item).packageSize ?? 0, amount: (num(ing.amount) * conv) / itemFactor(item) };
  });
  // Stejný výpočet jako v seznamu — editor a seznam ukazují u téže receptury totéž číslo.
  const cost = recipeCost(costRows);
  const totalCost = cost.total;

  const menuPrice = products.find(p => p.productId === draft.productId)?.price ?? null;
  // Surovina bez ceny je díra v součtu, ne nulový náklad: marže spočítaná jen
  // z části nákladů je nafouknutá a podle marže se nastavují ceny. Seznam receptur
  // ji z téhož důvodu skrývá (economyOf) — editor se musí chovat stejně, jinak
  // u téže receptury svítí zelený pruh, který seznam neukázal.
  const margin = cost.exact > 0 && cost.missingPrice === 0 ? marginPct(menuPrice, cost.exact) : null;
  const ready = draft.ingredients.filter(i => i.itemId && num(i.amount) > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>{t('Zpět na seznam')}</Button>
        <div className="min-w-0 flex-1">
          <h2 className="t-section truncate">{draft.productName}</h2>
          <p className="t-meta">
            {ready === 0 ? t('Zatím bez surovin') : t('{n, plural, one {# surovina} few {# suroviny} other {# surovin}} v receptuře', { n: ready })}
            {menuPrice != null && <span> · {t('v kase za {cena}', { cena: money(menuPrice) })}</span>}
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
            <Field id={`${uid}-prevzit`} label={t('Převzít z jiné položky')}>
              <Select id={`${uid}-prevzit`} value="" onChange={e => copyFrom(e.target.value)} className="sm:max-w-sm">
                <option value="">{t('Vyber recepturu')}</option>
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
                    <Field id={idPolozky} label={t('Surovina')} className="flex-1 min-w-[12rem]">
                      <Select id={idPolozky} value={ing.itemId} disabled={!smiUpravit}
                        onChange={e => {
                          const next = itemById.get(e.target.value);
                          setIng(idx, { itemId: e.target.value, unit: UNITS[familyOf(next)][0].label });
                        }}>
                        <option value="">{t('Vyber ze skladu')}</option>
                        {items.filter((i: any) => i.archived !== true || String(i.id) === ing.itemId).map((i: any) => (
                          <option key={i.id} value={i.id}>{i.archived === true ? t('{nazev} (archivovaná)', { nazev: i.name }) : i.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field id={`${idPolozky}-m`} label={t('Množství')} className="w-full sm:w-28">
                      <Input id={`${idPolozky}-m`} inputMode="decimal" value={ing.amount} disabled={!smiUpravit}
                        onChange={e => setIng(idx, { amount: e.target.value })} placeholder="0,02" className="text-center font-semibold tabular-nums" />
                    </Field>
                    {opts.length > 1 && (
                      <Segmented size="sm" ariaLabel={t('Jednotka — {nazev}', { nazev: item?.name ?? t('surovina') })} value={ing.unit}
                        options={opts.map(u => ({ id: u.label, label: u.label }))} onChange={u => smiUpravit && setIng(idx, { unit: u })} />
                    )}
                    {smiUpravit && (
                      <Button variant="ghost" size="sm" iconOnly icon="close" className="tap-target" aria-label={t('Odebrat surovinu {nazev}', { nazev: item?.name ?? idx + 1 })}
                        onClick={() => setDraft(x => x && ({ ...x, ingredients: x.ingredients.filter((_, i) => i !== idx) }))} />
                    )}
                  </div>
                  {/* Díly položky — definované u ní, tady se jen vyberou. */}
                  {smiUpravit && item && Array.isArray(item.portions) && item.portions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Díly — {nazev}', { nazev: item.name })}>
                      <span className="t-meta">{t('Díly:')}</span>
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
                        ? <span>{t('Z balení ({velikost}) vyjde', { velikost: `${Number(baleniPolozky(item).packageSize).toLocaleString(LOCALE_PRO_JAZYK[jazyk])} ${jednotkaPolozky(item)}` })} <b className="font-semibold text-[#16181A] tabular-nums">{y.portions}×</b></span>
                        : <span className="text-wait-ink">{t('Chybí velikost balení — porce ani cenu nespočítám.')}</span>)}
                      {y?.perPortion != null && <span>{t('· surovina za porci')} <b className="font-semibold text-[#16181A] tabular-nums">{cena(y.perPortion)}</b></span>}
                      {num(ing.amount) > 0 && y?.perPortion == null && !(Number(item.unitCost) > 0) && <span className="text-wait-ink">{t('· chybí cena za balení')}</span>}
                      {smiUpravit && (
                        <Button variant="ghost" size="sm" icon={editingItem === ing.itemId ? 'close' : 'pencil'} aria-expanded={editingItem === ing.itemId}
                          onClick={() => setEditingItem(editingItem === ing.itemId ? null : ing.itemId)}>
                          {editingItem === ing.itemId ? t('Zavřít úpravu') : t('Upravit položku a díly')}
                        </Button>
                      )}
                      {onOpenItem && (
                        <Button variant="ghost" size="sm" icon="box" onClick={() => onOpenItem(Number(item.id))}>
                          {t('Otevřít ve skladu')}
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
                {t('Další surovina')}
              </Button>
              <Button variant="ghost" size="sm" icon="box" onClick={() => setCreatingAt(draft.ingredients.findIndex(i => !i.itemId))}>
                {t('Založit novou surovinu')}
              </Button>
            </div>
          ))}
        </Card>

        {/* Souhrn: co to stojí, co z toho zbude, a uložení na dosah. */}
        <Card as="div" className="space-y-4 lg:sticky lg:top-4">
          <Stat label={t('Suroviny na porci')} value={totalCost > 0 ? money(totalCost) : '—'}
            note={cost.missingPrice > 0
              ? t('chybí cena u {n, plural, one {# surovina} few {# suroviny} other {# surovin}} — součet je neúplný', { n: cost.missingPrice })
              : totalCost > 0 ? t('podle cen ve skladu') : t('doplň množství a ceny balení')} />

          {menuPrice != null && (
            <Well className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-black/55">{t('Cena v kase')}</span>
                <span className="font-semibold tabular-nums text-[#16181A]">{money(menuPrice)}</span>
              </div>
              {margin != null && (
                <>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-black/55">{t('Zbyde na porci')}</span>
                    <span className="font-semibold tabular-nums text-[#16181A]">{money(menuPrice - cost.exact)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden mt-1.5" aria-hidden>
                    <div className={`h-full rounded-full ${PRUH_MARZE[tonMarze(margin, cil)]}`}
                      style={{ width: `${Math.max(0, Math.min(100, margin))}%` }} />
                  </div>
                  <p className={`text-[13px] font-semibold ${VETA_MARZE[tonMarze(margin, cil)]}`}>
                    {t('marže {n} %', { n: margin })}
                    {cil != null && <span className="font-normal text-black/55"> · {t('cíl {n} %', { n: cil })}</span>}
                  </p>
                </>
              )}
            </Well>
          )}

          {err && <p className="note note-danger" role="alert">{err}</p>}
          {poznamkaVerze && <p className="note note-wait text-sm" role="status">{t('Načtená starší verze — platit začne, až ji uložíš.')}</p>}
          {navrh && (
            // Stav vlastního návrhu: „Čeká" / „Schváleno" / „Vráceno" i s poznámkou vedení.
            <div className="space-y-1" data-stav-navrhu={navrh.status}>
              <p className="t-meta flex items-center gap-2">{t('Tvůj návrh')} <Chip tone={navrh.status === 'ceka' ? 'wait' : navrh.status === 'schvaleno' ? 'ok' : 'bad'} size="sm">{stavNavrhuText(t, navrh.status)}</Chip>
                <span>· {fmtDatum(navrh.createdAt, { jazyk, styl: 'kratce' })}</span></p>
              {navrh.reviewNote && <p className="note note-wait text-sm">{navrh.reviewer?.name ? `${navrh.reviewer.name}: ` : ''}{navrh.reviewNote}</p>}
            </div>
          )}
          {rezim === 'upravit' ? (
            <div className="space-y-2">
              <Button variant="accent" className="w-full" loading={saving} onClick={() => save(false, cost.missingPrice === 0 && cost.exact > 0 ? cost.exact : null)}>{t('Uložit recepturu')}</Button>
              {draft.existing && (
                <Button variant="danger" className="w-full" disabled={saving} onClick={() => setMazani(true)}>{t('Smazat recepturu')}</Button>
              )}
            </div>
          ) : rezim === 'navrhnout' ? (
            // Jen receptury.navrhnout: editor je živý, ale místo uložení jde návrh vedení ke schválení.
            <div className="space-y-2">
              <Field id={`${uid}-proc`} label={t('Proč')} hint={t('Např. „nový dodavatel sirupu je sladší, stačí 15 ml". Vedení návrh schválí, nebo vrátí s poznámkou.')}>
                <Textarea id={`${uid}-proc`} rows={2} value={duvod} maxLength={MAX_DELKA_DUVODU} onChange={e => setDuvod(e.target.value)} />
              </Field>
              <Button variant="accent" className="w-full" icon="send" loading={navrhuji} disabled={!duvod.trim() || ready === 0}
                onClick={() => {
                  const stara = recipes.find(r => r.productId === draft.productId);
                  const puvodniCost = stara?.ingredients.length ? recipeCost(stara.ingredients.map(ing => {
                    const item = itemById.get(String(ing.itemId));
                    return { unitCost: Number(item?.unitCost) || 0, packageSize: baleniPolozky(item).packageSize ?? 0, amount: Number(ing.amount) || 0 };
                  })) : null;
                  void onNavrhnout(duvod.trim(), cost.missingPrice === 0 && cost.exact > 0 ? cost.exact : null,
                    puvodniCost && puvodniCost.missingPrice === 0 && puvodniCost.exact > 0 ? puvodniCost.exact : null);
                }}>
                {t('Navrhnout změnu')}
              </Button>
            </div>
          ) : (
            <p className="t-meta">{t('Recepturu mění jen ten, kdo smí receptury upravovat.')}</p>
          )}

          {/* Kdo co kdy změnil (kolo 8, R8-5): odkaz s počtem, okno zdola na telefonu. */}
          {!historie.vypnuto && (
            <Button variant="ghost" size="sm" icon="clock" className="w-full" aria-haspopup="dialog" data-historie-receptury
              disabled={historie.loading && !historie.data} onClick={() => { setRozbalena(null); setHistorieOtevrena(true); }}>
              {!historie.data ? t('Historie') : historie.data.length === 0 ? t('Historie · bez změn') : t('Historie · {n, plural, one {# změna} few {# změny} other {# změn}}', { n: historie.data.length })}
            </Button>
          )}

          {guide && (onOpenGuide ? (
            <Button variant="secondary" size="sm" icon="book" className="w-full min-w-0" data-navod={guide.id} onClick={() => onOpenGuide(guide.id)}>
              <span className="min-w-0 truncate">{t('Návod: {nazev}', { nazev: guide.title })}</span>
            </Button>
          ) : (
            <a href={guideHref(guide.id)} data-navod={guide.id} className="btn btn-secondary btn-sm w-full min-w-0">
              <Icon name="book" size={15} className="shrink-0" />
              <span className="min-w-0 truncate">{t('Návod: {nazev}', { nazev: guide.title })}</span>
            </a>
          ))}

          <p className="t-meta">{t('Uloženou recepturu odepisuje synchronizace s pokladnou po každém prodeji.')}</p>
        </Card>
      </div>

      {/* Poznámky k receptuře („sirup od nového dodavatele je sladší, stačí 15 ml") — klíčem je product_id kasy,
          receptura nemá vlastní číslo. Píše každý, kdo receptury vidí, i bez práva je měnit. */}
      <Card className="min-w-0">
        <Poznamky typ="recipe" id={draft.productId} />
      </Card>

      <Modal open={historieOtevrena} onClose={() => setHistorieOtevrena(false)} size="md" title={t('Historie receptury')} subtitle={draft.productName}
        footer={<Button variant="secondary" onClick={() => setHistorieOtevrena(false)}>{t('Zavřít')}</Button>}>
        {historie.error && !historie.data ? (
          <p className="note note-danger text-sm" role="alert">{historie.error}</p>
        ) : !historie.data ? (
          <div className="space-y-2" aria-busy><Skeleton className="h-12" /><Skeleton className="h-12 w-3/4" /></div>
        ) : historie.data.length === 0 ? (
          <EmptyState compact icon="clock" title={t('Zatím bez historie')} hint={t('Od teď se každé uložení zapíše: kdo, kdy a co změnil.')} />
        ) : (
          <ul className="list" data-verze-receptury>
            {historie.data.map((v, i) => {
              // Rozdíl proti předchozí (starší) verzi; nejstarší verze proti ničemu = celá receptura přidaná.
              const starsi = historie.data![i + 1];
              const rozdil = rozdilVerzi(starsi?.ingredients ?? [], v.ingredients);
              const dopad = dopadNaPorci(starsi?.costPerPortion ?? null, v.costPerPortion);
              const otevrena = rozbalena === v.id;
              return (
                <li key={v.id} className="py-3 space-y-2" data-verze={v.id}>
                  <div className="flex items-start gap-3">
                    <Avatar emoji={v.changedBy?.avatar} name={v.changedBy?.name ?? ''} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        <span className="tabular-nums">{dbTimeDayHM(v.changedAt)}</span> · {v.changedBy?.name ?? t('Neznámý')}
                        {i === 0 && <Chip tone="ok" size="sm" className="ml-2">{t('platí')}</Chip>}
                      </p>
                      {v.note && <p className="t-meta">{v.note}</p>}
                      <div className="mt-1">
                        {jeBezeZmeny(rozdil) && v.ingredients.length === 0
                          ? <p className="t-meta">{t('Receptura smazána')}</p>
                          : <RadkyRozdilu rozdil={rozdil} locale={locale} t={t} />}
                      </div>
                    </div>
                    {v.costPerPortion != null && (
                      <div className="shrink-0 text-right tabular-nums">
                        <p className="text-sm font-semibold text-[#16181A]">{cena(v.costPerPortion)}</p>
                        {dopad != null && dopad !== 0 && <p className={`t-meta ${dopad > 0 ? 'text-bad-ink' : 'text-ok-ink'}`}>{dopad > 0 ? '+' : ''}{cena(dopad)}</p>}
                      </div>
                    )}
                  </div>
                  {otevrena && (
                    <ul className="t-meta pl-11 space-y-0.5 tabular-nums" aria-label={t('Suroviny verze')}>
                      {v.ingredients.length === 0 ? <li>—</li> : v.ingredients.map(ing => <li key={ing.itemId}>{ing.itemName ?? `#${ing.itemId}`} · {mnozstviText(ing.amount, ing.unit, locale)}</li>)}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2 pl-11">
                    <Button variant="ghost" size="sm" aria-expanded={otevrena} onClick={() => setRozbalena(otevrena ? null : v.id)}>{otevrena ? t('Skrýt') : t('Zobrazit')}</Button>
                    {rezim === 'upravit' && i > 0 && (
                      <Button variant="secondary" size="sm" icon="undo" onClick={() => { onObnovitVerzi(v); setHistorieOtevrena(false); }}>{t('Vrátit na tuto verzi')}</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <Modal open={mazani} onClose={() => setMazani(false)} size="sm" title={t('Smazat recepturu?')}
        footer={<>
          <Button variant="secondary" onClick={() => setMazani(false)}>{t('Zrušit', undefined, 'dialog')}</Button>
          <Button variant="danger-solid" loading={saving} onClick={() => { setMazani(false); save(true); }}>{t('Smazat recepturu')}</Button>
        </>}>
        <p className="t-meta">{t('Prodeje „{nazev}" se pak ze skladu přestanou odepisovat, dokud recepturu znovu nesložíš.', { nazev: draft.productName })}</p>
      </Modal>
    </div>
  );
}
