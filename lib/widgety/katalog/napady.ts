// Widgety oblasti „Nápady" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/napady.tsx, výpočty v lib/ukolyPrehled.ts.
// Soubor patří balíku B6a. Kolo 69: oba widgety hotové. Na stránce Nápady jsou ve výchozím
// rozložení vedle sebe a nad nástrojem s ikonou `bulb` — proto `star` (nejvíc hlasů) a `inbox`
// (čeká na posouzení), ať se ikona neopakuje (AK-19).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/suggestions → suggestions[{title,votes,hasVoted,status}]
  {
    id: 'napady.nejzadanejsi',
    oblast: 'napady',
    nazev: 'Nejžádanější nápady',
    popis: 'Podněty týmu s nejvíc hlasy — hlasovat jde přímo z karty.',
    ikona: 'star',
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
    stav: 'hotovo',
  },
  // Data: GET /api/suggestions → suggestions[status=new]
  {
    id: 'napady.nove',
    oblast: 'napady',
    nazev: 'Nové podněty',
    popis: 'Podněty ve stavu Nový, které čekají na posouzení.',
    ikona: 'inbox',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.planovani', 'vedeni.napady'],
    opravneni: { vse: ['napady.spravovat'], nektere: [] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
];
