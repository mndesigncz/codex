// Jednotky množství — jedno místo pro převody mezi ml / cl / dl / l a g / dkg / kg.
//
// Dřív to bylo opsané na třech místech (receptury, krok návodu, obsahové
// jednotky ve skladu) a pokaždé trochu jinak: receptura převáděla, krok návodu
// ne — „20 ml" zadaných u položky vedené v litrech se uložilo jako 20 l.
//
// Zásada: množství VŽDY patří do jednotky položky (u balených zboží do jejího
// obsahu — ml, g, l, kg), protože v ní je velikost balení, cena i stav skladu.
// Uživatel smí zadat cokoli z téže rodiny; tady se to převede.
//
// Čistý modul bez závislostí — `npm test` ho načítá přímo Nodem.

export type RodinaJednotek = 'l' | 'kg' | 'ks';

export interface JednotkaRodiny {
  label: string;
  /** Kolik základní jednotky rodiny (l, kg, ks) je jedna taková jednotka. */
  toBase: number;
  base: RodinaJednotek;
}

/** Jednotky, ve kterých se dá zadávat, podle rodiny; základní jednotka je poslední. */
export const JEDNOTKY_RODIN: Record<RodinaJednotek, JednotkaRodiny[]> = {
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

/**
 * Jednotky obsahu, které se dají vybrat u položky nebo kategorie. cl a dl se
 * v zadávání množství rozumí (viz JEDNOTKY_RODIN), jako jednotka skladu by jen
 * zbytečně prodlužovaly nabídku; dkg se naopak v obchodě běžně používá.
 */
export const CONTENT_UNITS = ['g', 'dkg', 'kg', 'ml', 'l', 'ks'] as const;

/** Jednotka malými písmeny a bez okolních mezer; „litr" je „l". */
export function normJednotka(u: unknown): string {
  const s = String(u ?? '').trim().toLowerCase();
  return s === 'litr' || s === 'litry' || s === 'litrů' ? 'l' : s;
}

/** Do které rodiny jednotka patří; neznámé (ks, balení, láhev…) jsou kusy. */
export function rodinaJednotky(u: unknown): RodinaJednotek {
  const n = normJednotka(u);
  if (JEDNOTKY_RODIN.l.some(o => o.label === n)) return 'l';
  if (JEDNOTKY_RODIN.kg.some(o => o.label === n)) return 'kg';
  return 'ks';
}

/** Kolik základní jednotky (l, kg) je jedna `u`; u neznámé 1. */
export function faktorJednotky(u: unknown): number {
  const n = normJednotka(u);
  return JEDNOTKY_RODIN[rodinaJednotky(n)].find(o => o.label === n)?.toBase ?? 1;
}

/** Jednotky, které nabídnout k zadání u položky vedené v `jednotkaPolozky`. */
export function nabidkaJednotek(jednotkaPolozky: unknown): string[] {
  return JEDNOTKY_RODIN[rodinaJednotky(jednotkaPolozky)].map(o => o.label);
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Množství `mnozstvi` zadané v jednotce `zadana` přepočtené do jednotky
 * `cilova`. Mezi různými rodinami (ml → ks) se převést nedá — pak se číslo
 * vrací beze změny, protože hádat převod by bylo horší než nic.
 * Zaokrouhluje na šest desetinných míst, aby 0,02 l nevyšlo jako 0,020000000000000004.
 */
export function prevedMnozstvi(mnozstvi: number, zadana: unknown, cilova: unknown): number {
  const m = Number(mnozstvi) || 0;
  if (rodinaJednotky(zadana) !== rodinaJednotky(cilova)) return m;
  return round6((m * faktorJednotky(zadana)) / faktorJednotky(cilova));
}

/**
 * Jednotka, ve které je množství u položky vedené: obsah u balených
 * (s velikostí balení), jinak vlastní jednotka. Stejné pravidlo jako
 * `recipeUnit` ve výrobě. `contentUnit` a `packageSize` mají být efektivní
 * (včetně zděděných z kategorie — viz `efektivniBaleni` v lib/packaging).
 */
export function jednotkaMnozstvi(item: { unit?: unknown; contentUnit?: unknown; packageSize?: unknown }): string {
  const size = Number(item?.packageSize) || 0;
  const obsah = String(item?.contentUnit ?? '').trim();
  if (size > 0 && obsah) return obsah;
  return String(item?.unit ?? '').trim() || 'ks';
}

/**
 * Nejbližší rozumná jednotka pro cenu: cena za 1 ml je 0,004 Kč, což nikdo
 * nevyčte; cena za litr je 4 Kč. Vrací už přepočtenou cenu a její jednotku.
 */
export function cenaZaRozumnouJednotku(cenaZaJednotku: number, jednotka: unknown): { cena: number; jednotka: string } {
  const n = normJednotka(jednotka);
  // Bez jednotky se nemá co přepočítat ani pojmenovat — volající si dosadí vlastní slovo.
  if (!n) return { cena: cenaZaJednotku, jednotka: '' };
  const fam = rodinaJednotky(n);
  if (fam === 'ks') return { cena: cenaZaJednotku, jednotka: n };
  const base = fam; // 'l' | 'kg'
  const f = faktorJednotky(n);
  // g, ml, cl, dl, dkg → kg / l; l a kg zůstávají.
  if (f < 1) return { cena: cenaZaJednotku / f, jednotka: base };
  return { cena: cenaZaJednotku, jednotka: n };
}

/**
 * Co znamená pole „cena" u skladové položky: s velikostí balení je to cena
 * BALENÍ, bez ní cena jednotky (viz lib/recipeCost). Podle toho se řídí
 * popisek i přípona — na všech obrazovkách stejně.
 */
export function vyznamCeny(packageSize: unknown): 'baleni' | 'jednotka' {
  return Number(String(packageSize ?? '').replace(',', '.')) > 0 ? 'baleni' : 'jednotka';
}

/**
 * Smí se množství v téhle jednotce zapsat s desetinami? kg a l ano (2,5 kg),
 * g, ml a kusy ne — půl gramu ani půl kusu se ve skladu nepočítá. Říká to jen
 * o jednotce; jestli to sloupec v databázi unese, je jiná věc (lib/cenaSloupce).
 */
export function jednotkaSnesDesetiny(u: unknown): boolean {
  return ['kg', 'dkg', 'l', 'dl', 'cl'].includes(normJednotka(u));
}
