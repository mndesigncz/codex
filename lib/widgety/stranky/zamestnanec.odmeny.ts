// Stránka „Odměny" (zaměstnanec). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B7 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.odmeny',
  rozhrani: 'zamestnanec',
  nazev: 'Odměny',
  pohled: 'rewards',
  pristup: null,
  nastroj: { nazev: 'Moje odměny', ikona: 'award', popis: 'Moje úroveň, body a pokrok k další úrovni.' },
  doporucene: [
    'moje.zpetna_vazba',
    'odmeny.katalog',
    'moje.odkud_body',
    'odmeny.urovne',
    'moje.hodnoceni_smen',
    'moje.tento_mesic',
  ],
  vychozi: {
    'typ:zamestnanec': [
      { w: 'moje.zpetna_vazba', s: 'L' },
      { w: 'nastroj' },
      { w: 'odmeny.katalog', s: 'L' },
      { w: 'moje.odkud_body', s: 'M' },
      { w: 'odmeny.urovne', s: 'M' },
      { w: 'moje.hodnoceni_smen', s: 'L' },
    ],
  },
  aktivni: false,
};
