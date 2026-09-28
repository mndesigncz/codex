// Okno dne v plánovači rozvrhu — kdo z týmu ten den může a jak se návrh
// po ruční úpravě přepočítá. Čistá logika bez Reactu a bez databáze, ať ji
// hlídají testy (scripts/testy/rozvrh-den.ts).
//
// Proč tohle vůbec existuje: vedení po vygenerování doplňovalo lidi tak, že
// mělo na jednom zařízení rozvrh a na druhém dostupnost. Okno dne teď ukazuje
// celý tým se stavem na ten konkrétní den (může / jen něco / nemůže / volno /
// nevyplněno) a s poznámkou, takže se dá rozhodnout na jednom místě.
//
// Datový model dostupnosti (availability_requests, /api/availability):
// `unavailableDates` = dny „nemůže", `dayPreferences[den]` = 'off' | 'morning'
// | 'afternoon' | 'flexible' | 'type:<id>', `preferredShift` = obecná
// preference, `note` = poznámka pro vedení k celému měsíci. Poznámka ke
// konkrétnímu dni v datech zatím není — `poznamkyDnu` je připravené pole pro
// případ, že přibude, dnes ho nikdo neplní.

import { dayPrefLabel, isRestrictingPref, parseTypePref, prefAllowsSlot, type PrefType } from './dayPrefs.ts';
import { openSpan, toHM, toMinutes, uncovered, type OpeningDay } from './coverage.ts';

export type StavDne = 'muze' | 'omezeni' | 'nemuze' | 'volno' | 'nevyplneno';
/** Tón chipu — stejné stavové tokeny jako všude jinde (DESIGN.md). */
export type TonStavu = 'ok' | 'info' | 'wait' | 'bad' | 'muted';

export interface DostupnostClena {
  unavailableDates?: string[] | null;
  dayPreferences?: Record<string, string> | null;
  preferredShift?: string | null;
  note?: string | null;
  /** Poznámka ke konkrétnímu dni — v API zatím neexistuje (viz hlavička). */
  poznamkyDnu?: Record<string, string> | null;
}

export interface VolnoClena {
  fromDate: string;
  toDate: string;
  type?: string | null;
}

export interface StavClenaDne {
  stav: StavDne;
  /** Krátký popis do chipu: „může", „jen Ranní", „nemůže", „dovolená", „nevyplněno". */
  popis: string;
  ton: TonStavu;
  /** Denní volba, pokud nějaká omezuje ('type:2', 'morning'…), jinak null. */
  volba: string | null;
  /** Obecná preference „preferuje ranní" — jen když den sám nic neříká. */
  preferuje: string | null;
  /** Poznámka pro vedení (obecná) a poznámka ke dni, pokud existuje. */
  poznamka: string | null;
  poznamkaDne: string | null;
}

const TYP_VOLNA: Record<string, string> = { vacation: 'dovolená', sick: 'nemoc', other: 'volno' };
const den10 = (v: unknown) => String(v ?? '').slice(0, 10);

/**
 * Stav jednoho člověka na jeden den. Pořadí pravidel je důležité: schválené
 * volno přebije i „může" z dostupnosti (dovolená se schvalovala později
 * a je závazná), „nemůže" přebije denní volbu typu.
 */
export function stavClenaDne(
  datum: string,
  dostupnost: DostupnostClena | null | undefined,
  volno: readonly VolnoClena[],
  typy: readonly PrefType[],
): StavClenaDne {
  const poznamka = dostupnost?.note?.trim() || null;
  const poznamkaDne = dostupnost?.poznamkyDnu?.[datum]?.trim() || null;
  const zaklad = { volba: null, preferuje: null, poznamka, poznamkaDne };

  const v = volno.find(x => den10(x.fromDate) <= datum && datum <= den10(x.toDate || x.fromDate));
  if (v) return { ...zaklad, stav: 'volno', popis: `schválené volno${v.type && TYP_VOLNA[v.type] && v.type !== 'other' ? ` · ${TYP_VOLNA[v.type]}` : ''}`, ton: 'wait' };

  if (!dostupnost) return { ...zaklad, stav: 'nevyplneno', popis: 'nevyplněno', ton: 'muted' };

  const volbaDne = dostupnost.dayPreferences?.[datum] ?? '';
  if ((dostupnost.unavailableDates ?? []).includes(datum) || volbaDne === 'off') {
    return { ...zaklad, stav: 'nemuze', popis: 'nemůže', ton: 'bad' };
  }
  if (isRestrictingPref(volbaDne)) {
    return { ...zaklad, stav: 'omezeni', popis: dayPrefLabel(volbaDne, [...typy]) ?? 'omezeně', ton: 'info', volba: volbaDne };
  }
  const pref = dostupnost.preferredShift;
  const preferuje = pref === 'morning' ? 'preferuje ranní' : pref === 'afternoon' ? 'preferuje odpolední' : null;
  return { ...zaklad, stav: 'muze', popis: 'může', ton: 'ok', preferuje };
}

// ---- Řazení ------------------------------------------------------------------

export interface RadekDne {
  id: number;
  jmeno: string;
  stav: StavDne;
  /** Už má ten den směnu (uloženou nebo v návrhu). */
  maSmenu: boolean;
}

/**
 * Pořadí v okně dne: nahoře ti, koho jde rovnou přidat (může a ještě nemá
 * směnu), pak omezení, pak kdo už ten den stojí (je to informace, ne
 * kandidát), pak nemůže a volno, úplně dole kdo nic nevyplnil. Uvnitř
 * skupiny podle jména, ať řádky mezi dny neposkakují.
 */
export function poradiRadku(r: RadekDne): number {
  if (r.stav === 'nevyplneno' && !r.maSmenu) return 4;
  if (r.maSmenu) return 2;
  if (r.stav === 'muze') return 0;
  if (r.stav === 'omezeni') return 1;
  return 3; // nemůže, volno
}

export function seradRadky<T extends RadekDne>(radky: readonly T[]): T[] {
  return [...radky].sort((a, b) => poradiRadku(a) - poradiRadku(b) || a.jmeno.localeCompare(b.jmeno, 'cs'));
}

// ---- Překryv směn --------------------------------------------------------------

/** Úsek směny v minutách; noční (konec ≤ začátek) jde přes půlnoc. */
export function usek(od: string, doCasu: string): { start: number; end: number } | null {
  const s = toMinutes(od);
  let e = toMinutes(doCasu);
  if (s == null || e == null) return null;
  if (e <= s) e += 1440;
  return { start: s, end: e };
}

/** Překrývají se dvě směny téhož dne? Dotyk (14:00 konec, 14:00 začátek) není překryv. */
export function prekryvaSe(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }): boolean {
  const x = usek(a.startTime, a.endTime);
  const y = usek(b.startTime, b.endTime);
  if (!x || !y) return false;
  return x.start < y.end && y.start < x.end;
}

/** Má člověk na ten den směnu, se kterou by se nová překrývala? */
export function kolize(
  smenyCloveka: readonly { startTime: string; endTime: string }[],
  nova: { startTime: string; endTime: string },
): boolean {
  return smenyCloveka.some(s => prekryvaSe(s, nova));
}

// ---- Výchozí typ při přidání --------------------------------------------------

export interface TypDne extends PrefType {
  /** Konkrétní časy toho dne (typ vázaný na otvíračku je bere z ní). */
  od: string;
  do: string;
}

/**
 * Který typ nabídnout jako první: ten, který člověk na den chce (denní
 * volba), jinak první chybějící (díra dne), jinak první, který mu nekoliduje.
 * Vrací null, když žádný typ nejde (všechny kolidují se směnou, kterou má).
 */
export function vychoziTyp(
  typy: readonly TypDne[],
  volba: string | null,
  chybejici: readonly string[],
  smenyCloveka: readonly { startTime: string; endTime: string }[],
): TypDne | null {
  const volne = typy.filter(t => !kolize(smenyCloveka, { startTime: t.od, endTime: t.do }));
  if (volne.length === 0) return null;
  const chce = parseTypePref(volba);
  if (chce != null) { const t = volne.find(x => x.id === chce); if (t) return t; }
  if (volba === 'morning' || volba === 'afternoon') {
    const t = volne.find(x => prefAllowsSlot(volba, { typeId: x.id, start: x.od }, [...typy]));
    if (t) return t;
  }
  const chybi = new Set(chybejici.map(n => n.trim().toLowerCase()));
  return volne.find(t => chybi.has(t.name.trim().toLowerCase())) ?? volne[0];
}

// ---- Návrh po ruční úpravě ----------------------------------------------------

export interface DiraDne { date: string; from: string; to: string; minutes: number }
export interface ChybiDne { date: string; shiftTypeName: string }

/**
 * Přepočet červených dnů návrhu po ruční úpravě jednoho dne. Díry v pokrytí
 * se pro ten den spočítají znovu z toho, co v něm teď je. Neobsazená místa se
 * jen posunou: přidaný typ ze seznamu zmizí, odebraný (a jinak neobsazený)
 * typ do něj přibude — co den potřebuje, určil generátor, klient to znovu
 * nevymýšlí.
 */
export function prepocitejDen(
  stav: { gaps: DiraDne[]; understaffed: ChybiDne[] },
  datum: string,
  oteviraciDen: OpeningDay | null | undefined,
  smenyDne: readonly { startTime: string; endTime: string; type?: string | null }[],
  zmena: { pridanTyp?: string | null; odebranTyp?: string | null },
): { gaps: DiraDne[]; understaffed: ChybiDne[] } {
  const open = openSpan(oteviraciDen ?? null);
  const nove = open
    ? uncovered(open, smenyDne.map(s => ({ start: s.startTime, end: s.endTime })))
      .map(g => ({ date: datum, from: toHM(g.start), to: toHM(g.end), minutes: g.end - g.start }))
    : [];
  const gaps = [...stav.gaps.filter(g => g.date !== datum), ...nove];
  const norm = (n: unknown) => String(n ?? '').trim().toLowerCase();
  let understaffed = stav.understaffed;
  if (zmena.pridanTyp) {
    understaffed = understaffed.filter(m => !(m.date === datum && norm(m.shiftTypeName) === norm(zmena.pridanTyp)));
  }
  if (zmena.odebranTyp && !smenyDne.some(s => norm(s.type) === norm(zmena.odebranTyp))
    && !understaffed.some(m => m.date === datum && norm(m.shiftTypeName) === norm(zmena.odebranTyp))) {
    understaffed = [...understaffed, { date: datum, shiftTypeName: String(zmena.odebranTyp) }];
  }
  return { gaps, understaffed };
}
