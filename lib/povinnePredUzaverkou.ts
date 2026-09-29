// Povinné před uzávěrkou — čistá logika (bez databáze).
//
// Uzávěrku dne dřív hlídaly jen povinné postupy, a to jedinou kontrolou až při
// odeslání: formulář nevěděl nic, obsluha spočítala kasu a teprve pak dostala
// červenou hlášku. Teď se povinné věci (postupy, úkoly, návody) skládají na
// jednom místě a formulář i server se ptají stejně — zámek je vidět dřív, než
// člověk začne počítat, a server ho pořád vynutí.
//
// Tenhle soubor je bez databáze, aby se pravidla dala otestovat
// (scripts/testy/k70-povinne.ts). Dotazy jsou v lib/povinnePredUzaverkouDb.ts.

import { businessDayOf, pragueDayOf } from './pragueTime.ts';
import { czCount, type CzNoun } from './czech.ts';

export type TypPovinne = 'postup' | 'ukol' | 'navod';

export interface PovinnaPolozka {
  typ: TypPovinne;
  id: number;
  nazev: string;
  ikona: string | null;
  /** Úkol: komu patří (jméno), „Kdokoli" u úkolu pro celý tým. */
  kdo?: string | null;
  /** Úkol: id toho, komu patří (null = kdokoli). Formulář podle něj pozná
   *  kolegův úkol, který sám neotevře ani neodškrtne. */
  kdoId?: number | null;
  hotovo: boolean;
  /** Kam z položky jít. `pohled`/`arg` pro navigaci uvnitř plochy, `href` jako záloha. */
  odkaz: { pohled: 'procedures' | 'tasks' | 'guides'; arg?: string; href: string };
}

export interface StavPovinnych {
  /** Všechny povinné věci pro ten den a člověka — hotové i chybějící (pro ukazatel „Hotovo X z Y"). */
  vsechny: PovinnaPolozka[];
  /** Jen chybějící — tyhle uzávěrku zamykají. */
  polozky: PovinnaPolozka[];
  /** Zdroje, které se nepodařilo zjistit (např. před migrací). Neblokují — server
   *  by jinak zamkl uzávěrku kvůli chybě, ne kvůli nesplněné práci. */
  neznamo: TypPovinne[];
}

// Pořadí skupin v zámku: postupy (otevření/zavření podniku) jsou nejdelší,
// proto nahoře; úkoly; návody (jen přečíst) nakonec.
const PORADI: Record<TypPovinne, number> = { postup: 0, ukol: 1, navod: 2 };

/** Seřadí po skupinách, uvnitř skupiny nejdřív to, co chybí, pak podle názvu. */
export function seradPolozky(p: PovinnaPolozka[]): PovinnaPolozka[] {
  return [...p].sort((a, b) =>
    (PORADI[a.typ] - PORADI[b.typ])
    || (Number(a.hotovo) - Number(b.hotovo))
    || a.nazev.localeCompare(b.nazev, 'cs')
    || (a.id - b.id));
}

/** Složí stav ze všech položek: seřadí a vybere chybějící. */
export function sestavStav(vsechny: PovinnaPolozka[], neznamo: TypPovinne[] = []): StavPovinnych {
  const serazene = seradPolozky(vsechny);
  return { vsechny: serazene, polozky: serazene.filter(x => !x.hotovo), neznamo: Array.from(new Set(neznamo)) };
}

/** Je uzávěrka zamčená? Jen kvůli skutečně chybějící věci — `neznamo` nezamyká. */
export function jeZamceno(stav: Pick<StavPovinnych, 'polozky'> | null | undefined): boolean {
  return !!stav && stav.polozky.some(x => !x.hotovo);
}

export function pocty(stav: StavPovinnych): { celkem: number; hotovo: number } {
  return { celkem: stav.vsechny.length, hotovo: stav.vsechny.filter(x => x.hotovo).length };
}

/**
 * Proč se tahle uzávěrka nehlídá vůbec. Akce (stánek mimo podnik) nedělá
 * otevírací rutinu podniku; kdo neměl směnu, jeho uzávěrka jde vedení ke
 * schválení a blokovat ji by znamenalo nechat peníze nenahlášené.
 */
export function duvodVolna(o: { eventId: number | null; maSmenu: boolean }): 'akce' | 'mimo_smenu' | null {
  if (o.eventId != null) return 'akce';
  if (!o.maSmenu) return 'mimo_smenu';
  return null;
}

/**
 * Patří úkol osádce té směny? Úkol pro kohokoli (bez přiřazení) ano; přiřazený
 * jen když jeho člověk na směně je — cizí úkol z jiné směny nesmí zamknout
 * uzávěrku lidem, kteří ho udělat nemůžou. `posadka` null = bez filtru
 * (souhrn dne za celý podnik).
 */
export function ukolProPosadku(assignedTo: number | null | undefined, posadka: number[] | null): boolean {
  if (assignedTo == null) return true;
  if (posadka == null) return true;
  return posadka.includes(Number(assignedTo));
}

/**
 * Obchodní den dokončení postupu: do NIGHT_CUTOFF_HOUR ráno ještě předchozí
 * den, stejně jako účtenky. Postup dodělaný v 0:30 na noční směně patří k
 * večeru, který se zavírá — dřív se porovnával kalendářní den a noční směna
 * zůstala zamčená. SQL v lib/povinnePredUzaverkouDb.ts počítá totéž.
 */
export function denDokonceni(d: Date): string {
  return businessDayOf(d);
}

/**
 * Počítá se dokončení k uzávěrce dne `den`? Obchodní den (noční směna po
 * půlnoci) NEBO kalendářní den: ranní otevření v 5:40 je obchodně včerejšek,
 * ale k dnešní uzávěrce patří — jen obchodní den by ranní směnu zamkl.
 * SQL v lib/povinnePredUzaverkouDb.ts má obě podmínky spojené OR.
 */
export function dokoncenoKeDni(d: Date, den: string): boolean {
  return businessDayOf(d) === den || pragueDayOf(d) === den;
}

const VEC: CzNoun = { one: 'věc', few: 'věci', many: 'věcí' };

/** Hláška pro 400 z POST /api/closings (starší klient ukazuje jen `error`). */
export function zpravaZamceno(chybi: PovinnaPolozka[]): string {
  const nazvy = chybi.map(x => x.nazev);
  const vycet = nazvy.length > 5 ? `${nazvy.slice(0, 5).join(', ')} a další` : nazvy.join(', ');
  return `Uzávěrka je zamčená — nejdřív dokonči ${czCount(chybi.length, VEC)}: ${vycet}.`;
}
