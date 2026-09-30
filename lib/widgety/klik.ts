// Rozhodnutí „je tohle klepnutí na kartu, která má navigovat?" (kolo 71).
//
// Klepnutí na kartu widgetu v klidu naviguje na cíl z katalogu. Aby to
// neodhodilo člověka pryč ve chvíli, kdy chtěl něco jiného, rozhoduje se tady,
// v čisté funkci bez DOM — plocha jen sesbírá fakta a tenhle soubor se testuje
// samostatně (scripts/testy/k71-klik.ts).
//
// Proč se neptáme jen na cíl CLICKU: prohlížeč pošle click na nejbližšího
// společného předka stisku a puštění. Stisk na tlačítku, které ujelo o pár
// pixelů (pod hysterezí) a puštění na kartě, tak končí clickem na <li> a
// filtr „cíl je tlačítko" neprojde. Proto se fakta berou i ze STISKU.

import { HYSTEREZE_PX } from './konstanty.ts';

/** Prvky, které si klepnutí nechávají pro sebe (tlačítka, odkazy, pole…). */
export const SELEKTOR_INTERAKTIVNI =
  'button, a, input, select, textarea, label, [contenteditable="true"], [data-bez-podrzeni], [data-plocha-chrom]';

/**
 * Překryvy, jejichž zavření klepnutím nesmí navigovat. Okno (`Modal`) se kreslí
 * inline uvnitř <li> bez portálu a jeho pozadí je obyčejný div, takže klepnutí
 * vedle okna ho zavře A ZÁROVEŇ probublá na kartu. Popovery a menu se zavírají
 * už na mousedown mimo panel a následný click pak dopadne na tělo karty.
 */
export const SELEKTOR_PREKRYV =
  '.modal-overlay, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [aria-haspopup][aria-expanded="true"]';

/** Fakta o stisku (pointerdown), uložená plochou v okamžiku stisku. */
export interface StiskKlid {
  x: number;
  y: number;
  /** Stisk začal na interaktivním prvku (tlačítko, odkaz, pole…). */
  naInteraktivnim: boolean;
  /** V okamžiku stisku byl otevřený překryv (okno, menu, popover). */
  prekryto: boolean;
}

/** Fakta o clicku, který se právě obsluhuje. */
export interface KlikKlid {
  x: number;
  y: number;
  /** Cíl clicku je (uvnitř) interaktivního prvku. */
  naInteraktivnim: boolean;
  /** Cíl clicku je pozadí nebo panel překryvu (okno, menu). */
  vPrekryvu: boolean;
}

/**
 * Smí klepnutí navigovat? Ne, když chybí stisk (klik bez pointerdownu:
 * klávesnice, odečítač), když stisk nebo click patřil interaktivnímu prvku
 * nebo překryvu, nebo když prst od stisku ujel přes hysterezi (tah, rolování).
 */
export function smiKlepnutiNavigovat(stisk: StiskKlid | null, klik: KlikKlid, hystereze: number = HYSTEREZE_PX): boolean {
  if (!stisk) return false;
  if (stisk.naInteraktivnim || stisk.prekryto) return false;
  if (klik.naInteraktivnim || klik.vPrekryvu) return false;
  return Math.hypot(klik.x - stisk.x, klik.y - stisk.y) <= hystereze;
}

/** Je prvek (nebo jeho předek) interaktivní? Cíl mimo Element se bere jako neinteraktivní. */
export function jeInteraktivniCil(cil: EventTarget | null): boolean {
  return cil instanceof Element && !!cil.closest(SELEKTOR_INTERAKTIVNI);
}

/** Leží cíl v překryvu (pozadí okna, panel okna nebo menu)? */
export function jeCilVPrekryvu(cil: EventTarget | null): boolean {
  return cil instanceof Element && !!cil.closest(SELEKTOR_PREKRYV);
}

/** Je právě teď otevřený nějaký překryv? Volá se při stisku, dřív než ho mousedown zavře. */
export function jePrekryvOtevreny(doc: Document): boolean {
  return !!doc.querySelector(SELEKTOR_PREKRYV);
}
