// Množství „na první dobrou" — jedno místo, které říká, V ČEM se položka
// vede, co z toho plyne pro prahy, receptury a odpis z kasy, a jak se
// přepočítá „2 balení" na „2 000 g". Čtou ho formulář položky, inventura
// (souhrn rozdílů před zapsáním) a zápis stavu na telefonu.
//
// Proč to existuje: do kola 81 bylo v aplikaci pět druhů čísel (kusy, balení,
// gramy obsahu, díly, dávky) a u žádného pole nebylo vidět, které z nich
// zrovna píšeš. Každá obrazovka si převod počítala sama a popisek chyběl.
//
// Čistý modul bez Reactu a bez `@/` importů: `npm test` ho načítá přímo Nodem.
// Texty vět píše komponenta přes t() — tady jsou jen čísla a jednotky.

import { normJednotka, rodinaJednotky, jednotkaSnesDesetiny, nabidkaJednotek } from './jednotky.ts';

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/** Jednotky, které formulář nabízí jako pilulky; cokoli jiného je „vlastní" (lahev, krabička, pytel). */
export const NABIDKA_JEDNOTEK = ['ks', 'balení', 'l', 'kg', 'g', 'ml'] as const;
export type NabizenaJednotka = typeof NABIDKA_JEDNOTEK[number];

export function jeZNabidky(u: unknown): u is NabizenaJednotka {
  return (NABIDKA_JEDNOTEK as readonly string[]).includes(String(u ?? '').trim());
}

/** Druh jednotky — podle něj formulář vybere vysvětlující větu. */
export type DruhJednotky = 'kusy' | 'baleni' | 'objem' | 'hmotnost' | 'vlastni';

export function druhJednotky(u: unknown): DruhJednotky {
  const n = normJednotka(u);
  if (n === '' || n === 'ks') return 'kusy';
  if (n === 'balení' || n === 'baleni') return 'baleni';
  const r = rodinaJednotky(n);
  if (r === 'l') return 'objem';
  if (r === 'kg') return 'hmotnost';
  return 'vlastni';
}

export interface VedeniPolozky {
  /** Jednotka stavu skladu — v ní se zadává množství i prahy (ks, balení, lahev, l…). */
  jednotka: string;
  /** Jedno balení = tolik obsahu; null, když položka balení nemá. */
  baleni: { velikost: number; jednotka: string; zKategorie: boolean } | null;
  /** Jednotka, ve které se píšou receptury a odepisuje prodej z kasy. */
  odepisujeV: string;
  /** Jednotka prahů „Upozornit při / Kriticky": balení, nebo obsah, když to kategorie hlídá podle obsahu. */
  prahyV: string;
  /** Smí mít množství desetiny (kg, l ano; ks, g, ml ne)? Jestli to sloupec unese, říká server. */
  desetiny: boolean;
  /** Menší jednotky téže rodiny, ve kterých jde psát recepturu (l → ml, cl, dl). */
  mensiJednotky: string[];
  druh: DruhJednotky;
}

/**
 * Co o vedení položky plyne z jejích polí a z kategorie. `packageSize` a
 * `contentUnit` jsou vlastní hodnoty položky (formulář), balení z kategorie
 * se doplní, když vlastní chybí — stejné pravidlo jako `efektivniBaleni`.
 */
export function vedeniPolozky(
  item: { unit?: unknown; packageSize?: unknown; contentUnit?: unknown },
  packaging?: { defaultPackageSize?: number | null; contentUnit?: string | null; tracksOpen?: boolean; thresholdUnit?: 'package' | 'content' } | null,
): VedeniPolozky {
  const jednotka = String(item.unit ?? '').trim() || 'ks';
  const vlastniVelikost = num(item.packageSize);
  const zKat = Number(packaging?.defaultPackageSize) || 0;
  const velikost = vlastniVelikost > 0 ? vlastniVelikost : zKat > 0 ? zKat : 0;
  const obsah = String(item.contentUnit ?? '').trim() || String(packaging?.contentUnit ?? '').trim() || '';
  const baleni = velikost > 0 && obsah ? { velikost, jednotka: obsah, zKategorie: !(vlastniVelikost > 0) } : null;
  const odepisujeV = baleni ? baleni.jednotka : jednotka;
  const prahyV = packaging?.tracksOpen && packaging.thresholdUnit === 'content' && packaging.contentUnit ? packaging.contentUnit : jednotka;
  const mensi = nabidkaJednotek(odepisujeV).filter(u => u !== normJednotka(odepisujeV));
  return { jednotka, baleni, odepisujeV, prahyV, desetiny: jednotkaSnesDesetiny(jednotka), mensiJednotky: mensi, druh: druhJednotky(jednotka) };
}

/** Celkový obsah: zavřená balení × velikost + zbytek v načatém (3 × 0,7 + 0,35 = 2,45). */
export function celkemObsahu(baleni: unknown, velikost: unknown, zbytek: unknown): number {
  return round3(Math.max(0, num(baleni)) * Math.max(0, num(velikost)) + Math.max(0, num(zbytek)));
}

/** Obrácený směr: 2 450 g po 1 000 g = 2 balení + 450 g. Bez velikosti zůstává vše jako „zbytek". */
export function naBaleni(celkem: unknown, velikost: unknown): { baleni: number; zbytek: number } {
  const c = Math.max(0, num(celkem)); const v = num(velikost);
  if (v <= 0) return { baleni: 0, zbytek: round3(c) };
  const baleni = Math.floor(c / v + 1e-9);
  return { baleni, zbytek: round3(c - baleni * v) };
}

/** Krok ± nad textem pole: české číslo s čárkou, nikdy pod `min`, bez plovoucí chyby. */
export function krokMnozstvi(text: unknown, delta: number, min = 0): number {
  return Math.max(min, round3(num(text) + delta));
}

// ---------------------------------------------------------------------------
// Inventura: rozdíly a souhrn před zapsáním
// ---------------------------------------------------------------------------

export interface RadekInventury {
  itemId: number; name: string; category?: string | null; unit: string;
  expected: number; counted: number | null;
  packageSize?: number | null; contentUnit?: string | null;
  expectedOpen?: number | null; countedOpen?: number | null;
  /** Cena balení (s velikostí balení), jinak cena jednotky; null = bez ceny nebo bez práva ji vidět. */
  unitCost?: number | null;
}

export interface RozdilRadku {
  /** Rozdíl v jednotce stavu (balení, ks, kg); 0 i když nespočítáno. */
  ks: number;
  /** Rozdíl zbytku v načatém balení v jednotce obsahu; null bez balení nebo nespočítáno. */
  obsah: number | null;
  /** Rozdíl přepočtený na balení (−1 lahev + 0,35 l z 0,7 l = −0,5). */
  vBalenich: number;
  /** Rozdíl v penězích (kladný = přebývá); null bez ceny. */
  hodnota: number | null;
  spocitano: boolean;
  zmena: boolean;
}

export function rozdilRadku(r: RadekInventury): RozdilRadku {
  const pkg = Number(r.packageSize) || 0;
  const maPocet = r.counted != null;
  const maObsah = pkg > 0 && r.countedOpen != null;
  const ks = maPocet ? round3(Number(r.counted) - (Number(r.expected) || 0)) : 0;
  const obsah = maObsah ? round3(Number(r.countedOpen) - (Number(r.expectedOpen) || 0)) : null;
  const vBalenich = round3(ks + (obsah != null && pkg > 0 ? obsah / pkg : 0));
  const cena = r.unitCost == null ? null : Number(r.unitCost);
  // Cena je za balení, když balení je, jinak za jednotku stavu — stejně jako
  // hodnota zásob (lib/skladPrehled.hodnotaZasob) a marže (lib/recipeCost).
  const hodnota = cena != null && Number.isFinite(cena) ? Math.round(vBalenich * cena * 100) / 100 : null;
  return { ks, obsah, vBalenich, hodnota, spocitano: maPocet || maObsah, zmena: ks !== 0 || (obsah != null && obsah !== 0) };
}

export interface PolozkaSouhrnu {
  itemId: number; name: string; category: string | null;
  jednotka: string; jednotkaObsahu: string | null;
  expected: number; counted: number | null; expectedOpen: number | null; countedOpen: number | null;
  ks: number; obsah: number | null; hodnota: number | null;
}

export interface SouhrnInventury {
  polozek: number;
  spocitano: number;
  nespocitano: number;
  rozdilu: number;
  /** Rozdíly se záporným saldem (ve skladu je míň, než říká evidence). */
  ubylo: PolozkaSouhrnu[];
  pribylo: PolozkaSouhrnu[];
  /** Peníze: ubylo je záporné číslo, přibylo kladné; saldo jejich součet. */
  hodnotaUbylo: number;
  hodnotaPribylo: number;
  saldo: number;
  /** Rozdíly, u kterých cena chybí — saldo je pak jen dolní odhad. */
  bezCeny: number;
  /** Jsou vůbec nějaké ceny (bez práva sklad.ceny jsou všechny null)? */
  sCenami: boolean;
}

/** Souhrn rozdílů před „Dokončit a zapsat": co ubylo, co přibylo a za kolik. */
export function souhrnInventury(rows: readonly RadekInventury[]): SouhrnInventury {
  const ubylo: PolozkaSouhrnu[] = []; const pribylo: PolozkaSouhrnu[] = [];
  let spocitano = 0, hodnotaUbylo = 0, hodnotaPribylo = 0, bezCeny = 0, sCenami = false;
  for (const r of rows) {
    if (r.unitCost != null) sCenami = true;
    const d = rozdilRadku(r);
    if (d.spocitano) spocitano++;
    if (!d.zmena) continue;
    const p: PolozkaSouhrnu = {
      itemId: r.itemId, name: r.name, category: r.category ?? null, jednotka: r.unit, jednotkaObsahu: r.contentUnit ?? null,
      expected: Number(r.expected) || 0, counted: r.counted, expectedOpen: r.expectedOpen ?? null, countedOpen: r.countedOpen ?? null,
      ks: d.ks, obsah: d.obsah, hodnota: d.hodnota,
    };
    if (d.hodnota == null) bezCeny++;
    if (d.vBalenich < 0) { ubylo.push(p); hodnotaUbylo += d.hodnota ?? 0; }
    else { pribylo.push(p); hodnotaPribylo += d.hodnota ?? 0; }
  }
  const zaokr = (n: number) => Math.round(n * 100) / 100;
  // Větší ztráta nahoře — to je to, kvůli čemu se souhrn čte.
  const podleHodnoty = (a: PolozkaSouhrnu, b: PolozkaSouhrnu) => Math.abs(b.hodnota ?? 0) - Math.abs(a.hodnota ?? 0) || a.name.localeCompare(b.name, 'cs');
  ubylo.sort(podleHodnoty); pribylo.sort(podleHodnoty);
  return {
    polozek: rows.length, spocitano, nespocitano: rows.length - spocitano, rozdilu: ubylo.length + pribylo.length,
    ubylo, pribylo, hodnotaUbylo: zaokr(hodnotaUbylo), hodnotaPribylo: zaokr(hodnotaPribylo), saldo: zaokr(hodnotaUbylo + hodnotaPribylo),
    bezCeny, sCenami,
  };
}

/** Kategorie v pořadí, v jakém jsou řádky (inventura je řadí po kategoriích); bez kategorie = null. */
export function kategorieInventury(rows: readonly { category?: string | null }[]): (string | null)[] {
  const out: (string | null)[] = [];
  for (const r of rows) { const k = r.category ?? null; if (!out.includes(k)) out.push(k); }
  return out;
}

/** Filtr řádků inventury: kategorie (`undefined` = všechny, `null` = bez kategorie) a „jen nespočítané". */
export function filtrujInventuru<T extends RadekInventury>(rows: readonly T[], volby: { kategorie?: string | null; jenNespocitane?: boolean }): T[] {
  return rows.filter(r => {
    if (volby.kategorie !== undefined && (r.category ?? null) !== volby.kategorie) return false;
    if (volby.jenNespocitane && rozdilRadku(r).spocitano) return false;
    return true;
  });
}
