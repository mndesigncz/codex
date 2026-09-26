// Stránka „Sklad" (zaměstnanec). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B3) plochu
// zapnulo. Nástroj = stav skladu se zápisem množství (components/employee/InventoryReport.tsx);
// banner inventury, zápis nové věci, docházející nahoře a nahlášení chybějících jsou widgety.
//
// Výchozí rozložení je z katalogu. Docházející zásoby jsou L — na telefonu je to první,
// co člověk u regálu hledá, a velký widget je seskupí podle kategorie.
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
      { w: 'sklad.dochazi', s: 'L' },
      { w: 'nastroj' },
    ],
  },
  aktivni: true,
};
