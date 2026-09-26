// Stránka „Odměny" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B7 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.odmeny',
  rozhrani: 'vedeni',
  nazev: 'Odměny',
  pohled: 'rewards',
  pristup: ['odmeny.zebricek', 'odmeny.katalog'],
  nastroj: { nazev: 'Odměny', ikona: 'award', popis: 'Žebříček, kalendář hodnocení a nastavení odměn.' },
  doporucene: [
    'odmeny.zadosti',
    'hodnoceni.nehodnocene',
    'hodnoceni.ohodnotit_smeny',
    'odmeny.vytky_tymu',
    'odmeny.zebricek',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'odmeny.zadosti', s: 'M' },
      { w: 'hodnoceni.nehodnocene', s: 'S' },
      { w: 'odmeny.vytky_tymu', s: 'S' },
      { w: 'nastroj' },
    ],
  },
  aktivni: false,
};
