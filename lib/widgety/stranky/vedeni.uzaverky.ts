// Stránka „Uzávěrky" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B5a) plochu
// zapnulo. Nástroj = seznam uzávěrek s filtrem měsíce, detailem a novou uzávěrkou
// (components/employer/ClosingsOverview.tsx); bloky nad ním jsou widgety oblasti uzávěrek a tržeb.
//
// Výchozí rozložení je z katalogu: fronty nahoře (co čeká na člověka), čísla, graf a kalendář,
// seznam dole. Provozní (bez finance.trzby) dostane jen fronty a kalendář — souhrn, trend
// i rozdíl kasy by bez tržeb neměly co ukázat (N3).
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.uzaverky',
  rozhrani: 'vedeni',
  nazev: 'Uzávěrky',
  pohled: 'reports',
  pristup: ['uzaverky.zobrazit_vse'],
  nastroj: {
    nazev: 'Seznam uzávěrek',
    ikona: 'trend',
    popis: 'Uzávěrky po dnech s detailem, schválením a exportem.',
  },
  inkoust: true,
  doporucene: [
    'uzaverky.chybejici',
    'uzaverky.ke_schvaleni',
    'uzaverky.souhrn',
    'uzaverky.rozdil_kasy',
    'uzaverky.trendy',
    'uzaverky.mesic_v_cislech',
    'uzaverky.kalendar',
    'uzaverky.predavka',
    'trzby.po_dnech',
    'trzby.kasa_vs_uzaverky',
    'trzby.hodiny',
    'trzby.po_obsluze',
    'trzby.prumerna_uctenka',
    'pokladna.dnes',
    'postupy.povinne_dnes',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'uzaverky.chybejici', s: 'M' },
      { w: 'uzaverky.ke_schvaleni', s: 'M' },
      { w: 'uzaverky.souhrn', s: 'L' },
      { w: 'trzby.po_dnech', s: 'L' },
      { w: 'uzaverky.kalendar', s: 'L' },
      { w: 'nastroj' },
    ],
    'role:provozni': [
      { w: 'uzaverky.chybejici', s: 'M' },
      { w: 'uzaverky.ke_schvaleni', s: 'M' },
      { w: 'uzaverky.kalendar', s: 'L' },
      { w: 'nastroj' },
    ],
  },
  aktivni: true,
};
