// Chybějící uzávěrky v přehledu organizace (kolo 69, nález N9).
//
// Přehled Všech podniků počítal „chybí uzávěrka" jinak než Uzávěrky
// samotné: dnešek se v něm míchal s minulými dny a jediné číslo neumělo
// říct, jestli jde o zapomenutý včerejšek, nebo o směnu, která ještě běží.
// Uzávěrky (/api/closings + lib/uzaverkyPrehled.ts) to mají rozdělené:
// `missingClosings` jen do včerejška, dnešek zvlášť v `missingToday`,
// a kalendář dnešek bez uzávěrky značí „čeká", nikdy „chybí" (`stavDne`).
// Tady je totéž pravidlo pro řádek podniku v přehledu, jako čistá funkce
// (bez databáze a bez aliasu `@/`), aby ho šlo otestovat přímo v Node —
// scripts/testy/k69-akce-org.ts.
//
// Dnešek se ukazuje až po zavírací době: dokud má podnik otevřeno, uzávěrka
// „chybět" nemůže — obsluha ji dělá na konci směny. Po zavření je to
// užitečná připomínka („dnes ještě chybí"), pořád ale ne chyba — do počtu
// chybějících se nepřičítá, ten zůstává jen do včerejška jako v Uzávěrkách.

import { toMinutes, weekdayKey, type OpeningDay } from './coverage.ts';

/** Řádek „den se směnou" z databáze: datum, jestli ji založil příchod sám, a jestli ten den někdo zavřel. */
export interface DenSeSmenou {
  date: string;
  auto_created?: boolean | null;
  /** Existuje uzávěrka s tímhle obchodním dnem (COALESCE(shift_date, date)). */
  uzavreno: boolean;
}

export interface ChybejiciPodniku {
  /** Dny se směnou bez uzávěrky, jen do včerejška (N9). */
  chybi: number;
  /** Dnes se pracuje (nebo pracovalo) a uzávěrka zatím není. */
  dnesChybi: boolean;
}

/**
 * Dny v týdnu (klíč 0 = pondělí), kdy má podnik podle otevírací doby
 * zavřeno. Stejné čtení jako `zavreneDnyTydne` v lib/staleShifts.ts, jen
 * z už načtené hodnoty — přehled čte otevírací dobu jedním dotazem s názvem
 * podniku, ne dvakrát.
 */
export function zavreneDny(openingHours: unknown): Set<string> {
  const out = new Set<string>();
  if (!openingHours || typeof openingHours !== 'object') return out;
  for (const [k, v] of Object.entries(openingHours as Record<string, OpeningDay>)) {
    if (v && v.closed === true) out.add(String(k));
  }
  return out;
}

/**
 * Chybějící uzávěrky jednoho podniku. Automatická směna na den, kdy je
 * zavřeno, se vynechává (příchod po půlnoci zapsaný podle hodin na zdi —
 * stejné pravidlo jako `smenaBezUzaverky`), a den se počítá jednou, ať na
 * něm bylo lidí kolik chce.
 */
export function chybejiciUzaverkyPodniku(dny: readonly DenSeSmenou[], dnes: string, zavreno: Set<string>): ChybejiciPodniku {
  const chybejici = new Set<string>();
  let dnesChybi = false;
  // Den je uzavřený, když aspoň jeden řádek toho dne říká „uzavřeno" — řádky
  // jsou po (datum, auto_created), takže jeden den může přijít dvakrát.
  const uzavreneDny = new Set(dny.filter(d => d.uzavreno).map(d => String(d.date).slice(0, 10)));
  for (const d of dny) {
    const den = String(d.date).slice(0, 10);
    if (!den || uzavreneDny.has(den)) continue;
    if (d.auto_created === true && zavreno.has(weekdayKey(den))) continue;
    if (den < dnes) chybejici.add(den);
    else if (den === dnes) dnesChybi = true;
  }
  return { chybi: chybejici.size, dnesChybi };
}

/**
 * Má už podnik dnes po zavírací době? `ted` je pražský čas „HH:MM".
 *
 * Bez čitelné otevírací doby, v zavřený den a u provozu přes půlnoc
 * (zavírací čas menší nebo rovný otevíracímu — stejná konvence jako
 * u směn) je odpověď „ne": pracovní den pak ještě neskončil, nebo se to
 * z dat poznat nedá. Tichá připomínka o hodinu později je menší zlo než
 * „chybí" nad směnou, která zrovna obsluhuje hosty. Provoz přes půlnoc
 * zítra spadne do chybějících do včerejška sám.
 */
export function poZaviraciDobe(openingHours: unknown, dnes: string, ted: string): boolean {
  if (!openingHours || typeof openingHours !== 'object') return false;
  const oh = (openingHours as Record<string, OpeningDay>)[weekdayKey(dnes)];
  if (!oh || oh.closed) return false;
  const od = toMinutes(oh.open), zavira = toMinutes(oh.close), nyni = toMinutes(ted);
  if (od == null || zavira == null || nyni == null) return false;
  if (zavira <= od) return false;
  return nyni >= zavira;
}

/** Ukázat u podniku „dnes ještě chybí"? Jen když dnešek bez uzávěrky je a podnik už zavřel. */
export function dnesJesteChybi(r: { missingToday?: unknown; todayAfterClose?: unknown }): boolean {
  return r.missingToday === true && r.todayAfterClose === true;
}
