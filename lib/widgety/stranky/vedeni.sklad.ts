// Stránka „Sklad" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B3) plochu
// zapnulo. Nástroj = položky skladu s hledáním, kategoriemi, řazením a hromadnými úpravami
// (components/employer/Inventory.tsx); bloky, které byly natvrdo nad seznamem (návrhy od týmu,
// chybějící údaje, souhrn docházejících, K výrobě, objednávky, hlášení z menu), jsou widgety.
//
// Výchozí rozložení je z katalogu: fronty nahoře (co čeká na člověka), pak zásoby a výroba.
// Provozní nemá sklad.ceny — Suroviny bez ceny se mu profiltrují pryč (N4), zbytek vidí.
// Skladník má vlastní rozložení s nákupem a hodnotou zásob.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.sklad',
  rozhrani: 'vedeni',
  nazev: 'Sklad',
  pohled: 'inventory',
  pristup: ['sklad.zobrazit'],
  nastroj: {
    nazev: 'Položky skladu',
    ikona: 'archive',
    popis: 'Položky skladu s hledáním, kategoriemi, množstvím a hromadnými úpravami.',
  },
  doporucene: [
    'sklad.dochazi',
    'sklad.nakupni_seznam',
    'sklad.navrhy',
    'sklad.hlaseni',
    'sklad.objednavky',
    'vyroba.k_vyrobe',
    'sklad.chybi_udaje',
    'sklad.hodnota_zasob',
    'sklad.posledni_pohyby',
    'sklad.inventura',
    'sklad.stav_kategorie',
    'finance.ztraty',
    'receptury.bez_receptury',
    'odkaz',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'sklad.navrhy', s: 'M' },
      { w: 'sklad.chybi_udaje', s: 'S' },
      { w: 'sklad.hlaseni', s: 'S' },
      { w: 'sklad.dochazi', s: 'M' },
      { w: 'sklad.objednavky', s: 'M' },
      { w: 'vyroba.k_vyrobe', s: 'L' },
      { w: 'nastroj' },
    ],
    'role:skladnik': [
      { w: 'sklad.navrhy', s: 'M' },
      { w: 'sklad.hlaseni', s: 'S' },
      { w: 'sklad.hodnota_zasob', s: 'S' },
      { w: 'sklad.nakupni_seznam', s: 'L' },
      { w: 'sklad.objednavky', s: 'L' },
      { w: 'vyroba.k_vyrobe', s: 'L' },
      { w: 'nastroj' },
    ],
  },
  aktivni: true,
};
