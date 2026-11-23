// Čistá logika peněz z trestů ve výplatách pro UI (kolo 96, docs/TRESTY-PENIZE.md 4.10): jak se rozpad
// z lib (RadekVyplaty.penize / rozpadVyplaty) rozdělí do sloupců výplatní listiny. Bez Reactu — testy
// scripts/testy/k84-vyplaty.ts ji pouští přímo v Node.
//
// Sloupce listiny s penězi (stejně jako CSV s `penize: true`):
//   Mzda = nároková část (vedle sloupce Nenároková složka), jinak mzda + složka navíc;
//   Prémie = nenárokové prémie + záskok + ostatní (bez krácení, náhrad a srážek);
//   Krácení a srážky = −(krácení, které se opravdu strhne + náhrada škody + srážky);
//   Prémie + Krácení a srážky = účinné úpravy (krácení nad strop se vrací — nároková mzda se nekrátí).
// Srážky čekající na souhlas se neodečítají nikde, jen se ukazují.

import type { RadekVyplaty } from '../../lib/dochazkaPrehled.ts';

type Radek = Pick<RadekVyplaty, 'mzda' | 'upravy' | 'penize'>;

/** Prémie řádku bez krácení a srážek z trestů (bez rozpadu = všechny úpravy jako dřív). */
export const premieRadku = (x: Radek): number => (x.penize ? x.penize.premie + x.penize.zaskok + x.penize.ostatni : x.upravy);

/** Krácení + náhrada + srážky záporně (0 bez rozpadu). */
export const srazkyRadku = (x: Radek): number => (x.penize ? -(x.penize.kraceniUplatneno + x.penize.nahrada + x.penize.srazky) : 0);

/** Úpravy, které opravdu jdou do výplaty (s vráceným krácením nad strop). */
export const upravyUcinne = (x: Radek): number => x.penize?.upravyUcinne ?? x.upravy;

/** Mzda do sloupce: nároková část, když stojí vedle sloupec složky; jinak mzda + složka navíc ke mzdě. */
export const mzdaRadku = (x: Radek, sloupecSlozky: boolean): number | null =>
  x.mzda == null ? null : sloupecSlozky && x.penize?.zakladni != null ? x.penize.zakladni : x.mzda + (x.penize?.slozkaNavic ?? 0);

/** Kolik v období čeká na souhlas a u kolika lidí (listina: věta nad tabulkou). */
export function cekaVListine(radky: readonly Radek[]): { castka: number; lidi: number } {
  let castka = 0, lidi = 0;
  for (const x of radky) { const c = x.penize?.cekaNaSouhlas ?? 0; if (c > 0) { castka += c; lidi++; } }
  return { castka, lidi };
}
