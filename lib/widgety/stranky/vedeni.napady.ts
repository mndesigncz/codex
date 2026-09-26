// Stránka „Nápady" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B6a) plochu
// zapnulo. Nástroj = components/SuggestionsBoard.tsx (podněty s hlasováním, stavem a posláním do
// plánování). Výchozí rozložení z katalogu: nahoře co čeká na posouzení a co tým chce nejvíc, pod
// tím celý seznam. Skladník (jen napady.pridat) Nové podněty nevidí a zbyde mu nástroj
// s Nejžádanějšími.
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
  aktivni: true,
};
