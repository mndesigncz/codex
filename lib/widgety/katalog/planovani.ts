// Widgety oblasti „Plánování" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/planovani.tsx, výpočty v lib/ukolyPrehled.ts.
// Soubor patří balíku B6a. Kolo 69: oba widgety hotové. Karty ke schválení mají ikonu `inbox`
// (fronta, která čeká), ať se na stránce Plánování neopakuje `kanban` nástroje (AK-19).
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
    stav: 'hotovo',
  },
  // Data: GET /api/planning → [column=review]{title,description}
  {
    id: 'planovani.ke_schvaleni',
    oblast: 'planovani',
    nazev: 'Karty ke schválení',
    popis: 'Karty ve sloupci Ke schválení.',
    ikona: 'inbox',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.planovani'],
    opravneni: { vse: ['planovani.zobrazit'], nektere: [], pole: { 'akce:presunout': 'planovani.upravit' } },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
];
