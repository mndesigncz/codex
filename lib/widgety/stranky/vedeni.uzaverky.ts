// Stránka „Uzávěrky" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B5a v kole 69.
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
  aktivni: false,
};
