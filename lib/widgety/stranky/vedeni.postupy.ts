// Stránka „Postupy" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B6b)
// plochu zapnulo. Nástroj = seznam postupů se spuštěním, detailem, úpravami a návrhy od týmu
// (components/procedures/Procedures.tsx). Pás „N návrhů ke schválení" je teď widget postupy.navrhy
// a „Poslední průběhy" pod seznamem widget postupy.posledni_prubehy.
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
  aktivni: true,
};
