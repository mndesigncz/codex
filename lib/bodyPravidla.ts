// Pravidla bodů a cashbacku — čistá část (bez databáze, jde testovat v `npm test`).
//
// Jedno místo pro všechno, co rozhoduje, kolik hostovi z účtu padne: zaokrouhlení,
// minimální útrata, strop na účtenku, část zaplacená kreditem nebo poukazem a
// vyloučené položky. Tentýž výpočet běží u kasy (staff/scan), při dokončení
// objednávky a v náhledu ve formuláři pravidel — host tak vždy dostane to, co
// vedení vidělo v náhledu.
//
// Dál tu je validace pravidel (sdílená serverem i formulářem), čitelný rozdíl
// pravidel pro historii změn, poctivá změna zůstatku pro deník a rozřazení
// řádků deníku na „skutečná návštěva" a „zdroj bodů" pro přehledy.

import type { TierRules } from './clientSlots.ts';
import { fmtCislo } from './i18n/format.ts';
import { pragueToday, dayPlus } from './pragueTime.ts';
import { platneDatum } from './rozvrhCsv.ts';

/** Číslo česky (oddělovač tisíců) pro hlášky správy, které jsou česky napevno. */
export const cisloCs = (n: number): string => fmtCislo(Number(n) || 0, { locale: 'cs' });

// ---- Meze (jedna konstanta pro server i formulář) ----------------------------

/** Nejvyšší práh úrovně v návštěvách. Server i formulář berou tuhle konstantu (dřív 500/1000 × 2000). */
export const MAX_PRAH_NAVSTEV = 2000;
/** Nejvyšší práh úrovně v útratě (celé jednotky měny podniku). */
export const MAX_PRAH_UTRATY = 100_000_000;
export const MAX_BODU_ZA_100 = 100;
export const MAX_CASHBACK_PCT = 50;
export const MAX_SLEVA_PCT = 90;
/** Strop bodů na účtenku a minimální útrata: shora omezené, ať překlep o tři nuly nic nerozbije. */
export const MAX_STROP_BODU = 100_000;
export const MAX_MIN_UTRATA = 100_000;
export const MAX_MESICU_NEAKTIVITY = 36;
export const MAX_VYLOUCENYCH_POLOZEK = 50;
/** Zůstatek bodů i kreditu se vejde do INTEGER s rezervou. */
export const MAX_ZUSTATEK = 2_000_000_000;
/** Horní mez jedné útraty zadané u kasy (shodná s kasou: 100 000). */
export const MAX_CASTKA_U_KASY = 100_000;

// ---- Zaokrouhlení -----------------------------------------------------------

export type ZaokrouhleniBodu = 'sta' | 'dolu' | 'nejblizsi';

export const ZAOKROUHLENI: { id: ZaokrouhleniBodu; label: string; hint: string }[] = [
  { id: 'sta', label: 'Za celé stovky', hint: 'Dosavadní chování: body dostane jen za plné stovky, zbytek propadne. Útrata 250 dá body za 200.' },
  { id: 'dolu', label: 'Poměrně, dolů', hint: 'Body podle přesné částky, zlomek se zahodí. Při 5 bodech za stovku dá útrata 250 celých 12 bodů.' },
  { id: 'nejblizsi', label: 'Poměrně, na nejbližší', hint: 'Body podle přesné částky, zlomek se zaokrouhlí. Při 5 bodech za stovku dá útrata 250 celých 13 bodů.' },
];

export function jeZaokrouhleni(v: unknown): v is ZaokrouhleniBodu {
  return v === 'sta' || v === 'dolu' || v === 'nejblizsi';
}

// ---- Pravidla z profilu -----------------------------------------------------

export interface VylouceneZboziPolozka { itemId: number; name: string }

export interface PravidlaBodu {
  pointsPer100: number;
  round: ZaokrouhleniBodu;
  /** Pod touhle (započitatelnou) částkou se body nepřipisují. 0 = bez minima. */
  minSpend: number;
  /** Nejvíc bodů z jedné účtenky. 0 = bez stropu. */
  capPerBill: number;
  /** Nezapočítávat část zaplacenou kreditem nebo poukazem (body ani cashback z nich). */
  excludePrepaid: boolean;
  cashbackPct: number;
}

const celeCislo = (v: unknown, lo: number, hi: number, vychozi: number): number => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return vychozi;
  return Math.max(lo, Math.min(hi, n));
};

/** Řádek client_profiles (snake_case) → pravidla bodů. Chybějící sloupce (před migrací) = dosavadní chování. */
export function pravidlaBoduZProfilu(p: any): PravidlaBodu {
  return {
    pointsPer100: celeCislo(p?.points_per_100, 0, MAX_BODU_ZA_100, 0),
    round: jeZaokrouhleni(p?.points_round) ? p.points_round : 'sta',
    minSpend: celeCislo(p?.points_min_spend, 0, MAX_MIN_UTRATA, 0),
    capPerBill: celeCislo(p?.points_cap_per_bill, 0, MAX_STROP_BODU, 0),
    excludePrepaid: p?.points_exclude_prepaid !== false,
    cashbackPct: celeCislo(p?.cashback_pct, 0, MAX_CASHBACK_PCT, 0),
  };
}

/** Vyloučené položky z JSONB sloupce: jen platné záznamy, bez duplicit, nejvýš MAX_VYLOUCENYCH_POLOZEK. */
export function vylouceneZProfilu(v: unknown): VylouceneZboziPolozka[] {
  const raw = typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v;
  if (!Array.isArray(raw)) return [];
  const videno = new Set<number>();
  const out: VylouceneZboziPolozka[] = [];
  for (const x of raw) {
    const itemId = Math.round(Number(x?.itemId));
    if (!Number.isInteger(itemId) || itemId <= 0 || videno.has(itemId)) continue;
    videno.add(itemId);
    out.push({ itemId, name: String(x?.name ?? '').slice(0, 120) });
    if (out.length >= MAX_VYLOUCENYCH_POLOZEK) break;
  }
  return out;
}

// ---- Výpočet odměny z účtu --------------------------------------------------

export type DuvodOmezeni = 'predplaceno' | 'polozky' | 'pod_minimem' | 'strop';

export interface Odmena {
  /** Celá částka účtu. */
  castka: number;
  /** Z čeho se počítá (po odečtení kreditu/poukazu a vyloučených položek). */
  zaklad: number;
  points: number;
  cashback: number;
  predplaceno: number;
  vylouceno: number;
  duvody: DuvodOmezeni[];
}

export interface VstupOdmeny {
  /** Část zaplacená kreditem nebo poukazem (celé jednotky měny). */
  predplaceno?: unknown;
  /** Cena vyloučených položek na účtu (celé jednotky měny). */
  vylouceno?: unknown;
}

const nezaporne = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Kolik bodů a cashbacku dá účet. S výchozími pravidly (zaokrouhlení „za celé
 * stovky", bez minima, stropu a vyloučení) vyjde přesně to, co dřív:
 * `floor(částka / 100) × body` a `floor(částka × % / 100)`.
 */
export function spoctiOdmenu(castkaRaw: unknown, pravidla: PravidlaBodu, vstup: VstupOdmeny = {}): Odmena {
  const castka = Math.min(MAX_CASTKA_U_KASY * 100, nezaporne(castkaRaw));
  const duvody: DuvodOmezeni[] = [];
  const predplaceno = pravidla.excludePrepaid ? Math.min(castka, nezaporne(vstup.predplaceno)) : 0;
  if (predplaceno > 0) duvody.push('predplaceno');
  const vylouceno = Math.min(castka - predplaceno, nezaporne(vstup.vylouceno));
  if (vylouceno > 0) duvody.push('polozky');
  const zaklad = castka - predplaceno - vylouceno;

  let points = 0;
  if (pravidla.pointsPer100 > 0 && zaklad > 0) {
    if (pravidla.minSpend > 0 && zaklad < pravidla.minSpend) {
      duvody.push('pod_minimem');
    } else {
      const surove = zaklad * pravidla.pointsPer100;
      points = pravidla.round === 'sta' ? Math.floor(zaklad / 100) * pravidla.pointsPer100
        : pravidla.round === 'nejblizsi' ? Math.round(surove / 100)
        : Math.floor(surove / 100);
      if (pravidla.capPerBill > 0 && points > pravidla.capPerBill) { points = pravidla.capPerBill; duvody.push('strop'); }
    }
  }
  const cashback = pravidla.cashbackPct > 0 ? Math.floor(zaklad * pravidla.cashbackPct / 100) : 0;
  return { castka, zaklad, points, cashback, predplaceno, vylouceno, duvody };
}

/** Věty o tom, proč je odměna nižší, než by čekal — pro obsluhu a pro náhled. `money` je formátovač měny podniku. */
export function vetyOOmezeni(o: Odmena, pravidla: PravidlaBodu, money: (n: number) => string): string[] {
  const out: string[] = [];
  if (o.duvody.includes('predplaceno')) out.push(`${money(o.predplaceno)} zaplaceno kreditem nebo poukazem se nepočítá`);
  if (o.duvody.includes('polozky')) out.push(`${money(o.vylouceno)} za vyloučené položky se nepočítá`);
  if (o.duvody.includes('pod_minimem')) out.push(`body se dávají od ${money(pravidla.minSpend)} (z tohohle účtu se počítá ${money(o.zaklad)})`);
  if (o.duvody.includes('strop')) out.push(`strop ${pravidla.capPerBill} b. na účtenku`);
  return out;
}

/** Cena vyloučených položek na účtu z Pokladny (cena za kus × počet); jen položky s productId ve `vyloucene`. */
export function cenaVyloucenychPolozek(
  polozky: { productId: string | null; amount: number; price: number | null }[],
  vyloucene: ReadonlySet<string>,
): number {
  let soucet = 0;
  for (const it of polozky) {
    if (!it.productId || !vyloucene.has(it.productId)) continue;
    const cena = Number(it.price), mnozstvi = Number(it.amount);
    if (Number.isFinite(cena) && cena > 0 && Number.isFinite(mnozstvi) && mnozstvi > 0) soucet += cena * mnozstvi;
  }
  return Math.round(soucet);
}

// ---- Validace pravidel (server i formulář) ----------------------------------

export interface ChybaPravidel { pole: string; text: string }

const cislo = (v: unknown): number => {
  if (typeof v === 'string' && v.trim() === '') return NaN;
  return Number(typeof v === 'string' ? v.replace(',', '.') : v);
};

/**
 * Zkontroluje pravidla věrnosti, jak je vedení zadalo. Neposlané pole (undefined) se
 * přeskočí, takže jde použít i pro částečný PUT. Vrací chyby s polem a větou pro člověka;
 * prázdný seznam = v pořádku. Prahy se hlídají jen pro režim úrovní, který se ukládá.
 */
export function validujPravidla(v: Record<string, unknown>): ChybaPravidel[] {
  const chyby: ChybaPravidel[] = [];
  const cele = (pole: string, nazev: string, lo: number, hi: number): number | null => {
    if (v[pole] === undefined) return null;
    const n = cislo(v[pole]);
    if (!Number.isFinite(n) || !Number.isInteger(n)) { chyby.push({ pole, text: `${nazev}: zadej celé číslo.` }); return null; }
    if (n < lo || n > hi) { chyby.push({ pole, text: `${nazev}: povolený rozsah je ${lo} až ${cisloCs(hi)}.` }); return null; }
    return n;
  };
  cele('points_per_100', 'Body za stovku', 0, MAX_BODU_ZA_100);
  cele('cashback_pct', 'Cashback', 0, MAX_CASHBACK_PCT);
  cele('birthday_points', 'Body k narozeninám', 0, 1000);
  cele('referral_points', 'Body za pozvání', 0, 1000);
  cele('points_min_spend', 'Minimální útrata pro body', 0, MAX_MIN_UTRATA);
  cele('points_cap_per_bill', 'Strop bodů na účtenku', 0, MAX_STROP_BODU);
  cele('tier_inactive_months', 'Snížení úrovně po neaktivitě', 0, MAX_MESICU_NEAKTIVITY);
  if (v.points_round !== undefined && !jeZaokrouhleni(v.points_round)) chyby.push({ pole: 'points_round', text: 'Zaokrouhlení bodů: vyber jednu z nabídnutých možností.' });

  const poUtrate = v.tier_by === 'spend';
  if (v.tier_by !== undefined && v.tier_by !== 'spend' && v.tier_by !== 'visits') chyby.push({ pole: 'tier_by', text: 'Úrovně podle: vyber návštěvy nebo útratu.' });
  const hi = poUtrate ? MAX_PRAH_UTRATY : MAX_PRAH_NAVSTEV;
  const jednotka = poUtrate ? 'útrata' : 'návštěvy';
  const [kS, kG, kP] = poUtrate ? ['silver_spend', 'gold_spend', 'platinum_spend'] : ['silver_at', 'gold_at', 'platinum_at'];
  const s = cele(kS, `Stříbro (${jednotka})`, 1, hi);
  const g = cele(kG, `Zlato (${jednotka})`, 2, hi);
  const pl = cele(kP, `Platina (${jednotka})`, 0, hi);
  if (s != null && g != null && g <= s) chyby.push({ pole: kG, text: `Zlato (${jednotka}) musí být nad stříbrem (${cisloCs(s)}).` });
  if (g != null && pl != null && pl > 0 && pl <= g) chyby.push({ pole: kP, text: `Platina (${jednotka}) musí být nad zlatem (${cisloCs(g)}) — nebo 0, když ji nechceš.` });

  // Sleva s vyšší úrovní neklesá (tierFor ji jinak potichu zvedne). Vypnutá platina se nekontroluje.
  const slevy = [
    ['member_discount', 'člena'], ['silver_discount', 'stříbra'], ['gold_discount', 'zlata'], ['platinum_discount', 'platiny'],
  ] as const;
  const hodnotySlev: (number | null)[] = slevy.map(([pole, kdo]) => cele(pole, `Sleva ${kdo}`, 0, MAX_SLEVA_PCT));
  // Vypnutá (nebo chybně zadaná) platina se u slev nekontroluje — chyba už je hlášená u prahu.
  const platinaVypnuta = pl == null || pl === 0 || (g != null && pl <= g);
  for (let i = 1; i < slevy.length; i++) {
    if (i === 3 && platinaVypnuta) continue;
    const a = hodnotySlev[i - 1], b = hodnotySlev[i];
    if (a != null && b != null && b < a) chyby.push({ pole: slevy[i][0], text: `Sleva ${slevy[i][1]} nemůže být nižší než sleva ${slevy[i - 1][1]} (${a} %).` });
  }
  return chyby;
}

/** Nová pole pravidel z formuláře do těla PUT (jedno místo, ať formulář a test neodbočí). */
export function novaPolePravidel(p: any): Record<string, unknown> {
  return {
    points_round: p?.points_round ?? 'sta',
    points_min_spend: p?.points_min_spend ?? 0,
    points_cap_per_bill: p?.points_cap_per_bill ?? 0,
    points_exclude_prepaid: p?.points_exclude_prepaid !== false,
    points_exclude_items: vylouceneZProfilu(p?.points_exclude_items),
    tier_inactive_months: p?.tier_inactive_months ?? 0,
  };
}

/** Pole, která `validujPravidla` zná — server s nimi ví, kdy kontrolu vůbec spustit. */
export const POLE_PRAVIDEL = [
  'points_per_100', 'cashback_pct', 'birthday_points', 'referral_points', 'points_min_spend', 'points_cap_per_bill',
  'tier_inactive_months', 'points_round', 'member_discount', 'silver_discount', 'gold_discount', 'platinum_discount',
  'tier_by', 'silver_at', 'gold_at', 'platinum_at', 'silver_spend', 'gold_spend', 'platinum_spend',
] as const;

// ---- Rozdíl pravidel pro historii změn --------------------------------------

type Popis = { pole: string; nazev: string; hodnota: (v: any, money: (n: number) => string) => string };
const pct = (v: any) => `${Number(v) || 0} %`;
const cisloTxt = (v: any) => String(Number(v) || 0);
const vypnuto = (v: any, jednotka = '') => (Number(v) > 0 ? `${Number(v)}${jednotka}` : 'vypnuto');
const POPISY_PRAVIDEL: Popis[] = [
  { pole: 'points_per_100', nazev: 'Bodů za 100', hodnota: v => cisloTxt(v) },
  { pole: 'points_round', nazev: 'Zaokrouhlení bodů', hodnota: v => ZAOKROUHLENI.find(z => z.id === v)?.label.toLowerCase() ?? 'za celé stovky' },
  { pole: 'points_min_spend', nazev: 'Minimální útrata pro body', hodnota: (v, m) => (Number(v) > 0 ? m(Number(v)) : 'bez minima') },
  { pole: 'points_cap_per_bill', nazev: 'Strop bodů na účtenku', hodnota: v => (Number(v) > 0 ? `${Number(v)} b.` : 'bez stropu') },
  { pole: 'points_exclude_prepaid', nazev: 'Kredit a poukaz bez bodů', hodnota: v => (v === false ? 'ne' : 'ano') },
  { pole: 'cashback_pct', nazev: 'Cashback', hodnota: pct },
  { pole: 'cashback_mode', nazev: 'Cashback jako', hodnota: v => (v === 'points' ? 'body' : 'kredit') },
  { pole: 'birthday_points', nazev: 'Body k narozeninám', hodnota: v => vypnuto(v) },
  { pole: 'referral_points', nazev: 'Body za pozvání', hodnota: v => vypnuto(v) },
  { pole: 'tier_by', nazev: 'Úrovně podle', hodnota: v => (v === 'spend' ? 'útraty' : 'návštěv') },
  { pole: 'silver_at', nazev: 'Stříbro od návštěv', hodnota: cisloTxt },
  { pole: 'gold_at', nazev: 'Zlato od návštěv', hodnota: cisloTxt },
  { pole: 'platinum_at', nazev: 'Platina od návštěv', hodnota: v => vypnuto(v) },
  { pole: 'silver_spend', nazev: 'Stříbro od útraty', hodnota: (v, m) => m(Number(v) || 0) },
  { pole: 'gold_spend', nazev: 'Zlato od útraty', hodnota: (v, m) => m(Number(v) || 0) },
  { pole: 'platinum_spend', nazev: 'Platina od útraty', hodnota: (v, m) => (Number(v) > 0 ? m(Number(v)) : 'vypnuto') },
  { pole: 'member_discount', nazev: 'Sleva člena', hodnota: pct },
  { pole: 'silver_discount', nazev: 'Sleva stříbra', hodnota: pct },
  { pole: 'gold_discount', nazev: 'Sleva zlata', hodnota: pct },
  { pole: 'platinum_discount', nazev: 'Sleva platiny', hodnota: pct },
  { pole: 'tier_inactive_months', nazev: 'Snížení úrovně po neaktivitě', hodnota: v => (Number(v) > 0 ? `po ${Number(v)} měs.` : 'vypnuto') },
];

/** Hodnota pole pro porovnání: chybějící sloupec = výchozí hodnota, ať se u prvního uložení nehlásí falešná změna. */
function hodnotaPole(p: any, pole: string): unknown {
  const v = p?.[pole];
  if (v !== undefined && v !== null) return v;
  if (pole === 'points_round') return 'sta';
  if (pole === 'points_exclude_prepaid') return true;
  if (pole === 'cashback_mode') return 'credit';
  if (pole === 'tier_by') return 'visits';
  return 0;
}

/**
 * Čitelný rozdíl pravidel „před → po" pro historii změn, např.
 * „Bodů za 100: 5 → 10; Cashback: 0 % → 3 %". Prázdné pole = nic se nezměnilo.
 */
export function popisZmenyPravidel(pred: any, po: any, money: (n: number) => string): string[] {
  const out: string[] = [];
  for (const d of POPISY_PRAVIDEL) {
    const a = hodnotaPole(pred, d.pole), b = hodnotaPole(po, d.pole);
    const ta = d.hodnota(a, money), tb = d.hodnota(b, money);
    if (ta !== tb) out.push(`${d.nazev}: ${ta} → ${tb}`);
  }
  const ia = vylouceneZProfilu(pred?.points_exclude_items).map(x => x.itemId).sort((x, y) => x - y).join(',');
  const ib = vylouceneZProfilu(po?.points_exclude_items).map(x => x.itemId).sort((x, y) => x - y).join(',');
  if (ia !== ib) out.push(`Vyloučené položky: ${vylouceneZProfilu(pred?.points_exclude_items).length} → ${vylouceneZProfilu(po?.points_exclude_items).length}`);
  return out;
}

/** Věta do audit_log (sloupec má strop 300 znaků): ořízne na hranici položky, ne uprostřed slova. */
export function vetaZmenPravidel(zmeny: string[], strop = 290): string {
  if (!zmeny.length) return '';
  let out = '';
  for (let i = 0; i < zmeny.length; i++) {
    const dalsi = out ? `${out}; ${zmeny[i]}` : zmeny[i];
    if (dalsi.length > strop - 12 && i > 0) return `${out}; a ${zmeny.length - i} dalších`;
    out = dalsi;
  }
  return out.length > strop ? out.slice(0, strop - 1) + '…' : out;
}

// ---- Poctivá změna zůstatku -------------------------------------------------

/**
 * Co se opravdu stalo se zůstatkem: nový stav (nikdy pod nulu, nikdy nad strop) a skutečná
 * změna. Deník se píše se skutečnou změnou, ne s tou požadovanou — jinak by odepsání
 * 500 bodů hostovi s 200 body vypadalo jako −500 a deník by se se zůstatkem rozešel.
 * Stejnou matematiku dělá SQL v award()/awardCredit() (GREATEST/LEAST).
 */
export function skutecnaZmena(pred: number, delta: number, strop = MAX_ZUSTATEK): { nove: number; zmena: number } {
  const p = Math.max(0, Math.min(strop, Math.round(Number(pred) || 0)));
  const nove = Math.max(0, Math.min(strop, p + Math.round(Number(delta) || 0)));
  return { nove, zmena: nove - p };
}

// ---- Deník: skutečné návštěvy a zdroje bodů ---------------------------------

/**
 * Je řádek deníku skutečnou návštěvou nebo útratou u podniku? Počítá „Členy u kasy":
 * razítko za návštěvu, hotová objednávka a připsání z účtenky nebo z částky u kasy.
 * Ruční úpravy, promo kódy, narozeniny, uvítání a pozvání návštěva nejsou.
 */
export function jeNavstevaZDeniku(kind: string, ref: string | null | undefined): boolean {
  if (kind === 'visit' || kind === 'order') return true;
  const r = String(ref ?? '');
  return r === 'card' || r.startsWith('bill:');
}

/** Druh odkazu v deníku (zbytek se v SQL seskupuje přes CASE; tohle je jeho zrcadlo pro test). */
export type DruhOdkazu = 'card' | 'bill' | 'promo' | 'ord' | 'none' | 'other';
export function druhOdkazu(ref: string | null | undefined): DruhOdkazu {
  if (ref == null || ref === '') return 'none';
  if (ref === 'card') return 'card';
  if (ref.startsWith('bill:')) return 'bill';
  if (ref.startsWith('promo:')) return 'promo';
  if (ref.startsWith('ord:')) return 'ord';
  return 'other';
}

export interface ZdrojBodu { id: string; label: string }

/** Do jaké skupiny patří řádek deníku v rozpadu zdrojů bodů. */
export function zdrojBodu(kind: string, odkaz: DruhOdkazu): ZdrojBodu {
  switch (kind) {
    case 'order': return { id: 'objednavky', label: 'Objednávky z aplikace' };
    case 'cashback': return { id: 'cashback', label: 'Cashback v bodech' };
    case 'welcome': return { id: 'uvitani', label: 'Uvítací body' };
    case 'birthday': return { id: 'narozeniny', label: 'Narozeniny' };
    case 'referral': return { id: 'pozvani', label: 'Pozvání kamaráda' };
    case 'coupon': return { id: 'kupony', label: 'Kupony za body' };
    case 'manual':
      if (odkaz === 'card' || odkaz === 'bill') return { id: 'utrata', label: 'Útrata u kasy a z účtenek' };
      if (odkaz === 'promo') return { id: 'promo', label: 'Promo kódy' };
      if (odkaz === 'none') return { id: 'rucne', label: 'Ruční úpravy' };
      return { id: 'import', label: 'Import a ostatní' };
    default: return { id: 'jine', label: 'Jiné' };
  }
}

/** Popisek zdroje pro jeden řádek deníku v CSV — rozlišuje body, kredit a ruční zásah do útraty. */
export function zdrojRadkuDeniku(kind: string, ref: string | null | undefined, delta: number, kreditDelta: number): string {
  if (kind === 'manual' && ref === 'spend') return 'Ruční úprava útraty';
  if (Number(kreditDelta) !== 0 && Number(delta) === 0) {
    if (kind === 'cashback') return 'Cashback v kreditu';
    if (kind === 'credit') return ref === 'card' ? 'Uplatnění kreditu u kasy' : 'Ruční úprava kreditu';
    return 'Kredit';
  }
  if (kind === 'visit' && Number(delta) === 0) return 'Razítko za návštěvu';
  return zdrojBodu(kind, druhOdkazu(ref)).label;
}

export interface RadekZdroju { kind: string; odkaz: DruhOdkazu; given: number; spent: number; n: number }
export interface SouhrnZdroje { id: string; label: string; given: number; spent: number; n: number }

/** Seskupí řádky z SQL (druh × odkaz) do zdrojů; seřazeno podle rozdaných bodů, pak podle odepsaných. */
export function souhrnZdroju(radky: RadekZdroju[]): SouhrnZdroje[] {
  const mapa = new Map<string, SouhrnZdroje>();
  for (const r of radky) {
    const z = zdrojBodu(r.kind, r.odkaz);
    const cur = mapa.get(z.id) ?? { ...z, given: 0, spent: 0, n: 0 };
    cur.given += Number(r.given) || 0; cur.spent += Number(r.spent) || 0; cur.n += Number(r.n) || 0;
    mapa.set(z.id, cur);
  }
  return [...mapa.values()].filter(z => z.given > 0 || z.spent > 0).sort((a, b) => (b.given - a.given) || (b.spent - a.spent));
}

// ---- Období přehledů a exportu -----------------------------------------------

/** Nejdelší období přehledu a exportu v dnech. */
export const MAX_DNU_OBDOBI = 366;
/** Nejvíc řádků deníku v jednom exportu. */
export const MAX_RADKU_EXPORTU = 50_000;

export type Razeni = 'utrata' | 'body' | 'navstevy';
export const jeRazeni = (v: unknown): v is Razeni => v === 'utrata' || v === 'body' || v === 'navstevy';

/**
 * Období z dotazu (`od`, `do` jako RRRR-MM-DD, pražský den). Chybí-li, posledních 30 dní.
 * Chyba je věta pro člověka. `dnes` jde podstrčit pro test.
 */
export function obdobiZDotazu(od: unknown, doo: unknown, dnes: string = pragueToday()): { od: string; do: string } | { chyba: string } {
  const a = od ? String(od) : dayPlus(dnes, -29);
  const b = doo ? String(doo) : dnes;
  if (!platneDatum(a) || !platneDatum(b)) return { chyba: 'Datum zadej jako RRRR-MM-DD.' };
  if (a > b) return { chyba: 'Začátek období je až po jeho konci.' };
  if (dayPlus(a, MAX_DNU_OBDOBI - 1) < b) return { chyba: `Období může mít nejvýš ${MAX_DNU_OBDOBI} dní.` };
  return { od: a, do: b };
}

// ---- Závazek ----------------------------------------------------------------

/**
 * Odhad hodnoty jednoho bodu v měně podniku: medián z kuponů za body s pevnou slevou
 * (sleva ÷ cena v bodech). Bez takového kuponu (jen procentní, X+Y, text) se hodnota
 * odhadnout nedá a vrací null — přehled to řekne místo vymyšleného čísla.
 */
export function hodnotaBodu(kupony: { cost_points: unknown; amount_off: unknown }[]): number | null {
  const pomery: number[] = [];
  for (const k of kupony) {
    const body = Number(k.cost_points), sleva = Number(k.amount_off);
    if (body > 0 && sleva > 0) pomery.push(sleva / body);
  }
  if (!pomery.length) return null;
  pomery.sort((a, b) => a - b);
  const s = Math.floor(pomery.length / 2);
  return pomery.length % 2 ? pomery[s] : (pomery[s - 1] + pomery[s]) / 2;
}

// ---- CSV deníku -------------------------------------------------------------

/** Pole CSV: uvozovky, kde je potřeba, a ochrana proti vzorcům v Excelu (=, +, -, @). */
export function csvPoleDeniku(v: unknown): string {
  // Číslo je číslo (záporný kredit nesmí dostat apostrof a změnit se v text); ochrana patří textu.
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface RadekDeniku {
  kdy: string; host: string; druh: string; body: number; kredit: number; zdroj: string; poznamka: string;
}

/** CSV deníku se středníkem a BOM, ať Excel pozná češtinu; kredit v celých jednotkách měny. */
export function denikCsv(radky: RadekDeniku[]): string {
  const hlavicka = ['Kdy', 'Host', 'Druh', 'Body', 'Kredit', 'Zdroj', 'Poznámka'];
  const r = radky.map(x => [x.kdy, x.host, x.druh, x.body, x.kredit, x.zdroj, x.poznamka].map(csvPoleDeniku).join(';'));
  return '﻿' + [hlavicka.join(';'), ...r].join('\r\n') + '\r\n';
}

export const DRUH_DENIKU: Record<string, string> = {
  visit: 'Návštěva', order: 'Objednávka', manual: 'Body', coupon: 'Kupon', welcome: 'Uvítání', birthday: 'Narozeniny',
  referral: 'Pozvání', cashback: 'Cashback', credit: 'Kredit',
};

// ---- Pravidla úrovní z profilu (neaktivita) ----------------------------------

/** Počet měsíců neaktivity, po kterých se úroveň snižuje (0 = nikdy). */
export function mesiceNeaktivity(p: any): number {
  return celeCislo(p?.tier_inactive_months, 0, MAX_MESICU_NEAKTIVITY, 0);
}

export type { TierRules };
