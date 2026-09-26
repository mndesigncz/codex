// Widgety oblasti „Moje směny" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/moje-smeny.tsx. Widget se stavem 'planovany' komponentu
// ještě nemá: nekreslí se ani nenabízí, dokud ho balík B1 v kole 69 nenapíše a nepřepne na 'hotovo'.
// Soubor patří balíku B1; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/shifts → shifts[{date,startTime,endTime,typeLabel}] (vlastní)
  // Pozor: vlastní data
  {
    id: 'moje.nejblizsi_smena',
    oblast: 'moje-smeny',
    nazev: 'Nejbližší směna',
    popis: 'Kdy máš další směnu — den, čas a typ.',
    ikona: 'calendar',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    kostra: { S: 'text', M: 'text' },
    stav: 'hotovo',
  },
  // Data: GET /api/shifts?employeeId=<já>
  // Pozor: vlastní data
  {
    id: 'moje.smeny_prehled',
    oblast: 'moje-smeny',
    nazev: 'Moje směny v číslech',
    popis: 'Nadcházející, odpracované a celkem směn.',
    ikona: 'calendar',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.moje_smeny', 'zamestnanec.moje_smeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/shifts?employeeId=<já>; GET /api/rewards → reviews[] (hodnocení k datu)
  // Backend: triviální jen pro člověka s odmeny.zebricek: /api/rewards mu vrací žebříček bez me/reviews — vracet
  // je vždy
  // Pozor: vlastní data
  {
    id: 'moje.minule_smeny',
    oblast: 'moje-smeny',
    nazev: 'Minulé směny',
    popis: 'Odpracované směny s hodnocením.',
    ikona: 'calendar',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.moje_smeny', 'zamestnanec.moje_smeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/timeoff → requests[] (bez volno.zobrazit jen vlastní)
  // Pozor: vlastní data
  {
    id: 'moje.schvalene_volno',
    oblast: 'moje-smeny',
    nazev: 'Moje volno',
    popis: 'Schválené a čekající žádosti o volno.',
    ikona: 'calendar',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.moje_smeny', 'zamestnanec.moje_smeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
];
