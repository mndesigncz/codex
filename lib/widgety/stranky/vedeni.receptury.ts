// Stránka „Receptury" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B4 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.receptury',
  rozhrani: 'vedeni',
  nazev: 'Receptury',
  pohled: 'recipes',
  pristup: ['receptury.zobrazit'],
  nastroj: { nazev: 'Receptury', ikona: 'clipboard', popis: 'Položky menu z kasy a jejich receptury s marží.' },
  doporucene: [
    'receptury.pokryti',
    'receptury.bez_receptury',
    'finance.marze',
    'sklad.chybi_udaje',
    'trzby.top_produkty',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'receptury.pokryti', s: 'M' },
      { w: 'finance.marze', s: 'S' },
      { w: 'sklad.chybi_udaje', s: 'S' },
      { w: 'receptury.bez_receptury', s: 'L' },
      { w: 'nastroj' },
    ],
  },
  aktivni: false,
};
