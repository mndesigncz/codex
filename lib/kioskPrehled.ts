// Tablet za barem — čistá logika pro KioskApp a KioskShiftGate (kolo 6, balík B4).
//
// Bez Reactu a bez fetch, ať to hlídá `npm test` (scripts/testy/k81-kiosk.ts) a ať
// komponenty jen kreslí. Co tu je a proč:
//
//  - záložky tabletu s klíčem oprávnění: role tabletu bez `sklad.zobrazit` dřív
//    záložku Sklad viděla a dostala 403 až po klepnutí;
//  - rozdělení rosteru na „Dnes na rozpisu" / „Ostatní": u dvanácti lidí v mřížce
//    se jméno z dnešního rozpisu hledalo mezi vedením a brigádníky z jiných dnů;
//  - zpoždění příchodu proti rozpisu (práh 10 min je stejný jako na serveru,
//    app/api/attendance/route.ts) a „po plánu" u běžící směny;
//  - počty do odznaků záložek Úkoly a Postupy — totéž, co ukazují widgety
//    ukoly.dnes / ukoly.po_terminu a postupy.povinne_dnes, ne nový výpočet.
//
// Relativní importy s příponou: `npm test` pouští .ts přímo v Node.

import { konecSmeny, hodinyMinuty } from './dochazkaPrehled.ts';
import { dayPlus, pragueMomentOf, parseDbTime, dbTimeHM, pragueDayOf } from './pragueTime.ts';
import { obsahuje } from './hledani.ts';
import { stavUkolu } from './ukolyFiltr.ts';
import type { Ukol } from './ukolyPrehled.ts';
import { povinneDnes, type PostupApi, type PrubehApi } from './postupyPrehled.ts';
import { stavZasoby, type PolozkaSkladu, type StavZasoby } from './skladPrehled.ts';
import { rozborSkladArg } from './skladPredani.ts';

// ---------------------------------------------------------------------------
// Záložky tabletu
// ---------------------------------------------------------------------------

export interface ZalozkaTabletu {
  id: string;
  icon: string;
  /** Oprávnění, bez kterého záložka na tabletu není. Směna klíč nemá — tam se píchá. */
  klic?: string;
}

/** Záložky v pořadí, jak jdou v pásu nahoře. Klíče jsou z KIOSK_BILA_LISTINA (lib/opravneni.ts). */
export const ZALOZKY_TABLETU = [
  { id: 'shift',      icon: 'clock' },
  { id: 'tasks',      icon: 'check',     klic: 'ukoly.zobrazit_tym' },
  { id: 'procedures', icon: 'clipboard', klic: 'postupy.zobrazit' },
  { id: 'inventory',  icon: 'box',       klic: 'sklad.zobrazit' },
  { id: 'orders',     icon: 'cup',       klic: 'objednavky.zobrazit' },
  { id: 'closing',    icon: 'trend',     klic: 'uzaverky.vytvorit' },
  { id: 'guides',     icon: 'book',      klic: 'navody.zobrazit' },
] as const satisfies readonly ZalozkaTabletu[];

export type IdZalozkyTabletu = (typeof ZALOZKY_TABLETU)[number]['id'];

/** Záložky, na které role tabletu má. `smi` je useSmi() — před načtením oprávnění vrací ne (při chybě načtení ano). */
export function viditelneZalozky<T extends ZalozkaTabletu>(zalozky: readonly T[], smi: (klic: string) => boolean): T[] {
  return zalozky.filter(z => !z.klic || smi(z.klic));
}

/** Aktivní záložka po zúžení: když ta vybraná zmizela, tablet se vrátí na Směnu. */
export function zalozkaPoOmezeni<T extends ZalozkaTabletu>(aktivni: string, viditelne: readonly T[]): T['id'] | 'shift' {
  return viditelne.some(z => z.id === aktivni) ? (aktivni as T['id']) : 'shift';
}

// ---------------------------------------------------------------------------
// Výběr osoby
// ---------------------------------------------------------------------------

export interface ClenProVyber {
  id: number;
  name: string;
  shiftStart?: string | null;
}

/** Od kolika lidí má mřížka výběru hledací pole. */
export const PRAH_HLEDANI_ROSTERU = 9;

const hhmm = (v: string | null | undefined) => String(v ?? '').slice(0, 5);

/**
 * „Dnes na rozpisu" (podle začátku směny, pak jména) a „Ostatní" (abecedně,
 * česky). Vedení bez směny skončí až v Ostatních — u baru hledá sebe
 * brigádník, který dnes nastupuje, ne majitel.
 */
export function rozdelRoster<T extends ClenProVyber>(members: readonly T[]): { naRozpisu: T[]; ostatni: T[] } {
  const jmeno = (a: T, b: T) => a.name.localeCompare(b.name, 'cs');
  const naRozpisu = members.filter(m => !!m.shiftStart).sort((a, b) => hhmm(a.shiftStart).localeCompare(hhmm(b.shiftStart)) || jmeno(a, b));
  const ostatni = members.filter(m => !m.shiftStart).sort(jmeno);
  return { naRozpisu, ostatni };
}

/** Jména odpovídající dotazu (bez diakritiky, lib/hledani). Prázdný dotaz = všichni. */
export function hledejVRosteru<T extends ClenProVyber>(members: readonly T[], dotaz: string): T[] {
  return members.filter(m => obsahuje(m.name, dotaz));
}

// ---------------------------------------------------------------------------
// Plán proti skutečnosti
// ---------------------------------------------------------------------------

/** Po tolika minutách od plánovaného začátku je příchod pozdní (shodné se serverem). */
export const PRAH_POZDE_MIN = 10;
/** „Směna začíná za…" se ukazuje nejvýš tolik před začátkem. */
export const BRZY_MAX_MS = 3 * 3600_000;
/** Dál od plánovaného začátku se nic netvrdí — to už není dnešní směna. */
export const MAX_ODCHYLKA_MS = 12 * 3600_000;

export type ZpozdeniPrichodu = { druh: 'pozde'; min: number } | { druh: 'brzy'; min: number };

/**
 * Jak příchod sedí na dnešní rozpis. `dnes` je pražský den, `shiftStart` „HH:MM[:SS]".
 * Začátek se zkouší dnes, včera i zítra (směna přes půlnoc: ve 0:30 patří k 22:00
 * včera) a bere se ten nejbližší; dál než 12 h se nekreslí nic.
 */
export function zpozdeniPrichodu(dnes: string, shiftStart: string | null | undefined, ted: number): ZpozdeniPrichodu | null {
  if (!shiftStart || !ted) return null;
  let rozdil: number | null = null;
  for (const den of [dnes, dayPlus(dnes, -1), dayPlus(dnes, 1)]) {
    const z = pragueMomentOf(den, hhmm(shiftStart));
    if (!z) continue;
    const r = ted - z.getTime();
    if (rozdil == null || Math.abs(r) < Math.abs(rozdil)) rozdil = r;
  }
  if (rozdil == null || Math.abs(rozdil) > MAX_ODCHYLKA_MS) return null;
  const min = Math.round(Math.abs(rozdil) / 60000);
  if (rozdil > 0) return min > PRAH_POZDE_MIN ? { druh: 'pozde', min } : null;
  return rozdil < 0 && -rozdil <= BRZY_MAX_MS && min > 0 ? { druh: 'brzy', min } : null;
}

/**
 * O kolik minut běží směna po plánovaném konci (konecSmeny umí půlnoc); null,
 * když rozpis není nebo konec ještě nenastal.
 */
export function minutPoPlanu(dnes: string, shiftStart: string | null | undefined, shiftEnd: string | null | undefined, ted: number): number | null {
  if (!ted) return null;
  const konec = konecSmeny(dnes, shiftStart, shiftEnd);
  if (!konec || ted <= konec.getTime()) return null;
  return Math.floor((ted - konec.getTime()) / 60000);
}

// ---------------------------------------------------------------------------
// Počty do odznaků záložek
// ---------------------------------------------------------------------------

/** Nesplněné úkoly po termínu a s dnešním termínem (stejné rozdělení jako filtr Úkolů). */
export function pocetUkoluTabletu(ukoly: readonly Ukol[], dnes: string): number {
  return ukoly.filter(u => { const s = stavUkolu(u, dnes, dnes); return s === 'po_terminu' || s === 'dnes'; }).length;
}

/** Povinné postupy před uzávěrkou, které dnes ještě nikdo nedokončil (jako widget postupy.povinne_dnes). */
export function pocetPostupuTabletu(postupy: readonly PostupApi[], dnesniBehy: readonly PrubehApi[]): number {
  return povinneDnes(postupy, dnesniBehy).filter(p => !p.hotovo).length;
}

// ---------------------------------------------------------------------------
// Souhrn směny po odchodu (kolo 7, R7-7)
// ---------------------------------------------------------------------------

/** Co tablet ukáže v okně „díky za směnu" po odpíchnutí odchodu. */
export interface SouhrnOdchodu {
  /** Pražské „HH:MM" příchodu a odchodu (dbTimeHM — podle formátu času podniku). */
  prichod: string;
  odchod: string;
  /** „7 h 32 min" (hodinyMinuty, stejně jako řádek „Kdo teď pracuje"). */
  odpracovano: string;
  /** Délka v ms. */
  ms: number;
  /** Odchod připadl na jiný pražský den než příchod (noční směna). */
  presPulnoc: boolean;
  /** Server řekl, že uzávěrka za tuhle směnu ještě není (closingDone === false). */
  chybiUzaverka: boolean;
  /** Pauzy směny v minutách (0 = bez pauzy) — odpracováno je bez nich. */
  pauzaMin: number;
}

/**
 * Souhrn z odpovědi POST /api/attendance (action=out vrací entry s clockIn/clockOut
 * a closingDone). Čas z databáze přes parseDbTime — stejně jako stopky elapsed();
 * přes půlnoc se počítá z celých časových razítek, takže 22:10 → 2:05 je 3 h 55 min.
 * Nečitelný nebo obrácený záznam → null (tablet pak souhrn nekreslí, nevymýšlí ho).
 * `closingDone` chybí (starší server) → uzávěrka se nehlásí jako chybějící.
 */
export function souhrnOdchodu(
  entry: { clockIn?: string | Date | null; clockOut?: string | Date | null; shiftStart?: string | Date | null; breakMs?: number | null } | null | undefined,
  closingDone?: boolean | null,
): SouhrnOdchodu | null {
  // Odchod po pauze zavírá záznam po pauze; server přibalí začátek směny (první příchod) a skončené pauzy,
  // ať souhrn není jen za odpoledne („12:30–16:00") — směna s pauzou je jedna směna.
  const od = parseDbTime(entry?.shiftStart ?? null) ?? parseDbTime(entry?.clockIn ?? null);
  const kdy = parseDbTime(entry?.clockOut ?? null);
  if (!od || !kdy) return null;
  const pauzy = Math.max(0, Number(entry?.breakMs) || 0);
  const ms = kdy.getTime() - od.getTime() - pauzy;
  if (ms < 0) return null;
  return {
    prichod: dbTimeHM(od),
    odchod: dbTimeHM(kdy),
    odpracovano: hodinyMinuty(ms),
    ms,
    presPulnoc: pragueDayOf(od) !== pragueDayOf(kdy),
    chybiUzaverka: closingDone === false,
    pauzaMin: Math.round(pauzy / 60_000),
  };
}

/** Po kolika sekundách se okno souhrnu na sdíleném tabletu zavře samo (dotyk odpočet zastaví). */
export const SOUHRN_ZAVRIT_S = 20;

// ---------------------------------------------------------------------------
// Sklad na tabletu: filtr Dochází / Kriticky, řazení a minimum (kolo 7, R7-7)
// ---------------------------------------------------------------------------

/** Filtr stavu nad kategoriemi: Vše · Dochází (pod minimem, i kriticky) · Kriticky. */
export type FiltrStavuSkladu = 'vse' | 'dochazi' | 'kriticky';

type PolozkaTabletu = Pick<PolozkaSkladu, 'name' | 'quantity' | 'minQuantity' | 'criticalQuantity' | 'status' | 'archived'> & { category?: string | null };

/** Stav zásoby — týž výpočet jako widgety a nástroj Skladu (lib/skladPrehled stavZasoby), ne vlastní kopie. */
export const stavPolozkyTabletu = (p: PolozkaTabletu): StavZasoby => stavZasoby(p as PolozkaSkladu);

const sediStav = (st: StavZasoby, f: FiltrStavuSkladu) => f === 'vse' || (f === 'kriticky' ? st === 'critical' : st !== 'ok');

/**
 * Počty do Segmented „Dochází (n) · Kriticky (n)". Jen položky, které podnik vede —
 * „nevedeme" (archived) by Dochází nafoukly o věci, které nikdo nedoplní.
 * Dochází zahrnuje i kriticky (jako „Jen co dochází" ve Skladu vedení).
 */
export function pocetStavuSkladu(polozky: readonly PolozkaTabletu[]): { dochazi: number; kriticky: number } {
  let dochazi = 0, kriticky = 0;
  for (const p of polozky) {
    if (p.archived === true) continue;
    const st = stavPolozkyTabletu(p);
    if (st !== 'ok') dochazi++;
    if (st === 'critical') kriticky++;
  }
  return { dochazi, kriticky };
}

const PORADI_STAVU: Record<StavZasoby, number> = { critical: 0, low: 1, ok: 2 };

/** Řazení seznamu tabletu: kriticky › dochází › v pořádku, pak název (česky). */
export function seradSkladTabletu<T extends PolozkaTabletu>(polozky: readonly T[]): T[] {
  return [...polozky].sort((a, b) => PORADI_STAVU[stavPolozkyTabletu(a)] - PORADI_STAVU[stavPolozkyTabletu(b)] || String(a.name).localeCompare(String(b.name), 'cs'));
}

/**
 * Seznam skladu na tabletu: odložené („nevedeme") zvlášť, filtr stavu, kategorie
 * a hledání (bez diakritiky), seřazené podle stavu a názvu.
 */
export function filtrujSkladTabletu<T extends PolozkaTabletu>(polozky: readonly T[], f: {
  nevedeme: boolean; stav: FiltrStavuSkladu; kategorie: string | null; hledani: string;
}): T[] {
  return seradSkladTabletu(polozky.filter(p =>
    (f.nevedeme ? p.archived === true : p.archived !== true)
    && (f.nevedeme || sediStav(stavPolozkyTabletu(p), f.stav))
    && (f.kategorie == null || p.category === f.kategorie)
    && obsahuje(p.name, f.hledani)));
}

/** Zaokrouhlí množství na rozumné desetiny (0,5 bal., ne 0,49999). */
const mnozstvi = (n: number) => Math.round(n * 100) / 100;

/**
 * Minimum a kolik chybí pro meta řádku: „min 2 ks · chybí 1". Minimum jen když je
 * nastavené (min > 0 — položka bez minima má 0); „chybí" jen u dochází/kriticky
 * a jen když je kladné (stav podle balení může hlásit dochází i nad holým minimem).
 */
export function minimumPolozky(p: PolozkaTabletu): { min: number | null; chybi: number | null } {
  const min = Number(p.minQuantity);
  if (!Number.isFinite(min) || min <= 0) return { min: null, chybi: null };
  const st = stavPolozkyTabletu(p);
  const rozdil = mnozstvi(min - (Number(p.quantity) || 0));
  return { min: mnozstvi(min), chybi: st !== 'ok' && rozdil > 0 ? rozdil : null };
}

/**
 * Proklik z widgetu (Docházející zásoby → `stav:dochazi|Nápoje`) → výchozí filtr Skladu
 * na tabletu. Tvar argumentu čte lib/skladPredani (rozborSkladArg) — stejně jako Sklad vedení.
 */
export function filtrZeSkladArg(arg: string | null | undefined): { stav: FiltrStavuSkladu; kategorie: string | null } {
  const r = rozborSkladArg(arg);
  return { stav: r.jenDochazi ? 'dochazi' : 'vse', kategorie: r.kategorie ?? null };
}
