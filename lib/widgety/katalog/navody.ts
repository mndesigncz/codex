// Widgety oblasti „Návody" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/navody.tsx. Widget se stavem 'planovany' komponentu
// ještě nemá: nekreslí se ani nenabízí, dokud ho balík B6b v kole 69 nenapíše a nepřepne na 'hotovo'.
// Soubor patří balíku B6b; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/guides → guides[requireRead && !myRead]
  {
    id: 'navody.povinne_cteni',
    oblast: 'navody',
    nazev: 'Povinné čtení',
    popis: 'Návody označené jako povinné, které jsem ještě nečetl.',
    ikona: 'book',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['zamestnanec.domu', 'zamestnanec.ukoly', 'vedeni.navody', 'zamestnanec.navody'],
    opravneni: { vse: ['navody.zobrazit'], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/guides → guides[requireRead]{readCount}; GET /api/teams → members.length; jména:
  // GET /api/guides/{id}/reads → read[], unread[]
  {
    id: 'navody.kdo_necetl',
    oblast: 'navody',
    nazev: 'Kdo nečetl',
    popis: 'U povinných návodů: kolik lidí četlo, kdo ještě ne.',
    ikona: 'book',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.navody'],
    opravneni: { vse: ['navody.povinne_cteni'], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/guides → guides[{title,updatedAt,excerpt}]
  {
    id: 'navody.nove',
    oblast: 'navody',
    nazev: 'Nově upravené návody',
    popis: 'Co se v návodech naposledy změnilo.',
    ikona: 'book',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.navody', 'zamestnanec.navody'],
    opravneni: { vse: ['navody.zobrazit'], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'pocet',
        nazev: 'Kolik řádků',
        typ: 'vyber',
        moznosti: [{ id: '3', nazev: '3' }, { id: '5', nazev: '5' }, { id: '10', nazev: '10' }],
        vychozi: '5',
      },
    ],
    stav: 'planovany',
  },
  // Data: GET /api/guides → guides[approved=false]
  {
    id: 'navody.navrhy',
    oblast: 'navody',
    nazev: 'Návrhy návodů',
    popis: 'Návody navržené týmem ke schválení.',
    ikona: 'book',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.navody'],
    opravneni: { vse: ['navody.schvalovat'], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/guides → guides[forClosing=true && approved]
  {
    id: 'navody.k_uzaverce',
    oblast: 'navody',
    nazev: 'Návod k uzávěrce',
    popis: 'Návod připnutý k uzávěrce — jak se zavírá kasa.',
    ikona: 'book',
    velikosti: ['S'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['zamestnanec.uzaverka', 'vedeni.navody', 'zamestnanec.navody'],
    opravneni: { vse: ['navody.zobrazit'], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
];
