// Generátor rozvrhu — rozhodovací logika bez databáze a bez Next.js, ať ji
// hlídají testy v Node (scripts/testy/rozvrh-generator.ts). Route
// app/api/schedule/generate jen načte data, zavolá `navrhniRozvrh` a vrátí
// výsledek.
//
// Proč se to celé přestavělo (Martin, kavárna): „hlavní je, aby byla pokrytá
// směna, která otvírá, protože bez ní se prostor neotevře. Druhá směna je,
// když je kdo — dá se otevřít i bez ní." Generátor to dřív nerozlišoval:
// typy směn bral podle toho, kolik otevírací doby pokryjí, takže delší
// odpolední (12–20) šla před kratší otvíračkou (8–14). Když byl ten den
// k mání jen jeden člověk, dostal odpolední a nikdo neotevřel. A závěrečná
// kontrola hlásila každou díru stejně hlasitě, ať podnik zůstal zavřený,
// nebo jen chyběl druhý člověk na odpoledne.
//
// Teď:
//  1) OTEVÍRACÍ směna dne (začíná v čas otevření — typ „Od otevření", nebo
//     s pevným časem shodným s otevřením; když žádná nezačíná v otevření,
//     tak nejdřívější) je POVINNÁ. Obsadí se hned po pevných dnech, dřív než
//     cokoli dalšího — a to v celém MĚSÍCI: nejdřív se projdou všechny dny
//     a obsadí otevírací směny, teprve druhým průchodem se doplní ostatní.
//     Kdyby se šlo den po dni, druhé směny prvních dnů by vyčerpaly limity
//     (max směn, dní v řadě, hodin) a od půlky měsíce by nikdo neotevřel,
//     přestože šlo pokrýt všechny otvíračky.
//     Neobsazená = díra úrovně „povinna": podnik se neotevře.
//  2) Ostatní směny jsou ŽÁDOUCÍ. Obsadí se, když je kdo a zbyla kapacita;
//     neobsazená je mírné upozornění („otevře se s jedním člověkem"), ne
//     díra v otevírací době.
//  3) Volitelně (výchozí VYPNUTO — Martin: „ať to tam zbytečně není") počet
//     lidí podle tržeb: pod prahem očekávané tržby dne stačí JEDEN ČLOVĚK NA
//     CELÝ DEN. Platí to jen tehdy, když otevírací směna sama pokryje celou
//     otevírací dobu (typ od otevření do zavření). Při typech Ranní 8–14
//     a Odpolední 14–20 by „jeden" znamenal zavřít ve 14:00 — to Martin
//     nemyslel, takže se druhá směna obsadí normálně a doporučení to řekne
//     (`nepokryjeJeden`).
//
// Uložené směny měsíce (`ulozene`), když se měsíc nepřepisuje, se berou jako
// už obsazené: kdo má uloženou směnu, ten den znovu nedostane, typ, který
// uložená směna drží, se nenavrhuje podruhé, a díry se počítají z uložených
// i navržených dohromady. Dřív generátor uložené směny ignoroval, hlásil
// falešné „Nikdo neotevře" a uložení pak vytvořilo duplicity.
//
// Výběr člověka má navíc jednoduchý výhled dopředu: z pořadí kandidátů se
// vezme první, kdo nevezme poslední možnost jiné směně téhož dne. Jinak by
// spravedlivé střídání poslalo na otvíračku jediného, kdo může odpoledne,
// a odpolední by zůstala prázdná, přestože se šlo obsadit obojí.

import { openSpan, uncovered, gapText, toMinutes, urovenDiry, type Interval, type OpeningDay, type UrovenDiry } from './coverage.ts';
import { prefAllowsSlot, dayPrefLabel, type PrefType } from './dayPrefs.ts';

// ---- Vstupy ------------------------------------------------------------------

export interface TypSmeny {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  color?: string | null;
  starts_at_open?: boolean | null;
  ends_at_close?: boolean | null;
}

export interface ClovekGeneratoru {
  id: number;
  name: string;
  avatar?: string | null;
  /** Dny „nemůže" včetně schváleného volna. */
  unavailable: readonly string[];
  dayPrefs: Record<string, string>;
  preferredShift: string | null;
  maxShifts: number | null;
  /** Kolik dní v řadě smí (null = bez limitu; osobní 0 už přeložil volající). */
  maxConsecutive: number | null;
  /** Strop hodin za měsíc (null = bez limitu). */
  maxHours: number | null;
  /** Dny se směnou těsně před měsícem — řada dní v kuse se nepřeruší 1. dne. */
  priorDates?: readonly string[];
  /** Smí dostat půlku rozdělené směny (výchozí ano). */
  splitOk?: boolean;
}

export interface PevnyDen { employeeId: number; weekday: number; shiftTypeId: number | null }

/** Očekávaná tržba dne v týdnu (klíč '0' = pondělí) z historie. */
export type TrzbyDnu = Record<string, { prumer: number; vzorek: number }>;

export interface VstupGeneratoru {
  month: string;
  lide: readonly ClovekGeneratoru[];
  typy: readonly TypSmeny[];
  openingHours: Record<string, OpeningDay & { open: string; close: string }>;
  pevne?: readonly PevnyDen[];
  pravidla?: { balanceShifts?: boolean; splitShifts?: boolean };
  /**
   * Počet lidí podle tržeb. `null`/chybí = funkce vypnutá: generátor se řídí
   * jen povinnou a žádoucí směnou a o tržbách nic neříká.
   */
  trzby?: { prah: number; dny: TrzbyDnu } | null;
  /**
   * Směny měsíce, které už jsou uložené a zůstanou (uložení návrhu měsíc
   * nepřepíše). Generátor je bere jako obsazené; v návrhu se neobjeví.
   */
  ulozene?: readonly UlozenaSmena[];
}

export interface UlozenaSmena { employeeId: number; date: string; startTime: string; endTime: string; type?: string | null }

// ---- Výstupy -----------------------------------------------------------------

export interface NavrzenaSmena {
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  shiftTypeId: number;
  shiftTypeName: string;
  color: string | null | undefined;
  split?: boolean;
  /** Tahle směna otvírá podnik. */
  oteviraci?: boolean;
}

export interface DiraGeneratoru { date: string; from: string; to: string; minutes: number; uroven: UrovenDiry }
export interface NeobsazenoGeneratoru { date: string; shiftTypeName: string; uroven: UrovenDiry }
export interface DoporuceniDne {
  date: string;
  /** Kolik lidí se podle tržby vyplatí. */
  lidi: 1 | 2;
  /** Očekávaná tržba dne (průměr stejného dne v týdnu), zaokrouhlená. */
  trzba: number;
  /** Z kolika dnů historie průměr je. */
  vzorek: number;
  /** Hodiny, které by jinak šly na druhou směnu (jen u „stačí jeden"). */
  usporaHodin: number;
  /**
   * Podle tržby by stačil jeden, ale otevírací směna nepokryje celou
   * otevírací dobu (není typ od otevření do zavření, nebo ho ten den nikdo
   * nemůže) — druhá směna se proto obsadila normálně a nic se neušetřilo.
   */
  nepokryjeJeden?: boolean;
}

export interface VystupGeneratoru {
  proposed: NavrzenaSmena[];
  warnings: string[];
  gaps: DiraGeneratoru[];
  understaffed: NeobsazenoGeneratoru[];
  /** Jen když je doporučení podle tržeb zapnuté a počítalo se. */
  doporuceni?: DoporuceniDne[];
  hodiny: { celkem: number; usporaDoporucenim: number };
}

// ---- Pomocníci času ----------------------------------------------------------

/** Den v týdnu 0 = pondělí … 6 = neděle z YYYY-MM-DD. */
export function denTydne(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
function kategorie(start: string) { return start < '12:00' ? 'morning' : 'afternoon'; }
/** Konkrétní časy typu na den — „od otevření / do zavření" podle otevírací doby. */
export function casyTypu(st: TypSmeny, oh: { open?: string | null; close?: string | null }) {
  return {
    start: st.starts_at_open && oh.open ? String(oh.open) : String(st.start_time).slice(0, 5),
    end: st.ends_at_close && oh.close ? String(oh.close) : String(st.end_time).slice(0, 5),
  };
}
function vejdeSe(start: string, end: string, open: string, close: string) {
  if (end <= start) return start >= open; // přes půlnoc: jen začátek v otevírací době
  return start >= open && end <= close;
}
/** Hodiny směny; 18:00–02:00 přes půlnoc = 8. */
export function hodinySmeny(start: string, end: string): number {
  const s = toMinutes(start), e = toMinutes(end);
  if (s == null || e == null) return 8;
  let min = e - s;
  if (min <= 0) min += 1440;
  return min / 60;
}
function hm(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function posunDen(date: string, o: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + o);
  return d.toISOString().slice(0, 10);
}
const predchoziDen = (date: string) => posunDen(date, -1);
const dalsiDen = (date: string) => posunDen(date, 1);
function dnuVMesici(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
const kratceDen = (date: string) => { const [, mm, dd] = date.split('-'); return `${parseInt(dd)}.${parseInt(mm)}.`; };

/**
 * Otevírací typy dne: ty, které začínají v čas otevření (± 5 min). Když
 * žádný nezačíná v otevření, otvírá nejdřívější — někdo prostor odemknout
 * musí, i když má typ napsaný čas o čtvrt hodiny později.
 */
export function oteviraciTypy(fitting: readonly TypSmeny[], oh: { open: string; close: string }): Set<number> {
  const open = toMinutes(oh.open);
  if (open == null || fitting.length === 0) return new Set();
  const zacatky = fitting.map(t => ({ id: t.id, s: toMinutes(casyTypu(t, oh).start) ?? 9999 }));
  const vOtevreni = zacatky.filter(z => Math.abs(z.s - open) <= 5);
  if (vOtevreni.length > 0) return new Set(vOtevreni.map(z => z.id));
  const nejdriv = Math.min(...zacatky.map(z => z.s));
  return new Set(zacatky.filter(z => z.s === nejdriv).map(z => z.id));
}

/**
 * Z kandidátů seřazených podle priority vezme prvního, jehož přidělení
 * nevezme poslední možnost jiné čekající směně. Když to nejde u povinné
 * i žádoucí zároveň, chrání se aspoň povinné; jinak první v pořadí.
 */
export function vyberKandidata<T extends { id: number }>(
  serazeni: readonly T[],
  zbyle: readonly { kandidati: readonly number[]; povinna: boolean }[],
): T | null {
  if (serazeni.length === 0) return null;
  const nebereJedine = (c: T, jenPovinne: boolean) => zbyle.every(z =>
    (jenPovinne && !z.povinna) || z.kandidati.length === 0 || z.kandidati.some(id => id !== c.id));
  return serazeni.find(c => nebereJedine(c, false)) ?? serazeni.find(c => nebereJedine(c, true)) ?? serazeni[0];
}

// ---- Tržby -------------------------------------------------------------------

/**
 * Očekávaná tržba po dnech v týdnu: průměr stejného dne v týdnu za posledních
 * `tydnu` týdnů před `dnes`. Zavřené dny (podle otevírací doby) a dny bez
 * tržby se nepočítají — nula ze zavřeného pondělí by průměr stáhla dolů
 * a generátor by pak šetřil na dnech, které jsou ve skutečnosti rušné.
 */
export function ocekavaneTrzby(
  historie: readonly { date: string; trzba: number }[],
  dnes: string,
  openingHours?: Record<string, OpeningDay> | null,
  tydnu = 8,
): TrzbyDnu {
  const od = (() => { const d = new Date(dnes + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - tydnu * 7); return d.toISOString().slice(0, 10); })();
  const soucty = new Map<number, { suma: number; n: number }>();
  const poDnech = new Map<string, number>();
  for (const h of historie) {
    const d = String(h.date).slice(0, 10);
    if (d < od || d >= dnes) continue;
    poDnech.set(d, (poDnech.get(d) ?? 0) + (Number(h.trzba) || 0));
  }
  for (const [d, trzba] of poDnech) {
    if (trzba <= 0) continue;
    const wd = denTydne(d);
    if (openingHours?.[String(wd)]?.closed) continue;
    const s = soucty.get(wd) ?? { suma: 0, n: 0 };
    s.suma += trzba; s.n++;
    soucty.set(wd, s);
  }
  const out: TrzbyDnu = {};
  for (const [wd, s] of soucty) out[String(wd)] = { prumer: Math.round(s.suma / s.n), vzorek: s.n };
  return out;
}

/**
 * Návrh prahu z dat: medián průměrů dnů v týdnu, zaokrouhlený na pěkné číslo.
 * Medián proto, že rozdělí týden zhruba napůl — rušné dny dostanou dva lidi,
 * klidné jednoho. Méně než dva dny s daty = návrh nedává smysl (null).
 */
export function navrhPrahu(dny: TrzbyDnu): number | null {
  const hodnoty = Object.values(dny).filter(x => x.vzorek > 0).map(x => x.prumer).sort((a, b) => a - b);
  if (hodnoty.length < 2) return null;
  const mid = Math.floor(hodnoty.length / 2);
  const median = hodnoty.length % 2 ? hodnoty[mid] : (hodnoty[mid - 1] + hodnoty[mid]) / 2;
  const krok = median >= 5000 ? 500 : median >= 500 ? 100 : 10;
  return Math.max(krok, Math.round(median / krok) * krok);
}

/** 1 vs 2 lidé: dva, když očekávaná tržba práh PŘESÁHNE. Bez dat null (rozhoduje bod 1). */
export function lidiPodleTrzby(prumer: number | null | undefined, prah: number): 1 | 2 | null {
  if (prumer == null || !Number.isFinite(prumer) || !(prah > 0)) return null;
  return prumer > prah ? 2 : 1;
}

/** Nastavení generování v teams.staffing_rules (JSON) — vyčištěné. */
export interface NastaveniTrzeb { podleTrzeb: boolean; prah: number | null }
export function vycistiNastaveniTrzeb(raw: unknown): NastaveniTrzeb {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const n = Math.round(Number(r.prah));
  return {
    // Výchozí vypnuto: zapnuté je jen výslovné true.
    podleTrzeb: r.podleTrzeb === true,
    prah: Number.isFinite(n) && n > 0 ? Math.min(n, 100_000_000) : null,
  };
}

// ---- Algoritmus --------------------------------------------------------------

interface Stav extends ClovekGeneratoru {
  assigned: number;
  assignedHours: number;
  workedDates: Set<string>;
  lastAssigned: string;
  nemuze: Set<string>;
}

export function navrhniRozvrh(vstup: VstupGeneratoru): VystupGeneratoru {
  const { month, typy } = vstup;
  const balanceShifts = vstup.pravidla?.balanceShifts !== false;
  const splitShifts = vstup.pravidla?.splitShifts === true;
  const prefTypes: PrefType[] = typy.map(t => ({ id: Number(t.id), name: String(t.name), start: String(t.start_time).slice(0, 5) }));
  const lide: Stav[] = vstup.lide.map(l => ({
    ...l,
    assigned: 0, assignedHours: 0, lastAssigned: '',
    workedDates: new Set(l.priorDates ?? []),
    nemuze: new Set(l.unavailable),
  }));
  const podleId = new Map(lide.map(l => [l.id, l]));
  const pevnePoDnech = new Map<number, PevnyDen[]>();
  for (const f of vstup.pevne ?? []) {
    const arr = pevnePoDnech.get(f.weekday) ?? [];
    arr.push(f);
    pevnePoDnech.set(f.weekday, arr);
  }

  const warnings: string[] = [];
  const proposed: NavrzenaSmena[] = [];
  const gaps: DiraGeneratoru[] = [];
  const understaffed: NeobsazenoGeneratoru[] = [];
  const doporuceni: DoporuceniDne[] = [];
  let usporaDoporucenim = 0;

  const dostupny = (e: Stav, date: string) => !e.nemuze.has(date) && e.dayPrefs[date] !== 'off';
  const kapacita = (e: Stav) => e.maxShifts == null || e.assigned < e.maxShifts;
  const prefOk = (e: Stav, date: string, st: TypSmeny | null, start: string) =>
    prefAllowsSlot(e.dayPrefs[date], { typeId: st?.id ?? null, start }, prefTypes);
  const prefText = (e: Stav, date: string) => dayPrefLabel(e.dayPrefs[date], prefTypes) ?? 'jiný typ směny';
  const rada = (e: Stav, date: string) => {
    let n = 0;
    let c = predchoziDen(date);
    while (e.workedDates.has(c) && n < 40) { n++; c = predchoziDen(c); }
    return n;
  };
  const radaPo = (e: Stav, date: string) => {
    let n = 0;
    let c = dalsiDen(date);
    while (e.workedDates.has(c) && n < 40) { n++; c = dalsiDen(c); }
    return n;
  };
  // Dny v řadě se počítají OBĚMA směry: druhý průchod doplňuje dny mezi už
  // obsazenými otvíračkami (a uložené směny můžou ležet i dál v měsíci),
  // takže pohled jen dozadu by pustil řadu delší, než je limit.
  const odpocinekOk = (e: Stav, date: string) =>
    e.maxConsecutive == null || e.workedDates.has(date) || rada(e, date) + radaPo(e, date) + 1 <= e.maxConsecutive;
  const hodinyOk = (e: Stav, h: number) => e.maxHours == null || e.assignedHours + h <= e.maxHours + 0.01;
  const vezmi = (e: Stav, date: string, h: number) => {
    e.assigned++; e.workedDates.add(date); e.assignedHours += h;
    if (date > e.lastAssigned) e.lastAssigned = date;
  };
  const norm = (x: unknown) => String(x ?? '').trim().toLowerCase();

  // Závěrečná kontrola dne: je v každé minutě otevírací doby někdo? Díra od
  // otevření = nikdo neotevře (povinná), pozdější prázdno = chybí druhý
  // člověk a podnik zavře dřív (žádoucí). Volá se i pro den bez jediného
  // použitelného typu — otevřeno bez směny je taky díra.
  const kontrolaPokryti = (date: string, den: string, open: Interval | null, placed: { start: string; end: string }[]) => {
    if (!open) return;
    for (const g of uncovered(open, placed)) {
      const uroven = urovenDiry(open, g);
      gaps.push({ date, from: hm(g.start), to: hm(g.end), minutes: g.end - g.start, uroven });
      if (uroven === 'povinna') {
        warnings.unshift(`${den} — NIKDO NEOTEVŘE — podnik se ten den neotevře (${gapText(g)} v podniku nikdo). Doplň někoho ručně.`);
      } else {
        warnings.push(`${den} — ${gapText(g)} v podniku nikdo — otevře se, ale bez druhého člověka zavře dřív.`);
      }
    }
  };

  // Uložené směny, které zůstanou, se započítají dopředu: počet směn, hodiny
  // i dny v řadě — limity platí pro uložené a navržené dohromady.
  const ulozenePoDnech = new Map<string, UlozenaSmena[]>();
  for (const s of vstup.ulozene ?? []) {
    const date = String(s.date).slice(0, 10);
    if (!date.startsWith(month + '-')) continue;
    const u: UlozenaSmena = { ...s, employeeId: Number(s.employeeId), date, startTime: String(s.startTime).slice(0, 5), endTime: String(s.endTime).slice(0, 5) };
    const arr = ulozenePoDnech.get(date) ?? [];
    arr.push(u);
    ulozenePoDnech.set(date, arr);
    const e = podleId.get(u.employeeId);
    if (e) vezmi(e, date, hodinySmeny(u.startTime, u.endTime));
  }

  // ---- Příprava dnů ------------------------------------------------------------
  // Stav každého dne (kdo stojí, který typ je obsazený) žije přes oba
  // průchody, proto je v objektu dne, ne v proměnných smyčky.
  interface Den {
    date: string; wd: number; den: string;
    oh: OpeningDay & { open: string; close: string };
    open: Interval | null;
    fitting: TypSmeny[];
    oteviraci: Set<number>;
    obsazeno: Map<number, number>; // typ → člověk
    ulozenoTypy: Set<number>;      // typy držené uloženou směnou (nenavrhují se)
    dnesStoji: Set<number>;
    ulozeneDne: UlozenaSmena[];
    trzbaDne: { prumer: number; vzorek: number } | undefined;
    lidi: 1 | 2 | null;
  }
  const dny: Den[] = [];
  for (let d = 1; d <= dnuVMesici(month); d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const wd = denTydne(date);
    const oh = vstup.openingHours[String(wd)] ?? { open: '08:00', close: '20:00', closed: false };
    if (oh.closed) continue;
    const den = kratceDen(date);
    const open = openSpan(oh);
    const ulozeneDne = ulozenePoDnech.get(date) ?? [];

    const fitting = typy.filter(st => { const r = casyTypu(st, oh); return vejdeSe(r.start, r.end, oh.open, oh.close); });
    if (fitting.length === 0) {
      kontrolaPokryti(date, den, open, ulozeneDne.map(s => ({ start: s.startTime, end: s.endTime })));
      warnings.push(`${den} — žádný nastavený typ směny se nevejde do otevírací doby ${oh.open}–${oh.close}.`);
      continue;
    }

    const obsazeno = new Map<number, number>();
    const ulozenoTypy = new Set<number>();
    const dnesStoji = new Set<number>();
    for (const s of ulozeneDne) {
      dnesStoji.add(s.employeeId);
      // Uložená směna drží typ se stejným názvem, nebo se stejnými časy.
      const t = fitting.find(x => !obsazeno.has(x.id) && (norm(x.name) === norm(s.type)
        || (casyTypu(x, oh).start === s.startTime && casyTypu(x, oh).end === s.endTime)));
      if (t) { obsazeno.set(t.id, s.employeeId); ulozenoTypy.add(t.id); }
    }
    const trzbaDne = vstup.trzby ? vstup.trzby.dny[String(wd)] : undefined;
    const lidi = vstup.trzby ? lidiPodleTrzby(trzbaDne?.prumer, vstup.trzby.prah) : null;
    dny.push({ date, wd, den, oh, open, fitting, oteviraci: oteviraciTypy(fitting, oh), obsazeno, ulozenoTypy, dnesStoji, ulozeneDne, trzbaDne, lidi });
  }

  /** Rozhodovací pomocníci nad jedním dnem (stav dne je v `D`). */
  const nastroje = (D: Den) => {
    const { date, oh, open, fitting, oteviraci, obsazeno, dnesStoji, ulozeneDne, ulozenoTypy } = D;
    const hodinyTypu = (st: TypSmeny) => { const r = casyTypu(st, oh); return hodinySmeny(r.start, r.end); };
    const mozne = (e: Stav, st: TypSmeny) => {
      const r = casyTypu(st, oh);
      return dostupny(e, date) && !dnesStoji.has(e.id) && kapacita(e)
        && odpocinekOk(e, date) && hodinyOk(e, hodinySmeny(r.start, r.end)) && prefOk(e, date, st, r.start);
    };
    const poradi = (st: TypSmeny) => (a: Stav, b: Stav) => {
      const cat = kategorie(String(st.start_time));
      // 0. spravedlivé střídání: kdo má zatím méně směn, jde první.
      if (balanceShifts && a.assigned !== b.assigned) return a.assigned - b.assigned;
      // 1. denní volba přesně na tuhle kategorii
      const ad = a.dayPrefs[date] === cat ? 1 : 0, bd = b.dayPrefs[date] === cat ? 1 : 0;
      if (ad !== bd) return bd - ad;
      // 2. obecná preference
      const ap = a.preferredShift === cat ? 1 : 0, bp = b.preferredShift === cat ? 1 : 0;
      if (ap !== bp) return bp - ap;
      // 3. kratší řada dní v kuse
      const ar = rada(a, date), br = rada(b, date);
      if (ar !== br) return ar - br;
      // 4. méně směn, 5. déle bez směny, 6. jméno
      if (a.assigned !== b.assigned) return a.assigned - b.assigned;
      if (a.lastAssigned !== b.lastAssigned) return a.lastAssigned < b.lastAssigned ? -1 : 1;
      return a.name.localeCompare(b.name, 'cs');
    };
    const intervalyUlozenych = () => ulozeneDne.map(s => ({ start: s.startTime, end: s.endTime }));
    const pokryto = () => [
      ...fitting.filter(s => obsazeno.has(s.id) && !ulozenoTypy.has(s.id)).map(s => casyTypu(s, oh)),
      ...intervalyUlozenych(),
    ];
    const zisk = (st: TypSmeny) => {
      if (!open) return 0;
      const pred = uncovered(open, pokryto()).reduce((n, g) => n + g.end - g.start, 0);
      const po = uncovered(open, [...pokryto(), casyTypu(st, oh)]).reduce((n, g) => n + g.end - g.start, 0);
      return pred - po;
    };
    const serad = (list: TypSmeny[]) => list.sort((a, b) => {
      const za = zisk(a), zb = zisk(b);
      if (za !== zb) return zb - za;                    // víc pokryje = dřív
      const ha = hodinyTypu(a), hb = hodinyTypu(b);
      if (ha !== hb) return hb - ha;                    // pak delší
      return String(a.name).localeCompare(String(b.name), 'cs');
    });
    const obsad = (st: TypSmeny, zbyle: TypSmeny[], otevrenoJe: boolean) => {
      const kandidati = lide.filter(e => mozne(e, st)).sort(poradi(st));
      const vyhled = zbyle.filter(s => s.id !== st.id && !obsazeno.has(s.id)).map(s => ({
        kandidati: lide.filter(e => mozne(e, s)).map(e => e.id),
        povinna: !otevrenoJe && oteviraci.has(s.id),
      }));
      const pick = vyberKandidata(kandidati, vyhled);
      if (!pick) return false;
      obsazeno.set(st.id, pick.id); dnesStoji.add(pick.id); vezmi(pick, date, hodinyTypu(st));
      return true;
    };
    // Otevřeno = obsazená otevírací směna, nebo uložená směna od otevření.
    const otevreno = () => fitting.some(s => oteviraci.has(s.id) && obsazeno.has(s.id))
      || (open != null && ulozeneDne.length > 0 && !uncovered(open, intervalyUlozenych()).some(g => urovenDiry(open, g) === 'povinna'));
    /** Pokryje už obsazené celou otevírací dobu? (Podmínka „stačí jeden".) */
    const plnePokryto = () => open != null && uncovered(open, pokryto()).length === 0;
    return { hodinyTypu, mozne, serad, obsad, otevreno, plnePokryto };
  };

  // ---- Průchod 1: CELÝ MĚSÍC — pevné dny a povinné otevírací směny ----------
  for (const D of dny) {
    const { date, oh, den, fitting, oteviraci, obsazeno, dnesStoji } = D;
    const { hodinyTypu, mozne, serad, obsad, otevreno } = nastroje(D);
    const pevneDnes = pevnePoDnech.get(D.wd) ?? [];

    // Pass 1a: pevné dny vázané na typ — výslovné rozhodnutí vedení, jdou první.
    for (const fx of pevneDnes) {
      if (fx.shiftTypeId == null) continue;
      const st = fitting.find(s => s.id === fx.shiftTypeId);
      if (!st || obsazeno.has(st.id)) continue;
      const emp = podleId.get(fx.employeeId);
      if (!emp || !dostupny(emp, date) || dnesStoji.has(emp.id)) continue;
      const h = hodinyTypu(st);
      if (!prefOk(emp, date, st, casyTypu(st, oh).start)) {
        warnings.push(`${den} — ${emp.name} má pevný den, ale na ten den si zadal/a ${prefText(emp, date)}. Vynecháno.`);
        continue;
      }
      if (!odpocinekOk(emp, date)) {
        warnings.push(`${den} — ${emp.name} má pevný den, ale už by šlo o ${emp.maxConsecutive! + 1}. směnu v řadě (limit ${emp.maxConsecutive}). Vynecháno.`);
        continue;
      }
      if (!hodinyOk(emp, h)) {
        warnings.push(`${den} — ${emp.name} má pevný den, ale směna by překročila limit ${emp.maxHours} h/měsíc. Vynecháno.`);
        continue;
      }
      obsazeno.set(st.id, emp.id); dnesStoji.add(emp.id); vezmi(emp, date, h);
    }

    // Pass 1b: pevné dny bez typu — přednost má jeho preference, pak
    // otevírací směna (je povinná), pak první volná. Výjimka: když by
    // preference vzala otvíračku jedinému, kdo ji ten den může dát, dostane
    // pevný člověk otvíračku — povinná směna má přednost před přáním.
    for (const fx of pevneDnes) {
      if (fx.shiftTypeId != null) continue;
      const emp = podleId.get(fx.employeeId);
      if (!emp || !dostupny(emp, date) || dnesStoji.has(emp.id)) continue;
      const chce = emp.dayPrefs[date] && emp.dayPrefs[date] !== 'flexible' ? emp.dayPrefs[date] : emp.preferredShift;
      const volne = fitting.filter(s => !obsazeno.has(s.id) && prefOk(emp, date, s, casyTypu(s, oh).start));
      if (volne.length === 0) continue;
      if (!odpocinekOk(emp, date)) {
        warnings.push(`${den} — ${emp.name} má pevný den, ale už by šlo o ${emp.maxConsecutive! + 1}. směnu v řadě (limit ${emp.maxConsecutive}). Vynecháno.`);
        continue;
      }
      const oteviraciVolne = otevreno() ? [] : volne.filter(s => oteviraci.has(s.id));
      const preferovana = volne.find(s => chce?.startsWith('type:') ? `type:${s.id}` === chce : kategorie(String(s.start_time)) === chce);
      let st = preferovana ?? oteviraciVolne[0] ?? volne[0];
      if (oteviraciVolne.length > 0 && !oteviraci.has(st.id)
        && !lide.some(o => o.id !== emp.id && oteviraciVolne.some(t => mozne(o, t)))) {
        st = serad([...oteviraciVolne])[0];
        warnings.push(`${den} — ${emp.name} má pevný den a chtěl/a by „${(preferovana ?? volne[0]).name}", ale nikdo jiný ten den neotevře — dostal/a otevírací směnu „${st.name}".`);
      }
      const h = hodinyTypu(st);
      if (!hodinyOk(emp, h)) {
        warnings.push(`${den} — ${emp.name} má pevný den, ale směna by překročila limit ${emp.maxHours} h/měsíc. Vynecháno.`);
        continue;
      }
      obsazeno.set(st.id, emp.id); dnesStoji.add(emp.id); vezmi(emp, date, h);
    }

    // Pass 2: OTEVÍRACÍ směna — povinná, jde před všemi ostatními. Stačí
    // obsadit jednu z otevíracích; vezme se ta, která pokryje nejvíc dne
    // (typ od otevření do zavření tedy před kratší otvíračkou — to je
    // i podmínka, aby „stačí jeden" podle tržeb znamenalo celý den). Výhled
    // chrání jediného kandidáta druhé směny téhož dne.
    if (!otevreno()) {
      const kandidatske = serad(fitting.filter(s => oteviraci.has(s.id) && !obsazeno.has(s.id)));
      for (const st of kandidatske) {
        if (obsad(st, fitting.filter(s => !oteviraci.has(s.id)), false)) break;
      }
    }
  }

  // ---- Průchod 2: celý měsíc — žádoucí směny ze zbylé kapacity -------------
  let dnuJedenNepokryje = 0;
  for (const D of dny) {
    const { date, oh, den, open, fitting, oteviraci, obsazeno, dnesStoji, ulozeneDne, ulozenoTypy, trzbaDne, lidi } = D;
    const { hodinyTypu, mozne, serad, obsad, otevreno, plnePokryto } = nastroje(D);
    const jedenStaci = lidi === 1;

    // Pass 3: ŽÁDOUCÍ směny — jen když je kdo a když se to podle tržeb
    // vyplatí. „Stačí jeden" platí, jen když otevírací směna sama pokryje
    // celou otevírací dobu; druhá se pak ani nezkouší a spočítá se jen, kolik
    // hodin to ušetřilo (když by se ji obsadit dalo). Jinak by „jeden"
    // znamenal zavřít v půli dne — to se neušetří, to se zavře.
    const zbyvajici = fitting.filter(s => !obsazeno.has(s.id));
    const vynechanePodleTrzeb = new Set<number>();
    if (jedenStaci && otevreno() && plnePokryto()) {
      let uspora = 0;
      for (const st of zbyvajici) {
        vynechanePodleTrzeb.add(st.id);
        if (uspora === 0 && lide.some(e => mozne(e, st))) uspora = hodinyTypu(st);
      }
      usporaDoporucenim += uspora;
      doporuceni.push({ date, lidi: 1, trzba: trzbaDne!.prumer, vzorek: trzbaDne!.vzorek, usporaHodin: uspora });
    } else {
      if (lidi === 2) doporuceni.push({ date, lidi: 2, trzba: trzbaDne!.prumer, vzorek: trzbaDne!.vzorek, usporaHodin: 0 });
      else if (jedenStaci) {
        const nepokryje = otevreno();
        if (nepokryje) dnuJedenNepokryje++;
        doporuceni.push({ date, lidi: 1, trzba: trzbaDne!.prumer, vzorek: trzbaDne!.vzorek, usporaHodin: 0, ...(nepokryje ? { nepokryjeJeden: true } : {}) });
      }
      const cekajici = [...zbyvajici];
      while (cekajici.length > 0) {
        serad(cekajici);
        const st = cekajici.shift()!;
        if (obsazeno.has(st.id)) continue;
        obsad(st, cekajici, true);
      }
    }

    // Seznam návrhu + upozornění dne. Typy držené uloženou směnou se
    // nenavrhují znovu (ani nehlásí jako neobsazené).
    const otevrel = otevreno();
    for (const st of fitting) {
      if (vynechanePodleTrzeb.has(st.id) || ulozenoTypy.has(st.id)) continue;
      const empId = obsazeno.get(st.id);
      const r = casyTypu(st, oh);
      const h = hodinySmeny(r.start, r.end);
      const jeOteviraci = oteviraci.has(st.id);
      // Otevírací typ je povinný, jen dokud podnik nikdo neotvírá.
      const povinna = jeOteviraci && !otevrel;
      if (empId == null) {
        // Nikdo nevezme celou: se zapnutým dělením půlky dvěma různým lidem.
        if (splitShifts && h >= 3) {
          const s0 = toMinutes(r.start)!, e0 = toMinutes(r.end)!;
          const e1 = e0 <= s0 ? e0 + 1440 : e0;
          const mid = Math.round((s0 + e1) / 2 / 30) * 30;
          const pulky = [
            { start: hm(s0), end: hm(mid), startMin: s0, endMin: mid },
            { start: hm(mid), end: hm(e1), startMin: mid, endMin: e1 },
          ];
          const pulkaOk = (e: Stav, p: { startMin: number; endMin: number; start: string }) => {
            if (prefOk(e, date, st, p.start)) return true;
            // „jen <typ>" pustí i půlku, se kterou se okno toho typu překrývá.
            const m = /^type:(\d+)$/.exec(String(e.dayPrefs[date] ?? ''));
            const t = m ? typy.find(x => Number(x.id) === parseInt(m[1])) : undefined;
            if (!t) return false;
            const rt = casyTypu(t, oh);
            const ts = toMinutes(rt.start)!, te0 = toMinutes(rt.end)!;
            const te = te0 <= ts ? te0 + 1440 : te0;
            return ts < p.endMin && p.startMin < te;
          };
          const picks: (Stav | null)[] = [null, null];
          for (let i = 0; i < 2; i++) {
            const p = pulky[i];
            const ph = (p.endMin - p.startMin) / 60;
            const c = lide.filter(e => dostupny(e, date) && !dnesStoji.has(e.id) && kapacita(e)
              && odpocinekOk(e, date) && hodinyOk(e, ph) && pulkaOk(e, p) && e.splitOk !== false && picks[0]?.id !== e.id);
            c.sort((a, b) => a.assigned - b.assigned || a.name.localeCompare(b.name, 'cs'));
            picks[i] = c[0] ?? null;
          }
          if (picks[0] && picks[1]) {
            for (let i = 0; i < 2; i++) {
              const p = pulky[i], who = picks[i]!;
              dnesStoji.add(who.id);
              vezmi(who, date, (p.endMin - p.startMin) / 60);
              proposed.push({
                employeeId: who.id, employeeName: who.name, employeeAvatar: who.avatar ?? '👤',
                date, startTime: p.start, endTime: p.end,
                type: st.name, shiftTypeId: st.id, shiftTypeName: st.name, color: st.color, split: true,
                ...(jeOteviraci && i === 0 ? { oteviraci: true } : {}),
              });
            }
            warnings.push(`${den} — směna „${st.name}" rozdělena: ${picks[0]!.name} (${pulky[0].start}–${pulky[0].end}) + ${picks[1]!.name} (${pulky[1].start}–${pulky[1].end}).`);
            continue;
          }
        }

        const volni = lide.filter(e => dostupny(e, date) && !dnesStoji.has(e.id) && kapacita(e));
        const pref = volni.some(e => !prefOk(e, date, st, r.start));
        const odp = volni.some(e => prefOk(e, date, st, r.start) && !odpocinekOk(e, date));
        const hod = volni.some(e => prefOk(e, date, st, r.start) && odpocinekOk(e, date) && !hodinyOk(e, h));
        const proc = odp ? 'volní lidé už mají limit dní v řadě'
          : hod ? 'volní lidé už mají limit hodin za měsíc'
          : pref ? 'volní lidé mají ten den povolený jen jiný typ směny'
          : 'nikdo dostupný';
        if (povinna) {
          warnings.unshift(`${den} — otevírací směna „${st.name}" neobsazená (${proc}) — podnik se ten den neotevře.`);
        } else {
          warnings.push(`${den} — ${otevrel ? 'druhá ' : ''}směna „${st.name}" neobsazená (${proc})${otevrel ? ` — otevře se ${dnesStoji.size <= 1 ? 's jedním člověkem' : 'bez ní'}` : ''}.`);
        }
        understaffed.push({ date, shiftTypeName: st.name, uroven: povinna ? 'povinna' : 'zadouci' });
        continue;
      }
      const emp = podleId.get(empId)!;
      proposed.push({
        employeeId: emp.id, employeeName: emp.name, employeeAvatar: emp.avatar ?? '👤',
        date, startTime: r.start, endTime: r.end,
        type: st.name, // uložený název typu, ať kalendář ukáže, co to je
        shiftTypeId: st.id, shiftTypeName: st.name, color: st.color,
        ...(jeOteviraci ? { oteviraci: true } : {}),
      });
    }

    kontrolaPokryti(date, den, open, [
      ...proposed.filter(p => p.date === date).map(p => ({ start: p.startTime, end: p.endTime })),
      ...ulozeneDne.map(s => ({ start: s.startTime, end: s.endTime })),
    ]);
  }

  if (dnuJedenNepokryje > 0) {
    const dnu = dnuJedenNepokryje === 1 ? '1 den' : dnuJedenNepokryje < 5 ? `${dnuJedenNepokryje} dny` : `${dnuJedenNepokryje} dní`;
    warnings.push(`Podle tržeb by ${dnu} stačil jeden člověk, ale otevírací směna nepokryje celou otevírací dobu — generátor proto doplnil druhou. Na jednoho člověka přidej typ směny od otevření do zavření.`);
  }

  const celkem = Math.round(proposed.reduce((n, p) => n + hodinySmeny(p.startTime, p.endTime), 0) * 10) / 10;
  return {
    proposed, warnings, gaps, understaffed,
    ...(vstup.trzby ? { doporuceni } : {}),
    hodiny: { celkem, usporaDoporucenim: Math.round(usporaDoporucenim * 10) / 10 },
  };
}
