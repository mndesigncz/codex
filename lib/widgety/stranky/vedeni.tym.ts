// Stránka „Tým" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B2) zapnulo plochu.
//
// Katalog: stránka je nastavení — widgety jen nad seznamem členů, sekce formulářů (organizace,
// provoz podniku, výplaty, sdílení, tablet, integrace) zůstávají pevně v nástroji pod nimi.
// Nástroj proto nese seznam členů i ty sekce; pozvánky jsou widget (tym.pozvanky) a formulář
// „Pozvat" otevírá limetka v hlavičce.
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
  aktivni: true,
};
