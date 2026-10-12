// Stránka „Sklad" (zaměstnanec). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B3) plochu
// zapnulo. Nástroj = stav skladu se zápisem množství (components/employee/InventoryReport.tsx);
// banner inventury, zápis nové věci, docházející nahoře a nahlášení chybějících jsou widgety.
//
// Výchozí rozložení: nástroj (seznam se zápisem stavu) stojí před Docházejícími zásobami
// (audit kola 6, Z5). Dřív byly Docházející L nad ním jako „první, co člověk u regálu hledá" —
// jenže widget položky jen ukazuje a zápis má nástroj, který sám řadí, co dochází, nahoru;
// seznam pak na telefonu začínal na y=1021 (1,3 obrazovky pod widgety). Docházející zůstávají
// pod nástrojem jako M (pět nejhorších + „Zobrazit vše", klepnutí otevře seznam s filtrem).
// Inventura a dlaždice Zapsat novou věc / Nahlásit chybějící jsou nad ním, jsou krátké.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.sklad',
  rozhrani: 'zamestnanec',
  nazev: 'Sklad',
  pohled: 'inventory',
  pristup: ['sklad.zobrazit'],
  nastroj: { nazev: 'Stav skladu', ikona: 'archive', popis: 'Stav skladu po kategoriích se zápisem množství.' },
  doporucene: [
    'sklad.inventura',
    'sklad.zapsat_novou',
    'sklad.dochazi',
    'sklad.nahlasit',
    'sklad.stav_kategorie',
    'vyroba.k_vyrobe',
    'odkaz',
  ],
  vychozi: {
    'typ:zamestnanec': [
      { w: 'sklad.inventura', s: 'M' },
      { w: 'sklad.zapsat_novou', s: 'S' },
      { w: 'sklad.nahlasit', s: 'S' },
      { w: 'nastroj' },
      { w: 'sklad.dochazi', s: 'M' },
    ],
  },
  aktivni: true,
};
