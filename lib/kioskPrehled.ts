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

import { konecSmeny } from './dochazkaPrehled.ts';
import { dayPlus, pragueMomentOf } from './pragueTime.ts';
import { obsahuje } from './hledani.ts';
import { stavUkolu } from './ukolyFiltr.ts';
import type { Ukol } from './ukolyPrehled.ts';
import { povinneDnes, type PostupApi, type PrubehApi } from './postupyPrehled.ts';

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
