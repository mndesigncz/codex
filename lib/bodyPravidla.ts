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
import { pragueToday, dayPlus, pragueDayOf, parseDbTime } from './pragueTime.ts';
import { platneDatum } from './rozvrhCsv.ts';
import { popisNasobice } from './bonusAkce.ts';

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
export const MAX_VYLOUCENYCH_KATEGORII = 50;
/** Nejvyšší násobič bodů podle úrovně. */
export const MAX_NASOBIC_UROVNE = 5;
/** Uvítací body, které nový člen dostával vždycky (než šly nastavit). */
export const UVITACI_VYCHOZI = 10;
export const MAX_UVITACI_BODY = 1000;
/** Propadnutí kreditu: nejméně / nejvíce dní (0 = kredit nepropadá). */
export const MIN_DNI_KREDITU = 7;
export const MAX_DNI_KREDITU = 3650;
/** Zůstatek bodů i kreditu se vejde do INTEGER s rezervou. */
export const MAX_ZUSTATEK = 2_000_000_000;
/** Horní mez jedné útraty zadané u kasy (shodná s kasou: 100 000). */
export const MAX_CASTKA_U_KASY = 100_000;

// ---- Zaokrouhlení -----------------------------------------------------------

export type ZaokrouhleniBodu = 'sta' | 'prenos' | 'dolu' | 'nejblizsi' | 'nahoru';

export const ZAOKROUHLENI: { id: ZaokrouhleniBodu; label: string; hint: string }[] = [
  { id: 'sta', label: 'Za celé stovky', hint: 'Dosavadní chování: body dostane jen za plné stovky, zbytek propadne. Útrata 250 dá body za 200.' },
  { id: 'prenos', label: 'Za celé stovky, zbytek se přenáší', hint: 'Jako celé stovky, ale zbytek pod 100 se přičte k příští útratě hosta. Nic se neztratí.' },
  { id: 'dolu', label: 'Poměrně, dolů', hint: 'Body podle přesné částky, zlomek se zahodí. Při 5 bodech za stovku dá útrata 250 celých 12 bodů.' },
  { id: 'nejblizsi', label: 'Poměrně, na nejbližší', hint: 'Body podle přesné částky, zlomek se zaokrouhlí. Při 5 bodech za stovku dá útrata 250 celých 13 bodů.' },
  { id: 'nahoru', label: 'Poměrně, nahoru', hint: 'Body podle přesné částky, zlomek se zaokrouhlí nahoru. Hostům nejštědřejší.' },
];

export function jeZaokrouhleni(v: unknown): v is ZaokrouhleniBodu {
  return ZAOKROUHLENI.some(z => z.id === v);
}

// ---- Pravidla z profilu -----------------------------------------------------

export interface VylouceneZboziPolozka { itemId: number; name: string }
/** Celá kategorie nabídky (sekce), za kterou se body nedávají. */
export interface VylouceneSekce { sectionId: number; name: string }

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
  /** Nejvíc bodů z útrat za jeden pražský den na hosta. 0 = bez stropu. */
  capPerDay: number;
  /** Násobič bodů podle úrovně (Člen = 1). Vyšší úroveň nemá míň než ta pod ní. */
  multSilver: number;
  multGold: number;
  multPlatinum: number;
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
    capPerDay: celeCislo(p?.points_cap_per_day, 0, MAX_STROP_BODU, 0),
    multSilver: nasobicZProfilu(p?.mult_silver), multGold: nasobicZProfilu(p?.mult_gold), multPlatinum: nasobicZProfilu(p?.mult_platinum),
  };
}

export function nasobicZProfilu(v: unknown): number {
  if (typeof v === 'string') v = v.trim().replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= MAX_NASOBIC_UROVNE ? Math.round(n * 100) / 100 : 1;
}

/** Násobič bodů podle úrovně (Člen = 1). Vyšší úroveň nikdy nemá míň než ta pod ní, i když ji vedení nevyplnilo. */
export function nasobicUrovne(r: Pick<PravidlaBodu, 'multSilver' | 'multGold' | 'multPlatinum'>, uroven: string): number {
  const s = Math.max(1, r.multSilver);
  const g = Math.max(s, r.multGold);
  if (uroven === 'silver') return s;
  if (uroven === 'gold') return g;
  if (uroven === 'platinum') return Math.max(g, r.multPlatinum);
  return 1;
}

/** Kolik uvítacích bodů nový člen dostane: nastavená hodnota, jinak dřívější chování (10, když podnik dává body za útratu). */
export function uvitaciBody(p: any): number {
  const v = p?.welcome_points;
  if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) return Math.max(0, Math.min(MAX_UVITACI_BODY, Math.trunc(Number(v))));
  return Number(p?.points_per_100) > 0 ? UVITACI_VYCHOZI : 0;
}

/** Vyloučené kategorie nabídky z JSONB sloupce: jen platné záznamy, bez duplicit. */
export function vylouceneSekceZProfilu(v: unknown): VylouceneSekce[] {
  const raw = typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v;
  if (!Array.isArray(raw)) return [];
  const videno = new Set<number>();
  const out: VylouceneSekce[] = [];
  for (const x of raw) {
    const sectionId = Math.round(Number(x?.sectionId));
    if (!Number.isInteger(sectionId) || sectionId <= 0 || videno.has(sectionId)) continue;
    videno.add(sectionId);
    out.push({ sectionId, name: String(x?.name ?? '').slice(0, 120) });
    if (out.length >= MAX_VYLOUCENYCH_KATEGORII) break;
  }
  return out;
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

export type DuvodOmezeni = 'predplaceno' | 'polozky' | 'pod_minimem' | 'strop' | 'strop_den';

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
  /** Násobič, který se opravdu použil (vyšší z úrovně a bonusové akce; nikdy součin). 1 = žádný. */
  nasobic: number;
  /** Násobič slovy pro obsluhu a deník („dvojnásobné body, Happy hour“), prázdné bez násobiče. */
  nasobicPopis: string;
  /** Nový přenesený zbytek pod 100 (jen zaokrouhlení „zbytek se přenáší“; jinak 0). */
  zbytekNovy: number;
}

export interface VstupOdmeny {
  /** Část zaplacená kreditem nebo poukazem (celé jednotky měny). */
  predplaceno?: unknown;
  /** Cena vyloučených položek na účtu (celé jednotky měny). */
  vylouceno?: unknown;
  /** Úroveň hosta v okamžiku připsání (pro násobič podle úrovně). */
  uroven?: string;
  /** Násobič z bonusové akce (Happy hour); 1 = žádná. */
  bonusNasobic?: unknown;
  bonusNazev?: string;
  /** Kolik bodů z útrat host dnes (pražský den) už dostal — pro strop za den. */
  dnesUzBodu?: unknown;
  /** Přenesený zbytek pod 100 z minulé útraty (jen zaokrouhlení „zbytek se přenáší“). */
  zbytek?: unknown;
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
  const zbytekStary = nezaporne(vstup.zbytek);

  let points = 0; let nasobic = 1; let nasobicPopis = ''; let zbytekNovy = 0;
  if (pravidla.pointsPer100 > 0 && zaklad > 0) {
    if (pravidla.minSpend > 0 && zaklad < pravidla.minSpend) {
      duvody.push('pod_minimem');
      zbytekNovy = zbytekStary;
    } else {
      const surove = zaklad * pravidla.pointsPer100;
      if (pravidla.round === 'prenos') {
        const soucet = zaklad + zbytekStary;
        const stovky = Math.floor(soucet / 100);
        points = stovky * pravidla.pointsPer100; zbytekNovy = soucet - stovky * 100;
      } else {
        points = pravidla.round === 'sta' ? Math.floor(zaklad / 100) * pravidla.pointsPer100
          : pravidla.round === 'nejblizsi' ? Math.round(surove / 100)
          : pravidla.round === 'nahoru' ? Math.ceil(Math.round(surove) / 100)
          : Math.floor(surove / 100);
      }
      // Násobič: vyšší z úrovně a bonusové akce, nikdy součin (host by dostal nečekaně hodně). Před stropy, ať je strop strop.
      const mU = nasobicUrovne(pravidla, String(vstup.uroven ?? 'bronze'));
      const mA = Math.max(1, Number(vstup.bonusNasobic) || 1);
      nasobic = Math.max(mU, mA);
      if (nasobic > 1 && points > 0) {
        points = Math.max(points, Math.round(points * nasobic));
        nasobicPopis = mA >= mU ? `${popisNasobice(nasobic)}${vstup.bonusNazev ? `, ${vstup.bonusNazev}` : ''}` : `${popisNasobice(nasobic)} za úroveň`;
      } else nasobic = 1;
      if (pravidla.capPerBill > 0 && points > pravidla.capPerBill) { points = pravidla.capPerBill; duvody.push('strop'); }
      if (pravidla.capPerDay > 0) {
        const zbyva = Math.max(0, pravidla.capPerDay - nezaporne(vstup.dnesUzBodu));
        if (points > zbyva) { points = zbyva; duvody.push('strop_den'); }
      }
    }
  } else if (pravidla.round === 'prenos') zbytekNovy = zbytekStary;
  const cashback = pravidla.cashbackPct > 0 ? Math.floor(zaklad * pravidla.cashbackPct / 100) : 0;
  return { castka, zaklad, points, cashback, predplaceno, vylouceno, duvody, nasobic, nasobicPopis, zbytekNovy };
}

/** Věty o tom, proč je odměna nižší, než by čekal — pro obsluhu a pro náhled. `money` je formátovač měny podniku. */
export function vetyOOmezeni(o: Odmena, pravidla: PravidlaBodu, money: (n: number) => string): string[] {
  const out: string[] = [];
  if (o.duvody.includes('predplaceno')) out.push(`${money(o.predplaceno)} zaplaceno kreditem nebo poukazem se nepočítá`);
  if (o.duvody.includes('polozky')) out.push(`${money(o.vylouceno)} za vyloučené položky se nepočítá`);
  if (o.duvody.includes('pod_minimem')) out.push(`body se dávají od ${money(pravidla.minSpend)} (z tohohle účtu se počítá ${money(o.zaklad)})`);
  if (o.duvody.includes('strop')) out.push(`strop ${pravidla.capPerBill} b. na účtenku`);
  if (o.duvody.includes('strop_den')) out.push(`strop ${pravidla.capPerDay} b. za den`);
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
  const capD = cele('points_cap_per_day', 'Strop bodů za den', 0, MAX_STROP_BODU);
  const capB = v.points_cap_per_bill !== undefined ? cislo(v.points_cap_per_bill) : NaN;
  if (capD != null && capD > 0 && Number.isFinite(capB) && capB > 0 && capD < capB) {
    chyby.push({ pole: 'points_cap_per_day', text: 'Strop za den nesmí být menší než strop na účtenku, jinak by ho jedna účtenka nikdy nevyužila.' });
  }
  cele('welcome_points', 'Uvítací body', 0, MAX_UVITACI_BODY);
  const kre = cele('credit_expire_days', 'Propadnutí kreditu (dny)', 0, MAX_DNI_KREDITU);
  if (kre != null && kre > 0 && kre < MIN_DNI_KREDITU) chyby.push({ pole: 'credit_expire_days', text: `Propadnutí kreditu: nejméně ${MIN_DNI_KREDITU} dní (0 = kredit nepropadá).` });
  for (const [pole, nazev] of [['mult_silver', 'Násobič stříbrného hosta'], ['mult_gold', 'Násobič zlatého hosta'], ['mult_platinum', 'Násobič platinového hosta']] as const) {
    if (v[pole] === undefined) continue;
    const n = cislo(v[pole]);
    if (!Number.isFinite(n)) chyby.push({ pole, text: `${nazev}: zadej číslo, třeba 1,5.` });
    else if (n < 1 || n > MAX_NASOBIC_UROVNE) chyby.push({ pole, text: `${nazev}: násobič musí být mezi 1 a ${MAX_NASOBIC_UROVNE}.` });
  }
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
    points_cap_per_day: p?.points_cap_per_day ?? 0,
    points_exclude_sections: vylouceneSekceZProfilu(p?.points_exclude_sections),
    mult_silver: String(nasobicZProfilu(p?.mult_silver)).replace('.', ','),
    mult_gold: String(nasobicZProfilu(p?.mult_gold)).replace('.', ','),
    mult_platinum: String(nasobicZProfilu(p?.mult_platinum)).replace('.', ','),
    welcome_points: uvitaciBody(p),
    credit_expire_days: p?.credit_expire_days ?? 0,
  };
}

/** Pole, která `validujPravidla` zná — server s nimi ví, kdy kontrolu vůbec spustit. */
export const POLE_PRAVIDEL = [
  'points_per_100', 'cashback_pct', 'birthday_points', 'referral_points', 'points_min_spend', 'points_cap_per_bill',
  'tier_inactive_months', 'points_round', 'points_cap_per_day', 'welcome_points', 'credit_expire_days', 'mult_silver', 'mult_gold', 'mult_platinum', 'member_discount', 'silver_discount', 'gold_discount', 'platinum_discount',
  'tier_by', 'silver_at', 'gold_at', 'platinum_at', 'silver_spend', 'gold_spend', 'platinum_spend',
] as const;

/** Pole, která se dají uložit do konceptu: všechna pravidla z obrazovky Body a úrovně. */
export const KLICE_KONCEPTU: readonly string[] = [
  'points_per_100', 'cashback_pct', 'cashback_mode', 'birthday_points', 'referral_points', 'points_expire_days',
  'silver_at', 'gold_at', 'platinum_at', 'tier_by', 'silver_spend', 'gold_spend', 'platinum_spend',
  'member_discount', 'silver_discount', 'gold_discount', 'platinum_discount', 'reactivation_days', 'reactivation_points',
  ...Object.keys(novaPolePravidel({})),
];

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
  { pole: 'points_cap_per_day', nazev: 'Strop bodů za den', hodnota: v => (Number(v) > 0 ? `${Number(v)} b.` : 'bez stropu') },
  { pole: 'mult_silver', nazev: 'Násobič stříbro', hodnota: v => `${String(nasobicZProfilu(v)).replace('.', ',')}×` },
  { pole: 'mult_gold', nazev: 'Násobič zlato', hodnota: v => `${String(nasobicZProfilu(v)).replace('.', ',')}×` },
  { pole: 'mult_platinum', nazev: 'Násobič platina', hodnota: v => `${String(nasobicZProfilu(v)).replace('.', ',')}×` },
  { pole: 'welcome_points', nazev: 'Uvítací body', hodnota: v => (Number(v) > 0 ? cisloTxt(v) : 'vypnuto') },
  { pole: 'credit_expire_days', nazev: 'Propadnutí kreditu', hodnota: v => (Number(v) > 0 ? `po ${Number(v)} dnech` : 'vypnuto') },
  { pole: 'points_expire_days', nazev: 'Propadnutí bodů', hodnota: v => (Number(v) > 0 ? `po ${Number(v)} dnech` : 'nikdy') },
  { pole: 'reactivation_days', nazev: 'Chybíš nám po', hodnota: v => (Number(v) > 0 ? `${Number(v)} dnech` : 'vypnuto') },
  { pole: 'reactivation_points', nazev: 'Chybíš nám, body navíc', hodnota: v => vypnuto(v) },
];

/** Hodnota pole pro porovnání: chybějící sloupec = výchozí hodnota, ať se u prvního uložení nehlásí falešná změna. */
function hodnotaPole(p: any, pole: string): unknown {
  const v = p?.[pole];
  if (v !== undefined && v !== null) return v;
  if (pole === 'points_round') return 'sta';
  if (pole === 'points_exclude_prepaid') return true;
  if (pole === 'cashback_mode') return 'credit';
  if (pole === 'tier_by') return 'visits';
  if (pole.startsWith('mult_')) return 1;
  if (pole === 'welcome_points') return uvitaciBody(p);
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
  const sa = vylouceneSekceZProfilu(pred?.points_exclude_sections).map(x => x.sectionId).sort((x, y) => x - y).join(',');
  const sb = vylouceneSekceZProfilu(po?.points_exclude_sections).map(x => x.sectionId).sort((x, y) => x - y).join(',');
  if (sa !== sb) out.push(`Vyloučené kategorie: ${vylouceneSekceZProfilu(pred?.points_exclude_sections).length} → ${vylouceneSekceZProfilu(po?.points_exclude_sections).length}`);
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
  referral: 'Pozvání', cashback: 'Cashback', credit: 'Kredit', storno: 'Storno účtenky', expire: 'Propadnutí',
};

// ---- Pravidla úrovní z profilu (neaktivita) ----------------------------------

/** Počet měsíců neaktivity, po kterých se úroveň snižuje (0 = nikdy). */
export function mesiceNeaktivity(p: any): number {
  return celeCislo(p?.tier_inactive_months, 0, MAX_MESICU_NEAKTIVITY, 0);
}

// ---- Úroveň: oznámení o snížení ----------------------------------------------

export const PORADI_UROVNI = ['bronze', 'silver', 'gold', 'platinum'] as const;
export const NAZEV_UROVNE: Record<string, string> = { bronze: 'Člen', silver: 'Stříbrný host', gold: 'Zlatý host', platinum: 'Platinový host' };

/** Text oznámení, když úroveň klesla po neaktivitě (postup oznamuje lib/urovnePostup.ts). */
export function oznameniPoklesu(na: string, podnik: string): { title: string; body: string } {
  return {
    title: `Úroveň u ${podnik} klesla na ${NAZEV_UROVNE[na] ?? na}`,
    body: 'Dlouho jsme tě neviděli. Stačí přijít a úroveň se začne vracet.',
  };
}

// ---- Propadání kreditu ------------------------------------------------------------

/** Řádek deníku pro propadání kreditu: změna kreditu a pražský den. */
export interface RadekKreditu { delta: number; day: string }

/** Deník člena → vstup plánu propadání kreditu (kreditové řádky; upozornění `cwarn:` a odpis `cexp:` zvlášť). */
export function rozlisDenikKreditu(radky: { credit_delta?: unknown; kind?: unknown; ref?: unknown; created_at?: unknown }[], dnes: string): { vstup: RadekKreditu[]; poslednVarovani: string | null; dnesUz: boolean } {
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
    const delta = Math.trunc(Number(r.credit_delta) || 0);
    if (!delta) continue;
    const d = parseDbTime(r.created_at as any);
    vstup.push({ delta, day: d ? pragueDayOf(d) : '' });
  }
  return { vstup, poslednVarovani: posledni, dnesUz };
}

// ---- Část účtu zaplacená kreditem nebo poukazem ------------------------------------

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

export type { TierRules };
