// Stránka „Nápady" (zaměstnanec). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B6a) plochu
// zapnulo. Nástroj = components/SuggestionsBoard.tsx (tatáž komponenta jako u vedení, stránku pozná
// podle adresy). Výchozí rozložení je podle katalogu jen nástroj.
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
  aktivni: true,
};
