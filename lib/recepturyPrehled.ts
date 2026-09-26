// Receptury a menu — čistý výpočet pro widgety a nástroje (kolo 69, balík B4).
//
// Čistý modul bez Reactu a bez `@/` importů: bere ho oblast widgetů
// (components/widgety/oblasti/{receptury,menu}.tsx), nástroje stránek
// (RecipesView, MenuEditor) i jednotkové testy (scripts/testy/k69-b4.ts).
// Jeden výpočet na jednom místě — dřív si Receptury počítaly pokrytí samy
// a číslo nahoře mohlo přelézt 100 %, když zůstala receptura k produktu,
// který kasa už nevede.
//
// Výběry (`vyber*`) vyhodí u nečekaného tvaru odpovědi. Widget to ukáže
// jako chybu („Data mají nečekaný tvar"), ne jako prázdno — prázdné
// „0 položek" by vypadalo jako klidný stav a nikdo by nic nehledal.

import { jeAktivni } from './skladPrehled.ts';
import { proHledani } from './hledani.ts';
import { czCount, POLOZKA, type CzNoun } from './czech.ts';

// ---------------------------------------------------------------------------
// Receptury (GET /api/pos/products)
// ---------------------------------------------------------------------------

export interface ProduktKasy { productId: string; name: string; category: string; price: number | null }
export interface SurovinaReceptury { itemId: number; amount: number; itemName: string | null; itemUnit: string | null }
export interface Receptura { productId: string; productName: string | null; ingredients: SurovinaReceptury[] }
export interface ProdejBezReceptury { productId: string; productName: string; prodano: number }

export interface DataReceptur {
  /** Pokladna je připojená; nepřipojená je platná odpověď, ne chyba. */
  propojeno: boolean;
  produkty: ProduktKasy[];
  receptury: Receptura[];
  bezReceptury: ProdejBezReceptury[];
  /** Hláška serveru (katalog kasy se nenačetl) — ukáže se, čísla se nevymýšlí. */
  chyba: string | null;
}

const pole = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (x: unknown): number => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

export function vyberReceptury(raw: any): DataReceptur {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Odpověď pokladny má nečekaný tvar.');
  const produkty: ProduktKasy[] = pole(raw.products)
    .filter(p => p && p.productId != null)
    .map(p => ({
      productId: String(p.productId),
      name: String(p.name ?? p.productId),
      category: String(p.category ?? ''),
      price: p.price == null || !Number.isFinite(Number(p.price)) ? null : Number(p.price),
    }));
  const receptury: Receptura[] = pole(raw.recipes)
    .filter(r => r && r.productId != null)
    .map(r => ({
      productId: String(r.productId),
      productName: r.productName == null ? null : String(r.productName),
      ingredients: pole(r.ingredients).map(i => ({
        itemId: cislo(i?.itemId), amount: cislo(i?.amount) || 1,
        itemName: i?.itemName == null ? null : String(i.itemName), itemUnit: i?.itemUnit == null ? null : String(i.itemUnit),
      })),
    }));
  const bezReceptury: ProdejBezReceptury[] = pole(raw.unmapped)
    .filter(u => u && u.productId != null)
    .map(u => ({ productId: String(u.productId), productName: String(u.productName ?? u.productId), prodano: cislo(u.soldCount) }));
  return { propojeno: raw.connected === true, produkty, receptury, bezReceptury, chyba: typeof raw.error === 'string' ? raw.error : null };
}

export interface Pokryti {
  /** Celé procento položek menu z kasy, které mají recepturu; null = kasa nemá žádné položky. */
  procento: number | null;
  sRecepturou: number;
  produktu: number;
  /** Kolik různých položek se prodává bez receptury (fronta z kasy). */
  prodavaSeBez: number;
  /** Aktivní položky skladu (bez odložených a neschválených návrhů); null = sklad se nenačetl. */
  polozekSkladu: number | null;
}

/**
 * Pokrytí menu recepturou. Počítá se průnik produktů kasy a receptur —
 * receptura k produktu, který kasa už nevede, pokrytí nezvedá (dřív
 * `recipes.length / products.length` a vyšlo i 110 %).
 */
export function pokryti(d: DataReceptur, sklad: unknown[] | null): Pokryti {
  const sRec = new Set(d.receptury.filter(r => r.ingredients.length > 0).map(r => r.productId));
  const sRecepturou = d.produkty.filter(p => sRec.has(p.productId)).length;
  const produktu = d.produkty.length;
  const polozekSkladu = sklad == null ? null : sklad.filter((i: any) => i && typeof i === 'object' && jeAktivni(i)).length;
  return {
    procento: produktu ? Math.floor((sRecepturou / produktu) * 100) : null,
    sRecepturou, produktu,
    prodavaSeBez: prodejeBezReceptury(d).length,
    polozekSkladu,
  };
}

/**
 * Nejprodávanější položky bez receptury — nejdřív ty, co se prodávají
 * nejvíc (tam je odpis nejvíc vedle). Produkt, který mezitím recepturu
 * dostal, ve frontě nezůstane, i když ho server ještě vrací.
 */
export function prodejeBezReceptury(d: DataReceptur, strop = Infinity): ProdejBezReceptury[] {
  const sRec = new Set(d.receptury.filter(r => r.ingredients.length > 0).map(r => r.productId));
  const videno = new Set<string>();
  return d.bezReceptury
    .filter(u => !sRec.has(u.productId) && !videno.has(u.productId) && (videno.add(u.productId), true))
    .sort((a, b) => b.prodano - a.prodano || a.productName.localeCompare(b.productName, 'cs'))
    .slice(0, strop);
}

/** Druhý pád po „z": z 1 účtenky, ze 3 účtenek, z 5 účtenek. */
const UCTENKY: CzNoun = { one: 'účtenky', few: 'účtenek', many: 'účtenek' };

/** Výsledek POST /api/pos/sync (N1) jako jedna česká věta pro Toast. */
export function vetaOdpisu(raw: any): { text: string; chyba: boolean } {
  if (!raw || typeof raw !== 'object') return { text: 'Odpis se nepodařil.', chyba: true };
  if (raw.connected === false) return { text: 'Pokladna není připojená — není z čeho odepisovat.', chyba: true };
  if (typeof raw.error === 'string') return { text: raw.error, chyba: true };
  if (raw.throttled) return { text: 'Odpis právě běží z pokladny sám — zkus to za chvíli.', chyba: false };
  const n = pole(raw.deducted).length;
  const uctenek = cislo(raw.processed);
  if (!n) return { text: uctenek ? 'Prodeje prošly, ale nebylo co odepsat — položky nemají recepturu.' : 'Žádné nové prodeje k odepsání.', chyba: false };
  return { text: `Odepsáno ze skladu: ${czCount(n, POLOZKA)} z ${czCount(uctenek, UCTENKY)}.`, chyba: false };
}

// ---------------------------------------------------------------------------
// Menu (GET /api/menu, GET /api/menu?jen=vyprodano)
// ---------------------------------------------------------------------------

export interface PolozkaDesky { id: number; nazev: string; sekce: string; vyprodano: boolean }
export interface DeskaMenu {
  id: number;
  slug: string;
  nazev: string;
  zapnuto: boolean;
  pin: boolean;
  wifiSsid: string | null;
  wifiHeslo: string | null;
  polozek: number;
  bezCeny: number;
  sparovano: number;
  polozky: PolozkaDesky[];
}
export interface DataMenu { nezmigrovano: boolean; desky: DeskaMenu[] }

/** Adresa, kterou si iPad vezme bez parametru (lib/menu, VYCHOZI_SLUG v editoru). */
export const SLUG_IPADU = 'akce';

export function vyberMenu(raw: any): DataMenu {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Odpověď menu má nečekaný tvar.');
  if (raw.notMigrated) return { nezmigrovano: true, desky: [] };
  if (!Array.isArray(raw.boards)) throw new Error('Odpověď menu nemá seznam menu.');
  const desky: DeskaMenu[] = raw.boards.filter((b: any) => b && b.id != null).map((b: any) => {
    const polozky: PolozkaDesky[] = [];
    let bezCeny = 0; let sparovano = 0;
    for (const s of pole(b.sections)) {
      for (const it of pole(s?.items)) {
        if (!it || it.id == null) continue;
        polozky.push({ id: cislo(it.id), nazev: String(it.name ?? ''), sekce: String(s?.title ?? ''), vyprodano: it.soldOut === true });
        // Slabá odpověď (jen=vyprodano) cenu ani vazbu nenese — nic se nepočítá.
        if ('price' in it && !(cislo(it.price) > 0)) bezCeny++;
        if (it.posProductId) sparovano++;
      }
    }
    return {
      id: cislo(b.id), slug: String(b.slug ?? ''), nazev: String(b.name ?? ''), zapnuto: b.enabled !== false, pin: b.hasPin === true,
      wifiSsid: b.wifiSsid ? String(b.wifiSsid) : null, wifiHeslo: b.wifiPassword ? String(b.wifiPassword) : null,
      polozek: polozky.length, bezCeny, sparovano, polozky,
    };
  });
  return { nezmigrovano: false, desky };
}

/** Menu, které visí na iPadu: s adresou „akce", jinak první zapnuté, jinak první. */
export function hlavniDeska(desky: DeskaMenu[]): DeskaMenu | null {
  return desky.find(d => d.slug === SLUG_IPADU) ?? desky.find(d => d.zapnuto) ?? desky[0] ?? null;
}

/** Wi-Fi pro hosty: z hlavního menu, když ji má, jinak z prvního, které ji má. */
export function wifiMenu(desky: DeskaMenu[]): DeskaMenu | null {
  const h = hlavniDeska(desky);
  if (h?.wifiSsid) return h;
  return desky.find(d => d.wifiSsid) ?? null;
}

/** Nespárovaných s kasou — jen u menu, které párování používá (aspoň jedna vazba). */
export const nesparovano = (d: DeskaMenu) => (d.sparovano > 0 ? d.polozek - d.sparovano : 0);

export interface RadekVyprodano extends PolozkaDesky { slug: string; menu: string }

/**
 * Položky pro přepínání vyprodaného: jen ze zapnutých menu (veřejný
 * endpoint přepnutí vypnuté menu odmítne — tlačítko by lhalo), vyprodané
 * první. Se dvěma zapnutými menu nese řádek i jméno menu.
 */
export function radkyVyprodano(desky: DeskaMenu[], dotaz = ''): RadekVyprodano[] {
  const q = proHledani(dotaz);
  const out: RadekVyprodano[] = [];
  for (const d of desky.filter(x => x.zapnuto)) {
    for (const p of d.polozky) {
      if (q ? !proHledani(`${p.nazev} ${p.sekce}`).includes(q) : !p.vyprodano) continue;
      out.push({ ...p, slug: d.slug, menu: d.nazev });
    }
  }
  return out.sort((a, b) => Number(b.vyprodano) - Number(a.vyprodano) || a.nazev.localeCompare(b.nazev, 'cs'));
}

export const pocetVyprodanych = (desky: DeskaMenu[]) =>
  desky.filter(d => d.zapnuto).reduce((n, d) => n + d.polozky.filter(p => p.vyprodano).length, 0);

/** Událost „vyprodáno se přepnulo jinde" — editor menu si ji propíše do rozpracované kopie. */
export const UDALOST_VYPRODANO = 'managero:menu-vyprodano';
/** Obě adresy, ze kterých widgety menu čtou (po zápisu se obnoví obě). */
export const URL_MENU = '/api/menu';
export const URL_VYPRODANO = '/api/menu?jen=vyprodano';
