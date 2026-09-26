// Stránka „Tým" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B2 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.tym',
  rozhrani: 'vedeni',
  nazev: 'Tým',
  pohled: 'team-settings',
  pristup: ['tym.zobrazit'],
  nastroj: {
    nazev: 'Lidé v podniku',
    ikona: 'users',
    popis: 'Členové týmu s pozicí, rolí a sazbou; pozvánky a nastavení týmu.',
  },
  doporucene: [
    'tym.clenove',
    'tym.pozvanky',
    'tym.role',
    'tym.bez_sazby',
    'dochazka.prave_na_smene',
    'rozvrh.dostupnost_tymu',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'tym.pozvanky', s: 'S' },
      { w: 'tym.bez_sazby', s: 'S' },
      { w: 'tym.role', s: 'M' },
      { w: 'nastroj' },
    ],
  },
  aktivni: false,
};
