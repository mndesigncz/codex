// Stránka „Postupy" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B6b v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.postupy',
  rozhrani: 'vedeni',
  nazev: 'Postupy',
  pohled: 'procedures',
  pristup: ['postupy.zobrazit'],
  nastroj: { nazev: 'Postupy', ikona: 'clipboard', popis: 'Postupy se spuštěním, úpravami a návrhy od týmu.' },
  doporucene: [
    'postupy.povinne_dnes',
    'postupy.navrhy',
    'postupy.posledni_prubehy',
    'postupy.preskocene_kroky',
    'postupy.pripominky',
    'postupy.spustit',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'postupy.povinne_dnes', s: 'M' },
      { w: 'postupy.navrhy', s: 'M' },
      { w: 'nastroj' },
      { w: 'postupy.posledni_prubehy', s: 'L' },
    ],
  },
  aktivni: false,
};
