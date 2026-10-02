// Pravidla bodů, úrovní a cashbacku: čistá logika bez databáze.
//
// Jedno místo, které rozhoduje, kolik bodů a kreditu host dostane z účtu:
// minimální útrata, vyloučené položky a část zaplacená kreditem nebo poukazem,
// zaokrouhlení, násobič podle úrovně nebo bonusové akce, strop na účtenku
// a na den. Stejnou funkci volá server při připsání i správa při náhledu
// „kolik by host dostal z účtu X“, takže náhled nemůže lhát.
//
// Dál tu je validace pravidel z formuláře, porovnání dvou verzí pravidel
// (pro audit před/po), degradace úrovně po neaktivitě, plán propadání kreditu
// a CSV deníku. Nic z toho nesahá do databáze.

import { czCount, type CzNoun } from './czech.ts';
import { dayPlus, pragueDayOf, pragueToday, pragueHM, parseDbTime } from './pragueTime.ts';
import { fmtCislo } from './i18n/format.ts';
import type { TierId } from './clientSlots.ts';

/** České číslo s mezerou po tisících (správa je česky). */
const cz = (n: number) => fmtCislo(n, { locale: 'cs' });

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
const POLOZKA: CzNoun = { one: 'položka', few: 'položky', many: 'položek' };
const KATEGORIE: CzNoun = { one: 'kategorie', few: 'kategorie', many: 'kategorií' };

// ---- Zaokrouhlení ---------------------------------------------------------------

export type Zaokrouhleni = 'floor100' | 'carry' | 'floor' | 'round' | 'ceil';

export const ZAOKROUHLENI: { id: Zaokrouhleni; label: string; hint: string }[] = [
  { id: 'floor100', label: 'Celé stovky', hint: 'Body jen za každých celých 100. Z útraty 250 jsou body za 200, zbytek propadne.' },
  { id: 'carry', label: 'Celé stovky, zbytek se přenáší', hint: 'Jako celé stovky, ale zbytek pod 100 se přičte k příští útratě hosta. Nic se neztratí.' },
  { id: 'floor', label: 'Přesně, dolů', hint: 'Body podle přesné částky, zlomek se zahodí. Z útraty 250 při 5 bodech za 100 je 12 bodů.' },
  { id: 'round', label: 'Přesně, na nejbližší', hint: 'Body podle přesné částky, zlomek se zaokrouhlí. Z útraty 250 při 5 bodech za 100 je 13 bodů.' },
  { id: 'ceil', label: 'Přesně, nahoru', hint: 'Body podle přesné částky, zlomek se zaokrouhlí nahoru. Hostům nejštědřejší.' },
];

export function jeZaokrouhleni(v: unknown): v is Zaokrouhleni {
  return ZAOKROUHLENI.some(z => z.id === v);
}

// ---- Pravidla -------------------------------------------------------------------

export interface PravidlaBodu {
  pointsPer100: number;
  cashbackPct: number;
  cashbackMode: 'credit' | 'points';
  zaokrouhleni: Zaokrouhleni;
  /** Pod touhle částkou (po odpočtech) host nedostane nic. 0 = bez minima. */
  minSpend: number;
  /** Nejvíc bodů z jedné účtenky. 0 = bez stropu. */
  capBill: number;
  /** Nejvíc bodů z útraty za jeden den (pražský) na hosta. 0 = bez stropu. */
  capDay: number;
  /** Část účtu zaplacená kreditem nebo poukazem se do základu nepočítá. */
  excludeCredit: boolean;
  exclProducts: string[];
  exclCategories: string[];
  multSilver: number;
  multGold: number;
  multPlatinum: number;
}

export const MAX_NASOBIC_UROVNE = 5;
/** Uvítací body, které nový člen dostával vždycky (než šly nastavit). */
export const UVITACI_VYCHOZI = 10;

/** Kolik uvítacích bodů nový člen dostane: nastavená hodnota, jinak dřívější chování (10, když podnik dává body za útratu). */
export function uvitaciBody(p: any): number {
  const v = p?.welcome_points;
  if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) return Math.max(0, Math.min(1000, Math.trunc(Number(v))));
  return Number(p?.points_per_100) > 0 ? UVITACI_VYCHOZI : 0;
}
export const MAX_STROP = 1_000_000;
export const MAX_MIN_UTRATA = 100_000;
export const MAX_DNI = 3650;
export const MAX_VYLOUCENI = 200;

export const VYCHOZI_PRAVIDLA: PravidlaBodu = {
  pointsPer100: 5, cashbackPct: 0, cashbackMode: 'credit', zaokrouhleni: 'floor100',
  minSpend: 0, capBill: 0, capDay: 0, excludeCredit: false, exclProducts: [], exclCategories: [],
  multSilver: 1, multGold: 1, multPlatinum: 1,
};

/** Sloupce client_profiles, které patří do rozšířených pravidel (jsou v konceptu a ve verzích). */
export const KLICE_ROZSIRENE = [
  'points_round', 'points_min_spend', 'points_cap_bill', 'points_cap_day', 'points_excl_credit',
  'loyalty_excl_products', 'loyalty_excl_categories', 'mult_silver', 'mult_gold', 'mult_platinum',
  'tier_inactive_days', 'credit_expire_days', 'welcome_points',
] as const;
export type KlicRozsireny = typeof KLICE_ROZSIRENE[number];

/** Všechny klíče, jejichž změna se zapisuje do verzí pravidel (základní i rozšířené). */
export const KLICE_VERZI = [
  'points_per_100', 'cashback_pct', 'cashback_mode', 'birthday_points', 'referral_points', 'points_expire_days',
  'tier_by', 'silver_at', 'gold_at', 'platinum_at', 'silver_spend', 'gold_spend', 'platinum_spend',
  'member_discount', 'silver_discount', 'gold_discount', 'platinum_discount',
  ...KLICE_ROZSIRENE,
] as const;

const cislo = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };

function seznam(v: unknown): string[] {
  let a: unknown = v;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = []; } }
  return Array.isArray(a) ? a.map(x => String(x ?? '').trim()).filter(Boolean) : [];
}

/** Řádek client_profiles (snake_case) → pravidla. Chybějící nebo poškozená hodnota = výchozí, nikdy NaN. */
export function pravidlaZProfilu(p: any): PravidlaBodu {
  const d = VYCHOZI_PRAVIDLA;
  const mult = (v: unknown) => { const n = cislo(v, 1); return n >= 1 && n <= MAX_NASOBIC_UROVNE ? Math.round(n * 100) / 100 : 1; };
  const nez = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.trunc(cislo(v, 0))));
  return {
    pointsPer100: nez(p?.points_per_100 ?? d.pointsPer100, 100),
    cashbackPct: nez(p?.cashback_pct, 50),
    cashbackMode: p?.cashback_mode === 'points' ? 'points' : 'credit',
    zaokrouhleni: jeZaokrouhleni(p?.points_round) ? p.points_round : d.zaokrouhleni,
    minSpend: nez(p?.points_min_spend, MAX_MIN_UTRATA),
    capBill: nez(p?.points_cap_bill, MAX_STROP),
    capDay: nez(p?.points_cap_day, MAX_STROP),
    excludeCredit: p?.points_excl_credit === true,
    exclProducts: seznam(p?.loyalty_excl_products),
    exclCategories: seznam(p?.loyalty_excl_categories),
    multSilver: mult(p?.mult_silver), multGold: mult(p?.mult_gold), multPlatinum: mult(p?.mult_platinum),
  };
}

/** Násobič bodů podle úrovně (Člen = 1). Vyšší úroveň nikdy nemá míň než ta pod ní, i když ji vedení nevyplnilo. */
export function nasobicUrovne(r: PravidlaBodu, uroven: TierId | string): number {
  const s = Math.max(1, r.multSilver);
  const g = Math.max(s, r.multGold);
  if (uroven === 'silver') return s;
  if (uroven === 'gold') return g;
  if (uroven === 'platinum') return Math.max(g, r.multPlatinum);
  return 1;
}

// ---- Validace formuláře ---------------------------------------------------------

export type VysledekValidace<T> = { ok: true; value: T } | { ok: false; error: string };

/** Hodnoty rozšířených pravidel v tvaru sloupců (po validaci). */
export interface RozsirenaPravidla {
  points_round: Zaokrouhleni;
  points_min_spend: number;
  points_cap_bill: number;
  points_cap_day: number;
  points_excl_credit: boolean;
  loyalty_excl_products: string[];
  loyalty_excl_categories: string[];
  mult_silver: number;
  mult_gold: number;
  mult_platinum: number;
  tier_inactive_days: number;
  credit_expire_days: number;
  welcome_points: number;
}

function celeCislo(raw: unknown, jmeno: string, min: number, max: number): VysledekValidace<number> {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (s === '') return { ok: true, value: 0 };
  const n = Number(s);
  if (!Number.isFinite(n) || Math.floor(n) !== n) return { ok: false, error: `${jmeno}: zadej celé číslo.` };
  if (n < min || n > max) return { ok: false, error: `${jmeno}: povolené je ${cz(min)} až ${cz(max)}.` };
  return { ok: true, value: n };
}

function nasobic(raw: unknown, jmeno: string): VysledekValidace<number> {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (s === '') return { ok: true, value: 1 };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: `${jmeno}: zadej číslo, třeba 1,5.` };
  if (n < 1 || n > MAX_NASOBIC_UROVNE) return { ok: false, error: `${jmeno}: násobič musí být mezi 1 a ${MAX_NASOBIC_UROVNE}.` };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function textovySeznam(raw: unknown, jmeno: string): VysledekValidace<string[]> {
  const out: string[] = [];
  for (const x of seznam(raw)) {
    const t = x.slice(0, 100);
    if (!out.some(o => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  if (out.length > MAX_VYLOUCENI) return { ok: false, error: `${jmeno}: nejvíc ${MAX_VYLOUCENI} položek.` };
  return { ok: true, value: out };
}

/**
 * Zkontroluje rozšířená pravidla z formuláře. Chybějící pole bere z `cur`
 * (částečný PUT nic nemaže). Neplatné číslo je chyba, ne nula.
 */
export function normalizujRozsirena(raw: any, cur?: any): VysledekValidace<RozsirenaPravidla> {
  const z = (k: string) => (raw?.[k] !== undefined ? raw[k] : cur?.[k]);
  const zaokr = z('points_round') ?? 'floor100';
  if (!jeZaokrouhleni(zaokr)) return { ok: false, error: 'Neznámý způsob zaokrouhlení.' };
  const min = celeCislo(z('points_min_spend'), 'Minimální útrata', 0, MAX_MIN_UTRATA); if (!min.ok) return min;
  const capB = celeCislo(z('points_cap_bill'), 'Strop na účtenku', 0, MAX_STROP); if (!capB.ok) return capB;
  const capD = celeCislo(z('points_cap_day'), 'Strop za den', 0, MAX_STROP); if (!capD.ok) return capD;
  if (capB.value > 0 && capD.value > 0 && capD.value < capB.value) {
    return { ok: false, error: 'Strop za den nesmí být menší než strop na účtenku, jinak by ho jedna účtenka nikdy nevyužila.' };
  }
  const ms = nasobic(z('mult_silver'), 'Stříbrný host'); if (!ms.ok) return ms;
  const mg = nasobic(z('mult_gold'), 'Zlatý host'); if (!mg.ok) return mg;
  const mp = nasobic(z('mult_platinum'), 'Platinový host'); if (!mp.ok) return mp;
  const ina = celeCislo(z('tier_inactive_days'), 'Snížení úrovně po neaktivitě', 0, MAX_DNI); if (!ina.ok) return ina;
  if (ina.value > 0 && ina.value < 7) return { ok: false, error: 'Snížení úrovně po neaktivitě: nejméně 7 dní (0 = úroveň platí natrvalo).' };
  const cre = celeCislo(z('credit_expire_days'), 'Propadnutí kreditu', 0, MAX_DNI); if (!cre.ok) return cre;
  if (cre.value > 0 && cre.value < 7) return { ok: false, error: 'Propadnutí kreditu: nejméně 7 dní (0 = kredit nepropadá).' };
  // Chybějící hodnota = dnešní chování (10 bodů); prázdné pole ve formuláři = 0 (nedávat).
  const uv = z('welcome_points');
  const wel = uv === undefined || uv === null ? { ok: true as const, value: UVITACI_VYCHOZI } : celeCislo(uv, 'Uvítací body', 0, 1000); if (!wel.ok) return wel;
  const prod = textovySeznam(z('loyalty_excl_products'), 'Vyloučené položky'); if (!prod.ok) return prod;
  const kat = textovySeznam(z('loyalty_excl_categories'), 'Vyloučené kategorie'); if (!kat.ok) return kat;
  return {
    ok: true,
    value: {
      points_round: zaokr, points_min_spend: min.value, points_cap_bill: capB.value, points_cap_day: capD.value,
      points_excl_credit: z('points_excl_credit') === true || z('points_excl_credit') === 'true',
      loyalty_excl_products: prod.value, loyalty_excl_categories: kat.value,
      mult_silver: ms.value, mult_gold: mg.value, mult_platinum: mp.value,
      tier_inactive_days: ina.value, credit_expire_days: cre.value, welcome_points: wel.value,
    },
  };
}

/**
 * Prahy úrovní: stejná pravidla, která server dřív potichu „opravoval"
 * (zlato nad stříbrem, platina nad zlatem), tady jako srozumitelná chyba,
 * ať UI i server říkají totéž. Vrací text chyby, nebo null.
 */
export function zkontrolujPrahy(p: any): string | null {
  const spend = p?.tier_by === 'spend';
  const s = cislo(spend ? p?.silver_spend : p?.silver_at, 0);
  const g = cislo(spend ? p?.gold_spend : p?.gold_at, 0);
  const pl = cislo(spend ? p?.platinum_spend : p?.platinum_at, 0);
  const jednotka = spend ? 'útrata' : 'návštěvy';
  if (s < 1) return `Stříbrný host: ${jednotka} musí být aspoň 1.`;
  if (g <= s) return `Zlatý host musí mít vyšší práh než stříbrný (${jednotka}).`;
  if (pl > 0 && pl <= g) return `Platinový host musí mít vyšší práh než zlatý, nebo 0 pro vypnutou platinu (${jednotka}).`;
  return null;
}

/** Nejvyšší hodnota prahu, kterou server uloží (UI ji dává do `max`, ať se nic potichu neořezává). */
export const MAX_PRAH_NAVSTEV = { silver: 500, gold: 1000, platinum: 2000 };

// ---- Výpočet odměny -------------------------------------------------------------

export interface VstupOdmeny {
  /** Částka účtu (celé jednotky měny). */
  castka: number;
  /** Z toho zaplaceno kreditem / poukazem (jen když excludeCredit). */
  zaplacenoKreditem?: number;
  /** Z toho za vyloučené položky a kategorie. */
  vylouceno?: number;
  /** Úroveň hosta v okamžiku připsání. */
  uroven: TierId | string;
  /** Násobič z bonusové akce (Happy hour); 1 = žádná. */
  bonusNasobic?: number;
  /** Název bonusové akce do poznámky. */
  bonusNazev?: string;
  /** Kolik bodů z útrat už host dnes dostal (pro strop za den). */
  dnesUzBodu?: number;
  /** Přenesený zbytek pod 100 z minulé útraty (jen režim carry). */
  zbytek?: number;
}

export interface VysledekOdmeny {
  /** Částka, ze které se počítá (po odpočtech). */
  zaklad: number;
  body: number;
  cashback: number;
  /** Nový přenesený zbytek (jen carry; jinak 0). */
  zbytekNovy: number;
  /** Násobič, který se opravdu použil. */
  nasobic: number;
  /** Odkud násobič je: úroveň, akce, nebo žádný. */
  nasobicZdroj: 'uroven' | 'akce' | null;
  /** Násobič slovy pro obsluhu („dvojnásobné body, Happy hour“), prázdné bez násobiče. */
  nasobicPopis: string;
  /** Co body omezilo. */
  omezeno: 'minimum' | 'strop_ucet' | 'strop_den' | null;
  /** Kolik bodů by bylo bez stropu (jen když strop zasáhl). */
  bodyBezStropu: number;
  /** Věty pro obsluhu, deník a náhled. */
  poznamky: string[];
}

const kladne = (v: unknown) => Math.max(0, Math.round(cislo(v, 0)));

function zaokrouhli(x: number, mod: Zaokrouhleni): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  // Tolerance proti plovoucí čárce: 0,1 × 3 = 0,30000000000000004 nesmí dát špatné „nahoru".
  const e = Math.round(x * 1e6) / 1e6;
  if (mod === 'round') return Math.round(e);
  if (mod === 'ceil') return Math.ceil(e);
  return Math.floor(e);
}

/**
 * Kolik bodů a cashbacku host dostane. Pořadí: základ (účet bez vyloučených
 * položek a bez části zaplacené kreditem) → minimální útrata → body podle
 * zaokrouhlení → vyšší z násobiče úrovně a bonusové akce (nikdy součin, aby
 * host nedostal nečekaně hodně) → strop na účtenku → strop za den.
 * Cashback se počítá z téhož základu a minimum platí i pro něj.
 */
export function vypocitejOdmenu(v: VstupOdmeny, r: PravidlaBodu): VysledekOdmeny {
  const poznamky: string[] = [];
  const castka = kladne(v.castka);
  let zaklad = castka;
  const vyl = Math.min(zaklad, kladne(v.vylouceno));
  if (vyl > 0) { zaklad -= vyl; poznamky.push('bez vyloučených položek'); }
  if (r.excludeCredit) {
    const kr = Math.min(zaklad, kladne(v.zaplacenoKreditem));
    if (kr > 0) { zaklad -= kr; poznamky.push('bez části zaplacené kreditem nebo poukazem'); }
  }
  const prazdny: VysledekOdmeny = { zaklad, body: 0, cashback: 0, zbytekNovy: kladne(v.zbytek), nasobic: 1, nasobicZdroj: null, nasobicPopis: '', omezeno: null, bodyBezStropu: 0, poznamky };
  if (zaklad <= 0) return prazdny;
  if (r.minSpend > 0 && zaklad < r.minSpend) {
    poznamky.push(`pod minimální útratou ${cz(r.minSpend)}`);
    return { ...prazdny, omezeno: 'minimum' };
  }

  const pp = Math.max(0, cislo(r.pointsPer100, 0));
  let hruby = 0; let zbytekNovy = 0;
  if (r.zaokrouhleni === 'floor100') hruby = Math.floor(zaklad / 100) * pp;
  else if (r.zaokrouhleni === 'carry') {
    const soucet = zaklad + kladne(v.zbytek);
    const stovky = Math.floor(soucet / 100);
    hruby = stovky * pp; zbytekNovy = soucet - stovky * 100;
  } else hruby = zaokrouhli(zaklad * pp / 100, r.zaokrouhleni);

  const mU = nasobicUrovne(r, v.uroven);
  const mA = Math.max(1, cislo(v.bonusNasobic, 1));
  const m = Math.max(mU, mA);
  const zdroj: 'uroven' | 'akce' | null = m <= 1 ? null : mA >= mU ? 'akce' : 'uroven';
  let body = hruby;
  let nasobicPopis = '';
  if (m > 1 && hruby > 0) {
    body = Math.max(hruby, zaokrouhli(hruby * m, r.zaokrouhleni === 'round' || r.zaokrouhleni === 'ceil' ? r.zaokrouhleni : 'floor'));
    nasobicPopis = zdroj === 'akce' ? `${popisNasobiceKratce(m)}${v.bonusNazev ? `, ${v.bonusNazev}` : ''}` : `${popisNasobiceKratce(m)} za úroveň`;
    poznamky.push(zdroj === 'akce' ? `${popisNasobiceKratce(m)}${v.bonusNazev ? ` (${v.bonusNazev})` : ''}` : `${popisNasobiceKratce(m)} za úroveň`);
  }

  const bodyBezStropu = body;
  let omezeno: VysledekOdmeny['omezeno'] = null;
  if (r.capBill > 0 && body > r.capBill) { body = r.capBill; omezeno = 'strop_ucet'; poznamky.push(`strop ${czCount(r.capBill, BOD)} na účtenku`); }
  if (r.capDay > 0) {
    const zbyva = Math.max(0, r.capDay - kladne(v.dnesUzBodu));
    if (body > zbyva) { body = zbyva; omezeno = 'strop_den'; poznamky.push(`strop ${czCount(r.capDay, BOD)} za den`); }
  }

  const pct = Math.max(0, cislo(r.cashbackPct, 0));
  const cashback = pct > 0 ? Math.floor(Math.round(zaklad * pct) / 100) : 0;
  return { zaklad, body, cashback, zbytekNovy, nasobic: m, nasobicZdroj: zdroj, nasobicPopis, omezeno, bodyBezStropu: omezeno ? bodyBezStropu : 0, poznamky };
}

function popisNasobiceKratce(m: number): string {
  if (m === 2) return 'dvojnásobné body';
  if (m === 3) return 'trojnásobné body';
  return `${String(Math.round(m * 100) / 100).replace('.', ',')}× body`;
}

/** Poznámka do deníku z výsledku výpočtu: „Útrata 450 Kč z účtenky — dvojnásobné body (Happy hour), strop …“. */
export function poznamkaOdmeny(zaklad: string, v: VysledekOdmeny): string {
  return `${zaklad}${v.poznamky.length ? ` — ${v.poznamky.join(', ')}` : ''}`.slice(0, 200);
}

// ---- Skutečná změna zůstatku (deník nesmí lhát) -----------------------------------

/**
 * Zůstatek nejde pod nulu. Do deníku se proto píše to, co se opravdu stalo,
 * ne to, co se žádalo: odečet 50 bodů hostovi s 30 body je v deníku −30.
 */
export function skutecnaZmena(stare: number, pozadovano: number): number {
  const s = Math.max(0, Math.trunc(cislo(stare, 0)));
  const d = Math.trunc(cislo(pozadovano, 0));
  return Math.max(-s, d);
}

// ---- Úroveň: platnost a degradace -------------------------------------------------

export const PORADI_UROVNI: TierId[] = ['bronze', 'silver', 'gold', 'platinum'];

/** Kolik dní je host bez návštěvy (pražské dny); null, když návštěva není známa. */
export function dniBezNavstevy(lastVisit: string | Date | null | undefined, dnes: string = pragueToday()): number | null {
  const d = parseDbTime(lastVisit as any);
  if (!d) return null;
  const a = Date.parse(`${pragueDayOf(d)}T12:00:00Z`);
  const b = Date.parse(`${dnes}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** O kolik stupňů úroveň klesla: jeden stupeň za každých `platnost` dní bez návštěvy. 0 = vypnuto. */
export function stupnuDolu(neaktivniDni: number | null, platnost: number): number {
  const p = Math.trunc(cislo(platnost, 0));
  if (p <= 0 || neaktivniDni == null || neaktivniDni < p) return 0;
  return Math.floor(neaktivniDni / p);
}

/** Úroveň po snížení; níž než „Člen“ to nejde. */
export function snizUroven(id: TierId, stupnu: number): TierId {
  const i = Math.max(0, PORADI_UROVNI.indexOf(id));
  return PORADI_UROVNI[Math.max(0, i - Math.max(0, Math.trunc(stupnu)))];
}

/** Kdy nejdřív úroveň klesne: den poslední návštěvy + platnost. Null, když nic nehrozí. */
export function kdyKlesne(lastVisit: string | Date | null | undefined, platnost: number): string | null {
  const d = parseDbTime(lastVisit as any);
  const p = Math.trunc(cislo(platnost, 0));
  if (!d || p <= 0) return null;
  return dayPlus(pragueDayOf(d), p);
}

export const NAZEV_UROVNE: Record<string, string> = { bronze: 'Člen', silver: 'Stříbrný host', gold: 'Zlatý host', platinum: 'Platinový host' };

/** Text oznámení při změně úrovně; null, když se nezměnila. */
export function oznameniUrovne(z: string | null, na: string, podnik: string): { title: string; body: string; nahoru: boolean } | null {
  if (!z || z === na) return null;
  const nahoru = PORADI_UROVNI.indexOf(na as TierId) > PORADI_UROVNI.indexOf(z as TierId);
  return nahoru
    ? { nahoru, title: `Gratulujeme, jsi ${NAZEV_UROVNE[na] ?? na} u ${podnik}`, body: 'Máš novou úroveň. Podívej se, co ti přináší.' }
    : { nahoru, title: `Úroveň u ${podnik} klesla na ${NAZEV_UROVNE[na] ?? na}`, body: 'Dlouho jsme tě neviděli. Stačí přijít a úroveň se začne vracet.' };
}

// ---- Propadání kreditu ------------------------------------------------------------

/** Řádek deníku pro propadání kreditu: změna kreditu a pražský den. */
export interface RadekKreditu { delta: number; day: string }

/** Deník člena → vstup plánu propadání kreditu (kreditové řádky, upozornění zvlášť). */
export function rozlisDenikKreditu(radky: any[], dnes: string): { vstup: RadekKreditu[]; poslednVarovani: string | null; dnesUz: boolean } {
  const vstup: RadekKreditu[] = [];
  let posledni: string | null = null; let dnesUz = false;
  for (const r of radky) {
    const ref = String(r.ref ?? '');
    if (r.kind === 'expire' && ref.startsWith('cwarn:')) {
      const d = ref.slice(6);
      if (!posledni || d > posledni) posledni = d;
      continue;
    }
    if (r.kind === 'expire' && ref === `cexp:${dnes}`) dnesUz = true;
    const delta = Math.trunc(cislo(r.credit_delta, 0));
    if (!delta) continue;
    const d = parseDbTime(r.created_at);
    vstup.push({ delta, day: d ? pragueDayOf(d) : '' });
  }
  return { vstup, poslednVarovani: posledni, dnesUz };
}

// ---- Verze pravidel: před a po ----------------------------------------------------

export interface ZmenaPravidla { key: string; label: string; before: string; after: string }

const POPISKY_KLICU: Record<string, string> = {
  points_per_100: 'Bodů za 100', cashback_pct: 'Cashback (%)', cashback_mode: 'Podoba cashbacku', birthday_points: 'Bodů k narozeninám',
  referral_points: 'Bodů za pozvání', points_expire_days: 'Propadnutí bodů (dny)', tier_by: 'Úrovně podle',
  silver_at: 'Stříbro (návštěvy)', gold_at: 'Zlato (návštěvy)', platinum_at: 'Platina (návštěvy)',
  silver_spend: 'Stříbro (útrata)', gold_spend: 'Zlato (útrata)', platinum_spend: 'Platina (útrata)',
  member_discount: 'Sleva Člen (%)', silver_discount: 'Sleva Stříbro (%)', gold_discount: 'Sleva Zlato (%)', platinum_discount: 'Sleva Platina (%)',
  points_round: 'Zaokrouhlení bodů', points_min_spend: 'Minimální útrata pro body', points_cap_bill: 'Strop bodů na účtenku',
  points_cap_day: 'Strop bodů za den', points_excl_credit: 'Nezapočítat část placenou kreditem', loyalty_excl_products: 'Vyloučené položky',
  loyalty_excl_categories: 'Vyloučené kategorie', mult_silver: 'Násobič Stříbro', mult_gold: 'Násobič Zlato', mult_platinum: 'Násobič Platina',
  tier_inactive_days: 'Snížení úrovně po neaktivitě (dny)', credit_expire_days: 'Propadnutí kreditu (dny)', welcome_points: 'Uvítací body',
};
const NULA_JE_VYPNUTO = new Set(['points_expire_days', 'points_min_spend', 'points_cap_bill', 'points_cap_day', 'tier_inactive_days', 'credit_expire_days', 'welcome_points', 'platinum_at', 'platinum_spend']);

function hodnotaText(key: string, v: any): string {
  if (key === 'points_round') return ZAOKROUHLENI.find(z => z.id === v)?.label ?? String(v ?? '');
  if (key === 'cashback_mode') return v === 'points' ? 'body' : 'kredit';
  if (key === 'tier_by') return v === 'spend' ? 'útrata' : 'návštěvy';
  if (key === 'points_excl_credit') return v === true ? 'ano' : 'ne';
  if (key === 'loyalty_excl_products') { const n = seznam(v).length; return n ? czCount(n, POLOZKA) : 'žádné'; }
  if (key === 'loyalty_excl_categories') { const n = seznam(v).length; return n ? czCount(n, KATEGORIE) : 'žádné'; }
  if (key.startsWith('mult_')) return `${String(Math.round(cislo(v, 1) * 100) / 100).replace('.', ',')}×`;
  const n = Number(v);
  if (Number.isFinite(n)) {
    if (n === 0 && NULA_JE_VYPNUTO.has(key)) return 'vypnuto';
    return cz(n);
  }
  return String(v ?? '');
}

const stejne = (key: string, a: any, b: any) => hodnotaText(key, a) === hodnotaText(key, b)
  && (key !== 'loyalty_excl_products' && key !== 'loyalty_excl_categories' || JSON.stringify(seznam(a)) === JSON.stringify(seznam(b)));

/** Co se mezi dvěma stavy profilu změnilo (jen klíče pravidel). Pořadí podle KLICE_VERZI. */
export function porovnejPravidla(pred: any, po: any, klice: readonly string[] = KLICE_VERZI): ZmenaPravidla[] {
  const out: ZmenaPravidla[] = [];
  for (const key of klice) {
    if (po?.[key] === undefined) continue;
    if (stejne(key, pred?.[key], po?.[key])) continue;
    out.push({ key, label: POPISKY_KLICU[key] ?? key, before: hodnotaText(key, pred?.[key]), after: hodnotaText(key, po?.[key]) });
  }
  return out;
}

/** Zmeny jednou větou pro historii změn („Bodů za 100: 5 → 8; Strop na účtenku: vypnuto → 200“), do 300 znaků. */
export function popisZmen(zmeny: ZmenaPravidla[], verze?: number): string {
  if (!zmeny.length) return 'beze změny';
  const text = zmeny.map(z => `${z.label}: ${z.before} → ${z.after}`).join('; ');
  const s = verze ? `Verze ${verze}: ${text}` : text;
  return s.length > 300 ? `${s.slice(0, 297)}…` : s;
}

/** Vybere z profilu jen klíče pravidel (snímek pro verzi). */
export function snimekPravidel(p: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of KLICE_VERZI) if (p?.[k] !== undefined) out[k] = p[k];
  return out;
}

// ---- Druhy v deníku a zdroje bodů --------------------------------------------------

export const POPISEK_DRUHU: Record<string, string> = {
  visit: 'Návštěva', order: 'Objednávka od stolu', manual: 'Ruční zápis nebo útrata u kasy', coupon: 'Kupon', welcome: 'Uvítací body',
  birthday: 'Narozeniny', referral: 'Pozvání kamaráda', cashback: 'Cashback', credit: 'Platba kreditem', expire: 'Propadnutí',
  reactivation: 'Chybíš nám', storno: 'Storno účtenky',
};

/** Z druhu a odkazu v deníku udělá zdroj bodů pro přehled („Z účtenky“, „Útrata u kasy“, „Ruční úprava“…). */
export function zdrojBodu(kind: string, refTyp: string): string {
  if (kind === 'manual') {
    if (refTyp === 'bill') return 'Z účtenky z pokladny';
    if (refTyp === 'card') return 'Útrata zadaná u kasy';
    return 'Ruční úprava vedením';
  }
  if (kind === 'order') return 'Objednávky od stolu';
  if (kind === 'cashback') return 'Cashback v bodech';
  return POPISEK_DRUHU[kind] ?? kind;
}

// ---- CSV deníku -------------------------------------------------------------------

export const CSV_DENIK_HLAVICKA = ['Datum a čas', 'Host', 'E-mail', 'Druh', 'Body', 'Kredit', 'Útrata', 'Poznámka', 'Odkaz'];

function csvPole(v: unknown): string {
  const s = String(v ?? '');
  // Buňka začínající = + - @ by Excel vzal jako vzorec; apostrof ho ukáže jako text.
  const bezpecne = /^[=+@]/.test(s) || (/^-/.test(s) && !/^-\d+([.,]\d+)?$/.test(s)) ? `'${s}` : s;
  return /[";\n\r]/.test(bezpecne) ? `"${bezpecne.replace(/"/g, '""')}"` : bezpecne;
}

/** Datum a čas pražsky pro CSV: „2026-10-02 14:05“. */
export function csvCas(v: unknown): string {
  const d = parseDbTime(v as any);
  if (!d) return '';
  const den = pragueDayOf(d);
  return `${den} ${pragueHM(d)}`;
}

/**
 * Deník jako CSV pro Excel: středník, desetinná čárka, BOM kvůli diakritice.
 * Čísla jsou čísla (ne text s mezerou), ať se dají sčítat.
 */
export function denikCsv(radky: { created_at: unknown; name?: string | null; email?: string | null; kind: string; delta: number | string | null; credit_delta?: number | string | null; amount?: number | string | null; note?: string | null; ref?: string | null }[]): string {
  const cs = (v: unknown) => (v == null || v === '' ? '' : String(Number(v)).replace('.', ','));
  const out = [CSV_DENIK_HLAVICKA.join(';')];
  for (const r of radky) {
    out.push([
      csvCas(r.created_at), r.name ?? '', r.email ?? '', POPISEK_DRUHU[r.kind] ?? r.kind,
      cs(Number(r.delta) || 0), cs(Number(r.credit_delta) || 0), cs(r.amount), r.note ?? '', r.ref ?? '',
    ].map(csvPole).join(';'));
  }
  return `﻿${out.join('\r\n')}\r\n`;
}

// ---- Souhrnné texty pro správu ----------------------------------------------------

/** Věta pod polem: co dnes pravidla dělají (jednotky = ty, které se zadávají). */
export function shrnutiPravidel(r: PravidlaBodu, symbol: string): string[] {
  const out: string[] = [];
  if (r.minSpend > 0) out.push(`Body a cashback jen z účtu od ${cz(r.minSpend)} ${symbol}.`);
  if (r.capBill > 0) out.push(`Z jedné účtenky nejvýš ${czCount(r.capBill, BOD)}.`);
  if (r.capDay > 0) out.push(`Za jeden den nejvýš ${czCount(r.capDay, BOD)} na hosta.`);
  if (r.excludeCredit) out.push('Část účtu zaplacená kreditem nebo poukazem body nedává.');
  const nv = r.exclProducts.length + r.exclCategories.length;
  if (nv > 0) out.push(`Vyloučeno: ${[r.exclProducts.length ? czCount(r.exclProducts.length, POLOZKA) : '', r.exclCategories.length ? czCount(r.exclCategories.length, KATEGORIE) : ''].filter(Boolean).join(' a ')}.`);
  if (r.multSilver > 1 || r.multGold > 1 || r.multPlatinum > 1) out.push('Vyšší úrovně dostávají body s násobičem (nebo s násobičem akce, vždy tím vyšším).');
  return out;
}

// ---- Vyloučené položky a kategorie --------------------------------------------------

/** Položka účtu pro odpočet vyloučených: id produktu v pokladně, kategorie a řádková částka. */
export interface PolozkaUctu {
  productId: string | null;
  /** Id kategorie z účtenky. */
  categoryId?: string | null;
  /** Název kategorie produktu (z katalogu pokladny). */
  kategorie?: string | null;
  /** Částka řádku (cena × množství). */
  castka: number;
}

const klic = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** Je položka vyloučená? Produkt podle id, kategorie podle id nebo názvu (bez ohledu na velikost písmen). */
export function jeVylouceno(p: PolozkaUctu, r: Pick<PravidlaBodu, 'exclProducts' | 'exclCategories'>): boolean {
  const produkty = new Set(r.exclProducts.map(klic));
  const kategorie = new Set(r.exclCategories.map(klic));
  if (p.productId && produkty.has(klic(p.productId))) return true;
  if (p.categoryId && kategorie.has(klic(p.categoryId))) return true;
  if (p.kategorie && kategorie.has(klic(p.kategorie))) return true;
  return false;
}

/** Součet vyloučených položek; nikdy nezáporný a nikdy víc než `celkem` (když je znám). */
export function vyloucenaCastka(polozky: PolozkaUctu[], r: Pick<PravidlaBodu, 'exclProducts' | 'exclCategories'>, celkem?: number): number {
  if (!r.exclProducts.length && !r.exclCategories.length) return 0;
  let s = 0;
  for (const p of polozky) if (jeVylouceno(p, r)) s += Math.max(0, Number(p.castka) || 0);
  const x = Math.round(s);
  return celkem != null ? Math.min(x, Math.max(0, Math.round(celkem))) : x;
}

/** Součet toho, co na účtence zaplatil kredit, poukaz nebo věrnostní způsob (podle rozpadu plateb z pokladny). */
export function castKreditem(methods: Record<string, number> | null | undefined): number {
  let s = 0;
  for (const [k, v] of Object.entries(methods ?? {})) {
    const m = k.toLowerCase();
    if (m === 'loyalty' || m === 'voucher' || m === 'gift' || m === 'prepaidcredit') s += Math.max(0, Number(v) || 0);
  }
  return Math.round(s);
}

// ---- Storno účtenky -----------------------------------------------------------------

/** Kolik se z původního připsání vrací při stornu: podíl vráceného účtu, nejvýš to, co zbývá. */
export function castStorna(pripsano: number, uzVraceno: number, podil: number): number {
  const p = Math.max(0, Math.trunc(Number(pripsano) || 0));
  const zbyva = Math.max(0, p - Math.max(0, Math.trunc(Number(uzVraceno) || 0)));
  const k = Math.max(0, Math.min(1, Number(podil) || 0));
  return k >= 0.999 ? zbyva : Math.min(zbyva, Math.round(p * k));
}
