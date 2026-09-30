// Průvodce prvotním nastavením — společné typy a pevné seznamy.
//
// Čistý soubor bez Reactu a bez databáze: berou si ho server (API, aplikace
// nastavení), klient (kroky) i testy (`npm test` pouští .ts přímo v Node,
// proto relativní cesty s příponou a žádné aliasy).
//
// Stav průvodce žije v jednom sloupci `teams.onboarding` (JSONB). Podniky
// založené před průvodcem mají NULL a průvodce nikdy neuvidí.

export type StavPruvodce = 'nove' | 'rozpracovano' | 'preskoceno' | 'hotovo';
export const STAVY: readonly StavPruvodce[] = ['nove', 'rozpracovano', 'preskoceno', 'hotovo'];

export type KrokId = 'vitej' | 'typ' | 'podnik' | 'doba' | 'tym' | 'cile' | 'kasa' | 'shrnuti' | 'hotovo';
export const KROKY_VSECHNY: readonly KrokId[] = ['vitej', 'typ', 'podnik', 'doba', 'tym', 'cile', 'kasa', 'shrnuti', 'hotovo'];

export type TypPodniku = 'kavarna' | 'restaurace' | 'bar' | 'pekarna' | 'caj' | 'foodtruck' | 'jine';

export interface DefiniceTypu {
  id: TypPodniku;
  /** Štítek typu. Nesmí obsahovat „čajovna" (kontrola univerzálních textů). */
  nazev: string;
  veta: string;
  /** Fotka v components/pruvodce/foto.ts; „jiné" fotku nemá. */
  foto: 'kavarna' | 'restaurace' | 'bar' | 'pekarna' | 'caj' | 'foodtruck' | null;
}

export const TYPY: readonly DefiniceTypu[] = [
  { id: 'kavarna', nazev: 'Kavárna', veta: 'Káva, dezerty a ranní špička.', foto: 'kavarna' },
  { id: 'restaurace', nazev: 'Restaurace', veta: 'Kuchyně, sál a obědová špička.', foto: 'restaurace' },
  { id: 'bar', nazev: 'Bar', veta: 'Večerní provoz a zavírání po půlnoci.', foto: 'bar' },
  { id: 'pekarna', nazev: 'Pekárna', veta: 'Brzké ráno a čerstvé pečivo.', foto: 'pekarna' },
  { id: 'caj', nazev: 'Čajový podnik', veta: 'Čaje, nápoje a klidnější tempo.', foto: 'caj' },
  { id: 'foodtruck', nazev: 'Stánek nebo foodtruck', veta: 'Jedno okénko a jeden tým.', foto: 'foodtruck' },
  { id: 'jine', nazev: 'Jiný podnik', veta: 'Obchod, bistro nebo něco mezi tím.', foto: null },
];
export const TYPY_ID: readonly TypPodniku[] = TYPY.map(t => t.id);

export type Cil = 'rozvrh' | 'sklad' | 'uzaverky' | 'provoz' | 'hoste' | 'finance';
export const CILE_ID: readonly Cil[] = ['rozvrh', 'sklad', 'uzaverky', 'provoz', 'hoste', 'finance'];

export type Tarif = 'zdarma' | 'pro' | 'max';

export interface DefiniceCile {
  id: Cil;
  nazev: string;
  veta: string;
  /** Tarif, od kterého funkce běží (štítek Pro / Max). */
  tarif: Tarif;
  /** Scéna živé ukázky (lib/demo/sceny.ts), nebo null = jen fotka. */
  scena: 'prehled' | 'rozvrh' | 'uzaverka' | 'sklad' | 'ukoly' | null;
  ikona: string;
  /** Jedna věta, co to dělá (text převzatý z prodejní stránky, ne nový marketing). */
  ukazka: string;
}

export const CILE: readonly DefiniceCile[] = [
  { id: 'rozvrh', nazev: 'Rozvrh a docházka', veta: 'Směny, dostupnost, píchačky.', tarif: 'zdarma', scena: 'rozvrh', ikona: 'calendar',
    ukazka: 'Generátor navrhne směny podle dostupnosti lidí a otevírací doby, ty je zkontroluješ a zveřejníš.' },
  { id: 'sklad', nazev: 'Sklad a objednávky', veta: 'Co dochází a co dokoupit.', tarif: 'zdarma', scena: 'sklad', ikona: 'box',
    ukazka: 'Minima, otevřená balení, inventura i ztráty. Co dochází, skočí do nákupního seznamu.' },
  { id: 'uzaverky', nazev: 'Uzávěrky a kasa', veta: 'Denní počítání hotovosti.', tarif: 'zdarma', scena: 'uzaverka', ikona: 'coins',
    ukazka: 'Uzávěrka patří směně. Kasa se spočítá po bankovkách a vedení ji uvidí hned.' },
  { id: 'provoz', nazev: 'Úkoly a postupy', veta: 'Otevírání, zavírání, úklid.', tarif: 'zdarma', scena: 'ukoly', ikona: 'check',
    ukazka: 'Postupy s kroky a připomínkami a úkoly, které mají termín i člověka.' },
  { id: 'hoste', nazev: 'Hosté', veta: 'Rezervace a věrnost.', tarif: 'max', scena: null, ikona: 'gift',
    ukazka: 'Rezervace, objednávky od stolu a věrnostní body hostů v jedné aplikaci.' },
  { id: 'finance', nazev: 'Finance a marže', veta: 'Tržby proti mzdám.', tarif: 'pro', scena: 'prehled', ikona: 'chart',
    ukazka: 'Měsíční přehled podniku: tržby, mzdy a nákupy vedle sebe.' },
];

export type Pokladna = 'storyous' | 'jina' | 'zadna';
export const POKLADNY: readonly Pokladna[] = ['storyous', 'jina', 'zadna'];

export type Zeme = 'CZ' | 'SK' | 'PL' | 'DE' | 'AT' | 'JINA';
export const ZEME_ID: readonly Zeme[] = ['CZ', 'SK', 'PL', 'DE', 'AT', 'JINA'];

export interface PredvolbaZeme { nazev: string; mena: string; locale: string; zacatekTydne: 0 | 1 }
/** `JINA` nemá předvolbu: měna a formát zůstanou, jak jsou, a volí se ručně. */
export const ZEME: Record<Zeme, PredvolbaZeme | null> = {
  CZ: { nazev: 'Česko', mena: 'CZK', locale: 'cs-CZ', zacatekTydne: 1 },
  SK: { nazev: 'Slovensko', mena: 'EUR', locale: 'sk-SK', zacatekTydne: 1 },
  PL: { nazev: 'Polsko', mena: 'PLN', locale: 'pl-PL', zacatekTydne: 1 },
  DE: { nazev: 'Německo', mena: 'EUR', locale: 'de-DE', zacatekTydne: 1 },
  AT: { nazev: 'Rakousko', mena: 'EUR', locale: 'de-DE', zacatekTydne: 1 },
  JINA: null,
};
export const NAZEV_ZEME: Record<Zeme, string> = { CZ: 'Česko', SK: 'Slovensko', PL: 'Polsko', DE: 'Německo', AT: 'Rakousko', JINA: 'Jiná země' };

/** Jeden den otevírací doby — přesně tvar `PUT /api/opening-hours`. */
export interface DobaDen { open: string; close: string; closed: boolean }
/** Klíče "0".."6", 0 = pondělí (nezávisle na začátku týdne podniku). */
export type Doba = Record<string, DobaDen>;

export type VelikostTymu = 'sam' | 'mali' | 'stredni' | 'velky';
export const VELIKOSTI_TYMU: readonly VelikostTymu[] = ['sam', 'mali', 'stredni', 'velky'];
export const NAZEV_VELIKOSTI: Record<VelikostTymu, string> = { sam: 'Jen já', mali: '2 až 3 lidé', stredni: '4 až 8 lidí', velky: '9 a víc lidí' };

export type KlicPolozky = 'smeny' | 'sklad' | 'postupy' | 'prehled' | 'pravidla';
export const POLOZKY_ID: readonly KlicPolozky[] = ['smeny', 'sklad', 'postupy', 'prehled', 'pravidla'];

export interface Odpovedi {
  typ?: TypPodniku;
  nazev?: string;
  adresa?: string;
  zeme?: Zeme;
  mena?: string;
  formatCisel?: string;
  zacatekTydne?: 0 | 1;
  doba?: Doba;
  tym?: { velikost?: VelikostTymu; pozice?: string; pozvanych?: number };
  cile?: Cil[];
  pokladna?: Pokladna;
  tablet?: boolean;
  hotovostVKase?: number;
  /** Co ze Shrnutí se má vytvořit; chybějící klíč = zapnuto. */
  polozky?: Partial<Record<KlicPolozky, boolean>>;
  /** Kroky, které člověk přeskočil (nic nevytváří a ve Shrnutí se neukážou). */
  preskoceno?: KrokId[];
}

export interface Onboarding {
  v: 1;
  stav: StavPruvodce;
  krok?: KrokId;
  zacato?: string | null;
  upraveno?: string | null;
  dokonceno?: string | null;
  odpovedi: Odpovedi;
  /** Ledger: klíč operace → otisk vstupu, se kterým se naposledy provedla. */
  pouzito: Record<string, string>;
}

export const PRAZDNY_STAV: Onboarding = { v: 1, stav: 'nove', odpovedi: {}, pouzito: {} };

/** Stav bez zápisu jednoho kroku: co se v průvodci vrací a co se smí přepsat. */
export type KlicOperace = 'podnik' | 'doba' | 'smeny' | 'pravidla' | 'sklad' | 'postupy' | 'prehled' | 'kasa';

export interface VysledekOperace {
  klic: KlicOperace;
  nazev: string;
  stav: 'ok' | 'preskoceno' | 'chyba';
  pocet?: number;
  poznamka?: string;
}

/** Podmínky zobrazení kroků: kroky, které se ukážou při daných odpovědích. */
export function krokyProOdpovedi(o: Odpovedi): KrokId[] {
  const out: KrokId[] = ['vitej', 'typ', 'podnik', 'doba', 'tym', 'cile'];
  // Kasa se ptá jen toho, komu na uzávěrkách záleží.
  if (o.cile?.includes('uzaverky')) out.push('kasa');
  out.push('shrnuti', 'hotovo');
  return out;
}

export function jeStav(v: unknown): v is StavPruvodce {
  return typeof v === 'string' && (STAVY as readonly string[]).includes(v);
}

/** Bezpečné převedení libovolné hodnoty na známý krok. */
export function jeKrok(v: unknown): v is KrokId {
  return typeof v === 'string' && (KROKY_VSECHNY as readonly string[]).includes(v);
}

/** Dlouho nedokončené průvodce se vrací na poslední známý krok. */
export function krokPoObnoveni(o: Onboarding): KrokId {
  const kroky = krokyProOdpovedi(o.odpovedi);
  const k = o.krok;
  if (k && kroky.includes(k) && k !== 'hotovo') return k;
  return 'vitej';
}

/** Přechody stavu: hotový průvodce se PUTem nevrací na `nove`. */
export function dalsiStav(dosavadni: StavPruvodce, pozadovany: StavPruvodce | undefined): StavPruvodce {
  if (!pozadovany) return dosavadni === 'nove' ? 'rozpracovano' : dosavadni;
  if (dosavadni === 'hotovo') return pozadovany === 'rozpracovano' ? 'rozpracovano' : 'hotovo';
  if (pozadovany === 'nove') return dosavadni;
  return pozadovany;
}
