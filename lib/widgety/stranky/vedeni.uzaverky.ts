// Stránka „Uzávěrky" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B5a) plochu
// zapnulo. Nástroj = seznam uzávěrek s filtrem měsíce, detailem a novou uzávěrkou
// (components/employer/ClosingsOverview.tsx); bloky nad ním jsou widgety oblasti uzávěrek a tržeb.
//
// Výchozí rozložení: fronty nahoře (co čeká na člověka), souhrn jako jedno číslo a hned pod ním
// seznam uzávěrek; graf tržeb po dnech a kalendář až pod seznamem. Kolo 6 (V04): dřív stál seznam
// za dvěma velkými grafy a kalendářem — na telefonu ~3 obrazovky pod ohybem, zkontrolovat včerejší
// uzávěrku znamenalo dlouho rolovat (vzor Storyous: první obrazovka = denní uzávěrky). Plocha nemá
// pořadí podle šířky, ale i na monitoru je seznam hned za frontami rozumný.
// Provozní (bez finance.trzby) dostane jen fronty a kalendář — souhrn, trend
// i rozdíl kasy by bez tržeb neměly co ukázat (N3); kalendář je i u něj až pod seznamem.
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
    'trzby.otevrene',
    'postupy.povinne_dnes',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'uzaverky.chybejici', s: 'M' },
      { w: 'uzaverky.ke_schvaleni', s: 'M' },
      { w: 'uzaverky.souhrn', s: 'S' },
      { w: 'nastroj' },
      { w: 'trzby.po_dnech', s: 'L' },
      { w: 'uzaverky.kalendar', s: 'L' },
    ],
    'role:provozni': [
      { w: 'uzaverky.chybejici', s: 'M' },
      { w: 'uzaverky.ke_schvaleni', s: 'M' },
      { w: 'nastroj' },
      { w: 'uzaverky.kalendar', s: 'L' },
    ],
  },
  aktivni: true,
};
