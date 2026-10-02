// Sdílené mezi serverem a prohlížečem: kdy se dá rezervovat a jak se čte
// otevírací doba. Bez importů ze serveru, ať to jde i do klientské komponenty.

import { pragueDayOf, pragueToday, parseDbTime } from './pragueTime.ts';

export interface OpeningDay { open?: string | null; close?: string | null; closed?: boolean }
export type OpeningHours = Record<string, OpeningDay>;

/** Klíč dne v teams.opening_hours: pondělí = "0". */
export function dayKey(dateStr: string): string {
  return String((new Date(dateStr + 'T12:00:00Z').getUTCDay() + 6) % 7);
}

export const DAY_NAMES = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];

/**
 * „8:00–20:00", „zavřeno" nebo „neuvedeno". `t` je překladová funkce (česká věta
 * → text v jazyce hosta); bez ní česky, jako dřív.
 */
export function hoursLabel(hours: OpeningHours | null | undefined, dateStr: string, t: (cs: string) => string = cs => cs): string {
  const d = hours?.[dayKey(dateStr)];
  if (!d) return t('neuvedeno');
  if (d.closed || !d.open || !d.close) return t('zavřeno');
  return `${d.open}–${d.close}`;
}

/** Časy, kdy se dá v daný den rezervovat: od otevření po zavření minus hodina, po krocích. */
export function slotsFor(hours: OpeningHours | null | undefined, dateStr: string, slotMinutes: number): string[] {
  const day = hours?.[dayKey(dateStr)];
  if (!day || day.closed || !day.open || !day.close) return [];
  const toMin = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const start = toMin(day.open), end = toMin(day.close) - 60;
  const out: string[] = [];
  const step = Math.max(15, slotMinutes || 30);
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}

/** „pá 12. 9." pro seznamy, „pátek 12. září" pro nadpisy. */
export function czDay(dateStr: string, long = false): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('cs-CZ', long
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { weekday: 'short', day: 'numeric', month: 'numeric' });
}

export const RES_STATUS: Record<string, { label: string; tone: 'wait' | 'ok' | 'off' | 'done' }> = {
  requested: { label: 'Čeká na potvrzení', tone: 'wait' },
  confirmed: { label: 'Potvrzeno', tone: 'ok' },
  seated:    { label: 'Usazeni', tone: 'ok' },
  done:      { label: 'Proběhlo', tone: 'done' },
  declined:  { label: 'Nepřijato', tone: 'off' },
  cancelled: { label: 'Zrušeno', tone: 'off' },
};


// ---- Úrovně hosta podle návštěv -------------------------------------------
//
// Jako v Kartičce: věrnost je vidět a něco přináší. Prahy i sleva si drží
// každý podnik vlastní; výchozí hodnoty odpovídají malému podniku, kde je
// pětadvacet návštěv opravdový štamgast.

export type TierBy = 'visits' | 'spend';

export interface TierRules {
  silverAt?: number; goldAt?: number; platinumAt?: number;
  memberDiscount?: number; silverDiscount?: number; goldDiscount?: number; platinumDiscount?: number;
  /** Podle čeho se úroveň počítá: 'visits' (výchozí, jako dřív) nebo 'spend' (kumulovaná útrata). */
  tierBy?: TierBy | string | null;
  /** Prahy v útratě (celé jednotky měny podniku); platí jen v režimu 'spend'. */
  silverSpend?: number; goldSpend?: number; platinumSpend?: number;
  /** Po kolika dnech bez návštěvy úroveň klesne o stupeň (0 = platí natrvalo). */
  inactiveDays?: number;
}

export type TierId = 'bronze' | 'silver' | 'gold' | 'platinum';

/** `unit` říká, v čem je `nextAt`: návštěvy, nebo měna podniku. */
export interface Tier {
  id: TierId; label: string; discount: number; nextAt: number | null; nextLabel: string | null; unit: TierBy;
  /** Úroveň byla snížena kvůli neaktivitě: z čeho, po kolika dnech bez návštěvy. */
  degraded?: { from: TierId; dni: number };
}

/** Režim úrovní podniku; cokoli jiného než 'spend' je 'visits'. */
export function tierBy(r?: TierRules | null): TierBy {
  return r?.tierBy === 'spend' ? 'spend' : 'visits';
}

/** Výchozí prahy útraty, když je podnik nemá nastavené (0 u stříbra a zlata = výchozí; u platiny = vypnuto). */
export const VYCHOZI_PRAHY_UTRATY = { silver: 5000, gold: 15000 };

/**
 * Prahy podle režimu, už srovnané: stříbro aspoň 1, zlato nad stříbrem, platina
 * nad zlatem (0 = platina vypnutá). Jedno místo pro tierFor i pro SQL publika zpráv.
 */
export function tierThresholds(r?: TierRules | null): { by: TierBy; silver: number; gold: number; platinum: number } {
  const by = tierBy(r);
  const spend = by === 'spend';
  const silver = Math.max(1, Number(spend ? r?.silverSpend : r?.silverAt) || (spend ? VYCHOZI_PRAHY_UTRATY.silver : 10));
  const gold = Math.max(silver + 1, Number(spend ? r?.goldSpend : r?.goldAt) || (spend ? VYCHOZI_PRAHY_UTRATY.gold : 25));
  const rawPlat = Number(spend ? r?.platinumSpend : r?.platinumAt);
  const platinum = rawPlat > 0 ? Math.max(gold + 1, rawPlat) : 0;
  return { by, silver, gold, platinum };
}

/**
 * Úroveň hosta i s tím, co z ní plyne — sleva a kolik chybí do další.
 * `hodnota` je počet návštěv, nebo kumulovaná útrata — podle r.tierBy (bez r a
 * s 'visits' je to dnešní chování). Platina běží jen tam, kde ji podnik zapnul.
 */
export function tierFor(hodnota: number, r?: TierRules | null): Tier {
  const v = Math.max(0, Number(hodnota) || 0);
  const { by, silver: silverAt, gold: goldAt, platinum: platinumAt } = tierThresholds(r);
  const base = Math.max(0, Math.min(90, Number(r?.memberDiscount) || 0));
  const sd = Math.max(base, Math.min(90, Number(r?.silverDiscount) || 0));
  const gd = Math.max(sd, Math.min(90, Number(r?.goldDiscount) || 0));
  const pd = Math.max(gd, Math.min(90, Number(r?.platinumDiscount) || 0));
  if (platinumAt > 0 && v >= platinumAt) return { id: 'platinum', label: 'Platinový host', discount: pd, nextAt: null, nextLabel: null, unit: by };
  if (v >= goldAt) return { id: 'gold', label: 'Zlatý host', discount: gd, nextAt: platinumAt > 0 ? platinumAt : null, nextLabel: platinumAt > 0 ? 'Platinový host' : null, unit: by };
  if (v >= silverAt) return { id: 'silver', label: 'Stříbrný host', discount: sd, nextAt: goldAt, nextLabel: 'Zlatý host', unit: by };
  return { id: 'bronze', label: 'Člen', discount: base, nextAt: silverAt, nextLabel: 'Stříbrný host', unit: by };
}

/** Úroveň podle id (po snížení kvůli neaktivitě): stejná čísla jako tierFor, jen bez hledání podle hodnoty. */
function tierProId(id: TierId, r?: TierRules | null): Tier {
  const { by, silver, gold, platinum } = tierThresholds(r);
  const base = Math.max(0, Math.min(90, Number(r?.memberDiscount) || 0));
  const sd = Math.max(base, Math.min(90, Number(r?.silverDiscount) || 0));
  const gd = Math.max(sd, Math.min(90, Number(r?.goldDiscount) || 0));
  const pd = Math.max(gd, Math.min(90, Number(r?.platinumDiscount) || 0));
  if (id === 'platinum' && platinum > 0) return { id, label: 'Platinový host', discount: pd, nextAt: null, nextLabel: null, unit: by };
  if (id === 'gold' || id === 'platinum') return { id: 'gold', label: 'Zlatý host', discount: gd, nextAt: platinum > 0 ? platinum : null, nextLabel: platinum > 0 ? 'Platinový host' : null, unit: by };
  if (id === 'silver') return { id, label: 'Stříbrný host', discount: sd, nextAt: gold, nextLabel: 'Zlatý host', unit: by };
  return { id: 'bronze', label: 'Člen', discount: base, nextAt: silver, nextLabel: 'Stříbrný host', unit: by };
}

const PORADI: TierId[] = ['bronze', 'silver', 'gold', 'platinum'];

/**
 * Úroveň člena s režimem podniku: z návštěv, nebo z útraty. Tohle volej všude, kde máš člena.
 * Má-li podnik zapnuté snížení po neaktivitě (r.inactiveDays) a znáš poslední návštěvu
 * (`lastVisitAt` nebo `last_visit_at` z řádku členství), úroveň klesne o stupeň
 * za každých `inactiveDays` dní bez návštěvy. Nasbíraná útrata ani návštěvy se nemění.
 */
export function tierForMember(m: { visits?: number | string | null; spend?: number | string | null; lastVisitAt?: unknown; last_visit_at?: unknown }, r?: TierRules | null): Tier {
  const t = tierFor(tierBy(r) === 'spend' ? Number(m?.spend) || 0 : Number(m?.visits) || 0, r);
  const platnost = Math.trunc(Number(r?.inactiveDays) || 0);
  const posledni = m?.lastVisitAt ?? m?.last_visit_at;
  if (platnost <= 0 || !posledni || t.id === 'bronze') return t;
  const d = parseDbTime(posledni as any);
  if (!d) return t;
  const dni = Math.max(0, Math.round((Date.parse(`${pragueToday()}T12:00:00Z`) - Date.parse(`${pragueDayOf(d)}T12:00:00Z`)) / 86400000));
  const stupnu = dni < platnost ? 0 : Math.floor(dni / platnost);
  if (stupnu <= 0) return t;
  const na = PORADI[Math.max(0, PORADI.indexOf(t.id) - stupnu)];
  if (na === t.id) return t;
  return { ...tierProId(na, r), degraded: { from: t.id, dni } };
}

/** Řádek client_profiles (snake_case z databáze) → pravidla úrovní. */
export function tierRulesFromProfile(p: any): TierRules {
  return {
    silverAt: Number(p?.silver_at), goldAt: Number(p?.gold_at), platinumAt: Number(p?.platinum_at) || 0,
    memberDiscount: Number(p?.member_discount), silverDiscount: Number(p?.silver_discount), goldDiscount: Number(p?.gold_discount),
    platinumDiscount: Number(p?.platinum_discount) || 0,
    tierBy: p?.tier_by === 'spend' ? 'spend' : 'visits',
    silverSpend: Number(p?.silver_spend) || 0, goldSpend: Number(p?.gold_spend) || 0, platinumSpend: Number(p?.platinum_spend) || 0,
    inactiveDays: Math.max(0, Math.trunc(Number(p?.tier_inactive_days)) || 0),
  };
}

/** Zpětně kompatibilní zkratka pro místa, kde stačí jméno úrovně. */
export function levelFor(visits: number): { id: TierId; label: string } {
  const t = tierFor(visits);
  return { id: t.id, label: t.label };
}

/** Horní mez jedné útraty — překlep o tři nuly nesmí přetéct INTEGER ani rozhodit úrovně. */
export const MAX_UTRATA = 10_000_000;

/** Částka na celé nezáporné jednotky v rozumném rozsahu. */
export function celaUtrata(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_UTRATA, n)) : 0;
}
