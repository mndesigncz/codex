// „Navíc" pro vedení (kolo 9, balík V) — čistá logika bez Reactu a bez DB.
//
// Co tu je: filtr seznamu týmu (stav, člověk), lidé ze zápisů pro výběr, krokovač
// bodů v okně Uznat, měsíc z nastavení widgetu, stav položky nabídky pro správu
// a sloučení čekajících s měsícem. Testy: scripts/testy/k85-navic-ved.ts. Soubor
// se importuje relativně s příponou (běží i v Node bez `@/`).
import { MAX_BODU, nabidkaPlatna, seradNavic, type NabidkaNavic, type Navic, type StavNavic } from '../../lib/navic.ts';

/** Filtr stavu v širokém widgetu: jeden stav, nebo vše. */
export type FiltrStavu = StavNavic | 'vse';
export const FILTRY_STAVU: readonly FiltrStavu[] = ['ceka', 'uznano', 'odmitnuto', 'vse'];
export const jeFiltrStavu = (x: unknown): x is FiltrStavu => typeof x === 'string' && (FILTRY_STAVU as readonly string[]).includes(x);

/** Klíč sessionStorage a událost, kterými se Odměnám říká „otevři část Navíc" (jako KLIC_KALENDAR u Nehodnocených směn). */
export const KLIC_CAST_NAVIC = 'managero-odmeny-navic';
export const UDALOST_CAST_NAVIC = 'odmeny:navic';
/** Argument pohledu rewards z oznámení a z hledání (`?view=rewards&arg=navic`). */
export const ARG_NAVIC = 'navic';

/** Krok bodů v okně Uznat (tlačítka −/+). */
export const KROK_BODU = 5;

/** Zápisy podle stavu a člověka; `vse` a `null` = bez filtru. */
export function filtrujNavic(items: readonly Navic[], f: { stav?: FiltrStavu; clovek?: number | null }): Navic[] {
  return items.filter(z => (!f.stav || f.stav === 'vse' || z.status === f.stav) && (f.clovek == null || z.userId === f.clovek));
}

/** Lidé, kteří mají v seznamu zápis — pro výběr „Člověk" (podle jména, každý jednou). */
export function lideZeZapisu(items: readonly Navic[]): { id: number; jmeno: string; avatar: string | null }[] {
  const mapa = new Map<number, { id: number; jmeno: string; avatar: string | null }>();
  for (const z of items) if (!mapa.has(z.userId)) mapa.set(z.userId, { id: z.userId, jmeno: z.userName, avatar: z.userAvatar });
  return [...mapa.values()].sort((a, b) => a.jmeno.localeCompare(b.jmeno, 'cs'));
}

/** Kolik zápisů je v každém stavu (počty do přepínače Čeká / Uznané / Odmítnuté / Vše). */
export function poctyStavu(items: readonly Navic[]): Record<FiltrStavu, number> {
  const p: Record<FiltrStavu, number> = { ceka: 0, uznano: 0, odmitnuto: 0, vse: items.length };
  for (const z of items) p[z.status]++;
  return p;
}

/** Krok bodů: ±5 od aktuální hodnoty, v mezích 0–MAX_BODU; nečíslo se bere jako 0. */
export function krokBodu(aktualni: unknown, smer: 1 | -1): number {
  const n = Number(aktualni);
  const z = Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(MAX_BODU, z + smer * KROK_BODU));
}

/** Měsíc RRRR-MM z nastavení widgetu (`obdobi`: tento / minuly) vůči dnešku. */
export function mesicZNastaveni(obdobi: unknown, dnes: string): string {
  const tento = dnes.slice(0, 7);
  if (obdobi !== 'minuly') return tento;
  const [y, m] = tento.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Seznam widgetu: zápisy vybraného měsíce a k nim VŠECHNY čekající (i ze starších dnů —
 * čekající z 30. 9. nesmí v říjnu zmizet jen proto, že se dívá na „tento měsíc"). Každý
 * zápis jednou, čekající první (seradNavic).
 */
export function sloucCekajici(mesicni: readonly Navic[], cekajici: readonly Navic[]): Navic[] {
  const mapa = new Map<number, Navic>();
  for (const z of cekajici) mapa.set(z.id, z);
  for (const z of mesicni) if (!mapa.has(z.id)) mapa.set(z.id, z);
  return seradNavic([...mapa.values()]);
}

/** Stav položky nabídky pro správce: platí dnes, vypnutá, prošlá, nebo začne až později. */
export type StavNabidky = 'plati' | 'vypnuta' | 'prosla' | 'zacne';
export function stavNabidky(n: Pick<NabidkaNavic, 'active' | 'validFrom' | 'validTo'>, dnes: string): StavNabidky {
  if (!n.active) return 'vypnuta';
  if (n.validTo && n.validTo < dnes) return 'prosla';
  if (n.validFrom && n.validFrom > dnes) return 'zacne';
  return nabidkaPlatna(n, dnes) ? 'plati' : 'vypnuta';
}

/** Tělo PATCH pro uznání: body vždy číslo (0 = bez odměny), prémie jen kladná, poznámka jen neprázdná. */
export function teloUznani(body: unknown, premie: unknown, poznamka: string): { status: 'uznano'; points: number; bonusCzk: number | null; note?: string } {
  const b = Number(body);
  const p = Number(premie);
  const pozn = poznamka.trim();
  return { status: 'uznano', points: Number.isFinite(b) ? Math.round(b) : 0, bonusCzk: Number.isFinite(p) && p > 0 ? Math.round(p) : null, ...(pozn ? { note: pozn } : {}) };
}

/** Tělo PATCH pro odmítnutí: důvod jen neprázdný. */
export function teloOdmitnuti(duvod: string): { status: 'odmitnuto'; note?: string } {
  const d = duvod.trim();
  return { status: 'odmitnuto', ...(d ? { note: d } : {}) };
}

/** Je uznání v mezích (body 0–500, prémie 0–5 000, celá čísla)? Nezadané = 0. */
export function uznaniVMezich(body: unknown, premie: unknown, maxPremie: number): boolean {
  const b = body === '' || body == null ? 0 : Number(body);
  const p = premie === '' || premie == null ? 0 : Number(premie);
  return Number.isInteger(b) && b >= 0 && b <= MAX_BODU && Number.isInteger(p) && p >= 0 && p <= maxPremie;
}
