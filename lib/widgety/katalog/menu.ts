// Widgety oblasti „Menu" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/menu.tsx. Widget se stavem 'planovany' komponentu ještě
// nemá: nekreslí se ani nenabízí, dokud ho balík B4 v kole 69 nenapíše a nepřepne na 'hotovo'. Soubor
// patří balíku B4; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/menu → boards[{slug,sections[{items[{name,soldOut}]}]}]; POST /api/menu/public/{slug}/soldout
  // Backend: triviální pro roli bez menu.zobrazit (Barista, tablet mají jen menu.vyprodano): vydat jim slug
  // menu, pak stačí veřejné GET /api/menu/public/{slug}
  {
    id: 'menu.vyprodano',
    oblast: 'menu',
    nazev: 'Vyprodáno',
    popis: 'Co je teď v menu označené jako vyprodané — a rychlé přepnutí u baru.',
    ikona: 'tag',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['zamestnanec.domu', 'vedeni.menu', 'vedeni.klient', 'kiosk.smena'],
    opravneni: { vse: ['menu.zobrazit'], nektere: [], pole: { 'akce:prepnout_vyprodano': 'menu.vyprodano' } },
    tarif: 'max',
    stav: 'planovany',
  },
  // Data: GET /api/menu → boards[{name,slug,enabled,hasPin,updatedAt,sections[].items[{price,posProductId}]}]
  {
    id: 'menu.stav',
    oblast: 'menu',
    nazev: 'Stav menu',
    popis: 'Je menu zveřejněné, adresa a QR, kolik položek, kolik bez ceny nebo nespárovaných s kasou.',
    ikona: 'tag',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.menu', 'vedeni.klient'],
    opravneni: { vse: ['menu.zobrazit'], nektere: [], pole: { 'akce:zverejnit': 'menu.zverejnit' } },
    tarif: 'max',
    stav: 'planovany',
  },
  // Data: GET /api/menu → boards[].wifiSsid, wifiPassword
  // Pozor: katalog výslovně řadí heslo Wi-Fi pod menu.zobrazit
  {
    id: 'menu.wifi',
    oblast: 'menu',
    nazev: 'Wi-Fi pro hosty',
    popis: 'Název sítě a heslo k okopírování nebo ukázání hostovi.',
    ikona: 'tag',
    velikosti: ['S'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.menu'],
    opravneni: { vse: ['menu.zobrazit'], nektere: [] },
    tarif: 'max',
    stav: 'planovany',
  },
];
