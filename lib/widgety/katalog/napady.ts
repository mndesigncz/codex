// Widgety oblasti „Nápady" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/napady.tsx. Widget se stavem 'planovany' komponentu
// ještě nemá: nekreslí se ani nenabízí, dokud ho balík B6a v kole 69 nenapíše a nepřepne na 'hotovo'.
// Soubor patří balíku B6a; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/suggestions → suggestions[{title,votes,hasVoted,status}]
  {
    id: 'napady.nejzadanejsi',
    oblast: 'napady',
    nazev: 'Nejžádanější nápady',
    popis: 'Podněty týmu s nejvíc hlasy — hlasovat jde přímo z karty.',
    ikona: 'bulb',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.planovani', 'vedeni.napady', 'zamestnanec.napady'],
    opravneni: { vse: ['napady.pridat'], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'stav',
        nazev: 'Stav',
        typ: 'vyber',
        moznosti: [
          { id: 'nove', nazev: 'Nové' },
          { id: 'naplanovane', nazev: 'Naplánované' },
          { id: 'vse', nazev: 'Vše' },
        ],
        vychozi: 'nove',
      },
    ],
    stav: 'planovany',
  },
  // Data: GET /api/suggestions → suggestions[status=new]
  {
    id: 'napady.nove',
    oblast: 'napady',
    nazev: 'Nové podněty',
    popis: 'Podněty ve stavu Nový, které čekají na posouzení.',
    ikona: 'bulb',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.planovani', 'vedeni.napady'],
    opravneni: { vse: ['napady.spravovat'], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
];
