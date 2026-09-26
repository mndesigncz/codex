// Stránka „Uzávěrka" (zaměstnanec). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true)
// a doporučené i výchozí rozložení upřesní balík B5a v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.uzaverka',
  rozhrani: 'zamestnanec',
  nazev: 'Uzávěrka',
  pohled: 'closing',
  pristup: ['uzaverky.vytvorit', 'uzaverky.predavka'],
  nastroj: { nazev: 'Uzávěrka směny', ikona: 'coins', popis: 'Formulář uzávěrky směny krok za krokem s předávkou.' },
  doporucene: [
    'uzaverky.moje_uzaverka',
    'uzaverky.predavka',
    'postupy.povinne_dnes',
    'navody.k_uzaverce',
    'uzaverky.moje_historie',
  ],
  vychozi: {
    'typ:zamestnanec': [
      { w: 'uzaverky.moje_uzaverka', s: 'M' },
      { w: 'postupy.povinne_dnes', s: 'S' },
      { w: 'navody.k_uzaverce', s: 'S' },
      { w: 'nastroj' },
      { w: 'uzaverky.moje_historie', s: 'L' },
    ],
  },
  aktivni: false,
};
