// Stránka „Moje směny" (zaměstnanec). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni:
// true) a doporučené i výchozí rozložení upřesní balík B1 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.moje_smeny',
  rozhrani: 'zamestnanec',
  nazev: 'Moje směny',
  pohled: 'my-shifts',
  pristup: null,
  nastroj: { nazev: 'Moje směny', ikona: 'calendar', popis: 'Nadcházející směny s typem a export do kalendáře.' },
  doporucene: [
    'moje.smeny_prehled',
    'rozvrh.tym_nahled',
    'moje.schvalene_volno',
    'moje.minule_smeny',
    'uzaverky.kalendar',
    'rozvrh.vymeny',
    'moje.vydelek',
    'dochazka.moje_odpracovano',
    'rozvrh.pripominka_dostupnosti',
  ],
  vychozi: {
    'typ:zamestnanec': [
      { w: 'moje.smeny_prehled', s: 'M' },
      { w: 'moje.vydelek', s: 'S' },
      { w: 'dochazka.moje_odpracovano', s: 'S' },
      { w: 'nastroj' },
      { w: 'rozvrh.tym_nahled', s: 'L' },
      { w: 'moje.schvalene_volno', s: 'M' },
      { w: 'rozvrh.vymeny', s: 'M' },
      { w: 'moje.minule_smeny', s: 'M' },
      { w: 'rozvrh.pripominka_dostupnosti', s: 'M' },
      { w: 'uzaverky.kalendar', s: 'L' },
    ],
  },
  aktivni: false,
};
