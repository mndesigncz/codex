// Widgety oblasti „Akce" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/akce.tsx. Widget se stavem 'planovany' komponentu ještě
// nemá: nekreslí se ani nenabízí, dokud ho balík B8 v kole 69 nenapíše a nepřepne na 'hotovo'. Soubor
// patří balíku B8; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/events → events[{title,date,startTime,location,status,crew,crewPeople}]
  {
    id: 'akce.nejblizsi',
    oblast: 'akce',
    nazev: 'Nejbližší akce',
    popis: 'Co se chystá: den, čas, místo a kdo je v obsluze.',
    ikona: 'calendarCheck',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.prehled', 'zamestnanec.domu', 'vedeni.rozvrh', 'vedeni.klient', 'vedeni.akce', 'kiosk.smena'],
    opravneni: { vse: ['akce.zobrazit'], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'pocet',
        nazev: 'Kolik akcí',
        typ: 'vyber',
        moznosti: [{ id: '1', nazev: 'Jedna' }, { id: '3', nazev: 'Tři' }],
        vychozi: '1',
      },
    ],
    kostra: { M: 'text', L: 'seznam' },
    stav: 'hotovo',
  },
  // Data: GET /api/events → events[0].checklist[]; PATCH /api/events/{id}
  {
    id: 'akce.checklist',
    oblast: 'akce',
    nazev: 'Příprava akce',
    popis: 'Checklist nejbližší akce k odškrtání.',
    ikona: 'calendarCheck',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.akce'],
    opravneni: { vse: ['akce.zobrazit'], nektere: [], pole: { 'akce:odskrtnout': 'akce.checklist' } },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/events → events[{revenue,costs,closingsTotal,closingsCount}] (null bez akce.finance)
  {
    id: 'akce.vysledek',
    oblast: 'akce',
    nazev: 'Výsledek akce',
    popis: 'Tržby, náklady a výsledek poslední proběhlé akce.',
    ikona: 'calendarCheck',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.klient', 'vedeni.akce'],
    opravneni: { vse: ['akce.zobrazit', 'akce.finance'], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
];
