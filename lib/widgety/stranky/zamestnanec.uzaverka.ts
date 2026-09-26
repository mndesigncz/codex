// Stránka „Uzávěrka" (zaměstnanec). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B5a)
// plochu zapnulo. Nástroj = formulář uzávěrky (components/employee/CashClosing.tsx); historie pod
// ním a výzva „Chybí ti uzávěrka" nad ním jsou teď widgety.
//
// Předávka je ve výchozím na konci kvůli roli, která má jen uzaverky.predavka (kuchař): formulář
// se jí nevykreslí a bez předávky by stránka zůstala prázdná (poznámka katalogu).
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
      { w: 'uzaverky.predavka', s: 'L' },
    ],
  },
  aktivni: true,
};
