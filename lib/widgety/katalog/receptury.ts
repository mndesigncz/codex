// Widgety oblasti „Receptury" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/receptury.tsx. Widget se stavem 'planovany' komponentu
// ještě nemá: nekreslí se ani nenabízí, dokud ho balík B4 v kole 69 nenapíše a nepřepne na 'hotovo'.
// Soubor patří balíku B4; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/pos/products → products[], recipes[], unmapped[]; GET /api/inventory → length
  {
    id: 'receptury.pokryti',
    oblast: 'receptury',
    nazev: 'Pokrytí recepturou',
    popis: 'Kolik % položek menu má recepturu, kolik se prodává bez receptury, kolik položek je ve skladu.',
    ikona: 'leaf',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.receptury'],
    opravneni: { vse: ['receptury.zobrazit'], nektere: [] },
    tarif: 'max',
    stav: 'planovany',
  },
  // Data: GET /api/pos/products → unmapped[{productId,productName,soldCount}]
  {
    id: 'receptury.bez_receptury',
    oblast: 'receptury',
    nazev: 'Prodává se, ale neodepisuje',
    popis: 'Nejprodávanější položky z kasy bez receptury (tyhle prodeje se ze skladu neodepíšou) — proklik do editoru.',
    ikona: 'leaf',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.sklad', 'vedeni.receptury'],
    opravneni: { vse: ['receptury.zobrazit'], nektere: [], pole: { 'akce:doplnit_recepturu': 'receptury.upravit' } },
    tarif: 'max',
    stav: 'planovany',
  },
];
