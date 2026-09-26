// Stránka „Nápady" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B6a v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.napady',
  rozhrani: 'vedeni',
  nazev: 'Nápady',
  pohled: 'suggestions',
  pristup: ['napady.spravovat', 'napady.pridat'],
  nastroj: { nazev: 'Nápady', ikona: 'bulb', popis: 'Podněty týmu s hlasováním, stavem a posláním do plánování.' },
  doporucene: ['napady.nejzadanejsi', 'napady.nove', 'planovani.souhrn'],
  vychozi: { 'typ:vedeni': [{ w: 'napady.nove', s: 'M' }, { w: 'napady.nejzadanejsi', s: 'M' }, { w: 'nastroj' }] },
  aktivni: false,
};
