// Stránka „Nápady" (zaměstnanec). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B6a v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.napady',
  rozhrani: 'zamestnanec',
  nazev: 'Nápady',
  pohled: 'suggestions',
  pristup: ['napady.pridat', 'napady.spravovat'],
  nastroj: { nazev: 'Nápady', ikona: 'bulb', popis: 'Podněty týmu s hlasováním a novým podnětem.' },
  doporucene: ['napady.nejzadanejsi'],
  vychozi: { 'typ:zamestnanec': [{ w: 'nastroj' }] },
  aktivni: false,
};
