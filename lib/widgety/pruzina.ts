// Pružina pro přeskládání a dosednutí widgetu (kolo 68, spec §4.13).
//
// Apple popisuje pružinu tlumením ζ a odezvou T. Z nich ω₀ = 2π / T
// (tuhost k = ω₀², hmotnost 1). Pro ζ = 1 (kritické tlumení, bez odskoku)
// existuje uzavřený tvar, takže se nic neintegruje: výsledek nezávisí na
// snímkové frekvenci a dva kroky po dt/2 dají totéž co jeden krok dt.
// Proto vlastní pružina místo knihovny (spec §4.14): pružina jde kdykoli
// přerušit novým cílem a nese rychlost prstu.

import { PRUZINA, ROLOVANI_U_OKRAJE, RYCHLOST_PUSTENI, STROP_RYCHLOSTI } from './konstanty.ts';

/** Kritický tlumený krok: posun x a rychlost v (px, px/s) k cíli 0 za dt sekund. */
export function krok(x: number, v: number, dt: number, odezva: number = PRUZINA.odezva): { x: number; v: number } {
  const w = (2 * Math.PI) / odezva;           // ≈ 17,95 s⁻¹ pro 0,35 s
  const e = Math.exp(-w * dt);
  const c = v + w * x;
  return { x: (x + c * dt) * e, v: (v - w * c * dt) * e };
}

/** Pružina je u cíle: posun pod půl pixelu a skoro bez rychlosti — pak se transform smaže. */
export const USAZENO = (x: number, v: number): boolean => Math.abs(x) < 0.5 && Math.abs(v) < 5;

/** Vzorek polohy ukazatele (t v ms, x a y v px). */
export interface VzorekUkazatele { t: number; x: number; y: number }

/**
 * Rychlost puštění: nejvýš 5 vzorků z posledních 100 ms PŘED PUŠTĚNÍM,
 * (puštění − první) / Δt po osách, oříznuté na ±strop. Starší vzorky by
 * do hodu započítaly i zpomalení před puštěním.
 *
 * `pusteni` je vzorek z pointerup (timeStamp, clientX/Y) a počítá se jako
 * poslední. Okno se měří od něj, ne od posledního pointermove: když prst
 * zastaví a chvíli drží, pointermove nechodí a rychlost z pohybu před
 * zastavením by kartu „odhodila" až 2500 px/s. Mezi posledním pointermove
 * a puštěním prst stál (pohyb by pointermove vyvolal), takže pauza rychlost
 * srazí a po 100 ms klidu je nulová.
 */
export function rychlostZVzorku(vzorky: readonly VzorekUkazatele[], pusteni: VzorekUkazatele, strop: number = STROP_RYCHLOSTI): { vx: number; vy: number } {
  const { oknoMs, vzorku } = RYCHLOST_PUSTENI;
  const okno = [...vzorky.filter(s => s.t < pusteni.t && pusteni.t - s.t <= oknoMs), pusteni].slice(-vzorku);
  const prvni = okno[0];
  const dt = (pusteni.t - prvni.t) / 1000;
  if (!(dt > 0)) return { vx: 0, vy: 0 };
  const orez = (v: number) => Math.max(-strop, Math.min(strop, v));
  return { vx: orez((pusteni.x - prvni.x) / dt), vy: orez((pusteni.y - prvni.y) / dt) };
}

/**
 * Rychlost rolování při tahu u okraje (px/s): v zóně 72 px od hrany roste
 * s druhou mocninou blízkosti, na hraně je 1100 px/s. Mimo zónu 0.
 */
export function rychlostRolovani(vzdalenostOdHrany: number): number {
  const { zonaPx, maxPxS } = ROLOVANI_U_OKRAJE;
  if (!(vzdalenostOdHrany < zonaPx)) return 0;
  const d = Math.max(0, vzdalenostOdHrany);
  return maxPxS * (1 - d / zonaPx) ** 2;
}
