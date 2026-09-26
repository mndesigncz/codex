// Widgety oblasti „Plánování" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/planovani.tsx. Widget se stavem 'planovany' komponentu
// ještě nemá: nekreslí se ani nenabízí, dokud ho balík B6a v kole 69 nenapíše a nepřepne na 'hotovo'.
// Soubor patří balíku B6a; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/planning → [{column}]
  {
    id: 'planovani.souhrn',
    oblast: 'planovani',
    nazev: 'Plánovací nástěnka',
    popis: 'Kolik karet je v Nápadech, Rozpracováno, Ke schválení a Hotovo.',
    ikona: 'kanban',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.planovani', 'vedeni.napady'],
    opravneni: { vse: ['planovani.zobrazit'], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/planning → [column=review]{title,description}
  {
    id: 'planovani.ke_schvaleni',
    oblast: 'planovani',
    nazev: 'Karty ke schválení',
    popis: 'Karty ve sloupci Ke schválení.',
    ikona: 'kanban',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.planovani'],
    opravneni: { vse: ['planovani.zobrazit'], nektere: [], pole: { 'akce:presunout': 'planovani.upravit' } },
    tarif: 'zdarma',
    stav: 'planovany',
  },
];
