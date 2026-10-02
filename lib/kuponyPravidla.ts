// Pravidla kuponů bez databáze (načte je i `npm test` přímo Nodem):
// okno platnosti vč. noční směny, varování při uplatnění, stav kuponu
// (koncept / naplánováno / aktivní / archiv) a rezervace kusů.
// Rozhodnutí, kdo si kupon smí vzít, zůstává v lib/coupons.ts.

import { pragueToday, pragueHM, dayPlus } from './pragueTime.ts';
import { intList, type FormatCastky } from './kuponyPopisky.ts';

/** Den v týdnu 1–7 (po = 1) pro pražské datum YYYY-MM-DD. */
export function pragueDow(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/** Věk z data narození (YYYY-MM-DD) k dnešku; null když datum chybí. */
export function ageFrom(birthday: string | null | undefined, today: string): number | null {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(String(birthday))) return null;
  const b = String(birthday);
  let age = Number(today.slice(0, 4)) - Number(b.slice(0, 4));
  if (today.slice(5) < b.slice(5)) age -= 1;
  return age;
}

/** Je „hm" v okně od–do? Okno přes půlnoc (22:00–02:00) se počítá taky; chybějící hranice = celý den. */
export function hodinyOk(from: unknown, till: unknown, hm: string): boolean {
  if (!from || !till) return true;
  const f = String(from), t = String(till);
  if (f === t) return true;
  if (f < t) return hm >= f && hm <= t;
  return hm >= f || hm <= t;
}

/** Je okno přes půlnoc? */
export const jeNocniOkno = (from: unknown, till: unknown): boolean => !!from && !!till && String(from) > String(till);

/**
 * Platí kupon právě teď (datum, den v týdnu, hodiny)? Vrací důvod, když ne.
 * U nočního okna patří část po půlnoci k předchozímu dni: kupon „pá 22:00–02:00“
 * platí i v sobotu v 01:00, ale ne v sobotu ve 23:00.
 */
export function windowOk(c: any, now: { today: string; hm: string } = { today: pragueToday(), hm: pragueHM() }): string | null {
  if (c.valid_since && String(c.valid_since) > now.today) return `Platí až od ${String(c.valid_since)}.`;
  if (c.valid_until && String(c.valid_until) < now.today) return 'Kupon už neplatí.';
  if (c.hour_from && c.hour_till && !hodinyOk(c.hour_from, c.hour_till, now.hm)) {
    return `Kupon platí jen ${c.hour_from}–${c.hour_till}.`;
  }
  const days = intList(c.days_of_week);
  if (days.length) {
    const ponoci = jeNocniOkno(c.hour_from, c.hour_till) && now.hm <= String(c.hour_till);
    const den = pragueDow(ponoci ? dayPlus(now.today, -1) : now.today);
    if (!days.includes(den)) return ponoci ? 'Tuhle noc kupon neplatí.' : 'Dnes kupon neplatí.';
  }
  return null;
}

/**
 * Varování pro obsluhu před uplatněním: útrata pod minimem (nebo neznámá) a 18+.
 * Nejsou to zákazy — obsluha je potvrdí (zapíše se to k uplatnění).
 */
export function varovaniUplatneni(c: any, castka: FormatCastky, orderValue: number | null = null): string[] {
  const out: string[] = [];
  const min = Number(c.min_order_value) || 0;
  if (min > 0) {
    if (orderValue == null) out.push(`Kupon platí od ${castka(min)} útraty. Zkontroluj účtenku.`);
    else if (orderValue < min) out.push(`Útrata ${castka(orderValue)} je pod minimem ${castka(min)}.`);
  }
  if (c.adult_only === true) out.push('Kupon je jen pro plnoleté. Zkontroluj doklad.');
  return out;
}

export type StavKuponu = 'koncept' | 'naplanovano' | 'aktivni' | 'vypnuto' | 'vyprselo' | 'vyprodano' | 'archiv';
export const STAV_POPISKY: Record<StavKuponu, string> = {
  koncept: 'Koncept', naplanovano: 'Naplánováno', aktivni: 'Aktivní', vypnuto: 'Vypnuto',
  vyprselo: 'Vypršelo', vyprodano: 'Rozebráno', archiv: 'Archiv',
};

/** Stav kuponu k danému dni (pražské YYYY-MM-DD). */
export function stavKuponu(c: any, today: string): StavKuponu {
  if (c.archived_at) return 'archiv';
  if (c.draft === true) return 'koncept';
  if (c.valid_until && String(c.valid_until) < today) return 'vyprselo';
  if (c.active === false) return 'vypnuto';
  if (c.valid_since && String(c.valid_since) > today) return 'naplanovano';
  if (Number(c.max_total) > 0 && Number(c.issued) >= Number(c.max_total)) return 'vyprodano';
  return 'aktivni';
}

/** Kupon, který si host smí vzít (jen aktivní nebo naplánovaný — ten se ukáže s důvodem). */
export const jeVidetelnyHostum = (c: any): boolean => c.draft !== true && !c.archived_at && c.active !== false;

/** Kolik kusů ještě zbývá (null = bez limitu). */
export function kusyZbyva(c: any): number | null {
  const max = Number(c.max_total) || 0;
  return max > 0 ? Math.max(0, max - (Number(c.issued) || 0)) : null;
}

/** Zrcadlo SQL podmínky `max_total IS NULL OR issued < max_total` (UPDATE ... WHERE v lib/kuponyKusy.ts). */
export const jeVolnyKus = (issued: number, maxTotal: number | null): boolean => !maxTotal || maxTotal <= 0 || issued < maxTotal;

/** Zrcadlo SQL podmínky denního limitu: nový den začíná od nuly. */
export function denniLimitOk(c: { daily_limit?: any; daily_count?: any; daily_day?: any }, today: string): boolean {
  const lim = Number(c.daily_limit) || 0;
  if (lim <= 0) return true;
  if (String(c.daily_day ?? '') !== today) return true;
  return (Number(c.daily_count) || 0) < lim;
}

export type HostProRozeslani = { drzi: number; vzato: number; birthday: string | null };
export type DuvodPreskoceni = 'drzi' | 'limit' | 'neplnolety';

/**
 * Proč kupon poslaný hostovi (dárek, uvítací akce) nepadne: už drží neuplatněný kód téhož kuponu,
 * vyčerpal limit na hosta, nebo je to 18+ kupon a host je nezletilý. Neznámé datum narození
 * nevadí — doklad zkontroluje obsluha u kasy (varování při uplatnění).
 * Okno platnosti, úroveň a cooldown se u dárku nehlídají: správce posílá vědomě.
 */
export function duvodPreskoceni(c: any, h: HostProRozeslani, today: string): DuvodPreskoceni | null {
  if (h.drzi > 0) return 'drzi';
  const per = Number(c.per_customer) || 0;
  if (per > 0 && h.vzato >= per) return 'limit';
  if (c.adult_only === true) {
    const vek = ageFrom(h.birthday, today);
    if (vek != null && vek < 18) return 'neplnolety';
  }
  return null;
}
