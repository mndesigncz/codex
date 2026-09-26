// Mřížka plochy s widgety (kolo 68, spec §3.2 a §4.5) — čistá logika.
//
// Počet sloupců se bere ze šířky PLOCHY, ne okna: plocha žije vedle
// rozbalitelného bočního pásu, v TO GO, v náhledu galerie i v Nastavení.
// Šířku měří ResizeObserver a výsledek jde do `--sloupcu`.
//
// V klidu se řady doplní do plna (DESIGN.md: mřížka nesmí nechat osiřelou
// buňku), v režimu úprav platí jmenovité velikosti — jinak by se velikosti
// měnily pod prstem při každém přesunu (spec O8).

import type { Velikost } from './typy.ts';
import { MRIZKA_PRAHY } from './konstanty.ts';

export type Sloupcu = 1 | 2 | 4;

/** Počet sloupců podle šířky plochy: od 840 px čtyři, od 300 px dva, jinak jeden. */
export function sloupcuProSirku(sirka: number): Sloupcu {
  if (sirka >= MRIZKA_PRAHY.ctyriOdPx) return 4;
  if (sirka >= MRIZKA_PRAHY.dvaOdPx) return 2;
  return 1;
}

/** Jmenovité rozpětí: S = 1, M = 2 (nejvýš počet sloupců), L = celá šířka. */
export function jmenoviteRozpeti(v: Velikost, sloupcu: Sloupcu): number {
  if (v === 'S') return 1;
  if (v === 'M') return Math.min(2, sloupcu);
  return sloupcu;
}

/**
 * Rozpětí položek v pořadí; skryté (null) dostanou 0 a do řad se nepočítají.
 * S `doplnit` se řady doplní do plna: když se další položka nevejde, řada se
 * uzavře a zbylé sloupce se rozdají po jednom položce s nejmenším rozpětím
 * (při shodě od konce). Na 4 sloupcích: [S,S] → [2,2]; [S,M] → [2,2];
 * [S,S,S] → [1,1,2]; [S] → [4]; [M] → [4].
 */
export function rozvrhni(velikosti: readonly (Velikost | null)[], sloupcu: Sloupcu, doplnit: boolean): number[] {
  const out = velikosti.map(v => (v == null ? 0 : jmenoviteRozpeti(v, sloupcu)));
  if (!doplnit) return out;
  let rada: number[] = [];
  let obsazeno = 0;
  const uzavri = () => {
    let zbyva = sloupcu - obsazeno;
    while (zbyva > 0 && rada.length) {
      let nejmensi = rada[rada.length - 1];
      for (let k = rada.length - 1; k >= 0; k--) if (out[rada[k]] < out[nejmensi]) nejmensi = rada[k];
      out[nejmensi]++;
      zbyva--;
    }
    rada = [];
    obsazeno = 0;
  };
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 0) continue;
    if (obsazeno + out[i] > sloupcu) uzavri();
    rada.push(i);
    obsazeno += out[i];
  }
  uzavri();
  return out;
}

/** Obdélník položky v souřadnicích ukazatele (rozvržení bez transformace). */
export interface Obdelnik { left: number; top: number; width: number; height: number }

/**
 * Vnitřní zóna položky: obdélník bez 25 % šířky z každé strany a bez 20 %
 * výšky shora i zdola. Okraje a mezery fungují jako hystereze — na hranici
 * dvou karet se cíl nepřepíná sem a tam.
 */
export function vnitrniZona(r: Obdelnik): Obdelnik {
  return { left: r.left + r.width * 0.25, top: r.top + r.height * 0.2, width: r.width * 0.5, height: r.height * 0.6 };
}

/** Leží bod ve vnitřní zóně obdélníku? */
export function veVnitrniZone(b: { x: number; y: number }, r: Obdelnik): boolean {
  const z = vnitrniZona(r);
  return b.x >= z.left && b.x <= z.left + z.width && b.y >= z.top && b.y <= z.top + z.height;
}

/**
 * Cílový index tahu. `obdelniky` jsou v náhledovém pořadí (null = skrytá
 * položka), `tazeny` je index tažené položky, `dosavadni` dosavadní cíl.
 * Ukazatel ve vnitřní zóně položky j → cíl j (tažená zaujme její místo,
 * ostatní uhnou). Pod poslední řadou → konec. Jinde se cíl nemění.
 *
 * `blokovany` je položka, která vyvolala minulé přeskládání. Její zóna cíl
 * nemění, dokud z ní ukazatel neodejde (hlídá volající). Hystereze okrajů
 * nestačí: když karta po přesunu zůstane na místě (malá karta nad velkou,
 * která zabírá celou řadu — bez `grid-auto-flow: dense` velká neuhne),
 * ukazatel je pořád v její zóně a cíl by se přepínal „za ni" a „před ni"
 * donekonečna (review kola 68, sonda rev-fyz2).
 */
export function cilovyIndex(bod: { x: number; y: number }, obdelniky: readonly (Obdelnik | null)[], tazeny: number, dosavadni: number, blokovany = -1): number {
  let spodek = -Infinity;
  for (let j = 0; j < obdelniky.length; j++) {
    const r = obdelniky[j];
    if (!r || j === tazeny) continue;
    if (veVnitrniZone(bod, r)) return j === blokovany ? dosavadni : j;
    spodek = Math.max(spodek, r.top + r.height);
  }
  if (spodek > -Infinity && bod.y > spodek) return obdelniky.length - 1;
  return dosavadni;
}
