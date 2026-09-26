// Stránka „Moje směny" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B1 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.moje_smeny',
  rozhrani: 'vedeni',
  nazev: 'Moje směny',
  pohled: 'my-shifts',
  pristup: null,
  nastroj: {
    nazev: 'Moje směny',
    ikona: 'calendar',
    popis: 'Nadcházející směny, export do kalendáře, dostupnost a žádosti o volno.',
  },
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
    'typ:vedeni': [
      { w: 'moje.smeny_prehled', s: 'M' },
      { w: 'rozvrh.pripominka_dostupnosti', s: 'M' },
      { w: 'nastroj' },
      { w: 'rozvrh.vymeny', s: 'M' },
      { w: 'moje.schvalene_volno', s: 'M' },
    ],
  },
  aktivni: false,
};
