// Stránka „Sklad" (zaměstnanec). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B3 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.sklad',
  rozhrani: 'zamestnanec',
  nazev: 'Sklad',
  pohled: 'inventory',
  pristup: ['sklad.zobrazit'],
  nastroj: { nazev: 'Sklad', ikona: 'archive', popis: 'Stav skladu po kategoriích se zápisem množství.' },
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
  aktivni: false,
};
