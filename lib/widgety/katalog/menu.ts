// Widgety oblasti „Menu" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/menu.tsx, výpočet v lib/recepturyPrehled.ts. Soubor
// patří balíku B4. Kolo 69: všechny tři hotové. Ikony se liší (AK-19), protože na stránce Menu stojí
// ve výchozím rozložení vedle sebe: menu jako deska (clipboard, jako dlaždice menu v editoru),
// vyprodáno jako cenovka (tag), Wi-Fi jako klíč (key).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/menu → boards[{slug,sections[{items[{name,soldOut}]}]}]; POST /api/menu/public/{slug}/soldout
  // Backend (triviální, hotový v kole 69): GET /api/menu?jen=vyprodano pustí i roli jen s menu.vyprodano
  // (Barista, tablet) a vrátí zapnutá menu bez cen, Wi-Fi a vzhledu. Proto `nektere`, ne `vse`:
  // kdo smí jen přepínat vyprodáno, widget vidí taky — přesně pro něj je.
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
    opravneni: { vse: [], nektere: ['menu.zobrazit', 'menu.vyprodano'], pole: { 'akce:prepnout_vyprodano': 'menu.vyprodano' } },
    tarif: 'max',
    stav: 'hotovo',
  },
  // Data: GET /api/menu → boards[{name,slug,enabled,hasPin,updatedAt,sections[].items[{price,posProductId}]}]
  {
    id: 'menu.stav',
    oblast: 'menu',
    nazev: 'Stav menu',
    popis: 'Je menu zveřejněné, adresa a QR, kolik položek, kolik bez ceny nebo nespárovaných s kasou.',
    ikona: 'clipboard',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.menu', 'vedeni.klient'],
    opravneni: { vse: ['menu.zobrazit'], nektere: [], pole: { 'akce:zverejnit': 'menu.zverejnit' } },
    tarif: 'max',
    stav: 'hotovo',
  },
  // Data: GET /api/menu → boards[].wifiSsid, wifiPassword
  // Pozor: katalog výslovně řadí heslo Wi-Fi pod menu.zobrazit
  {
    id: 'menu.wifi',
    oblast: 'menu',
    nazev: 'Wi-Fi pro hosty',
    popis: 'Název sítě a heslo k okopírování nebo ukázání hostovi.',
    ikona: 'key',
    velikosti: ['S'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.menu'],
    opravneni: { vse: ['menu.zobrazit'], nektere: [] },
    tarif: 'max',
    stav: 'hotovo',
  },
];
