// Stránka „Rozvrh" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B1 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.rozvrh',
  rozhrani: 'vedeni',
  nazev: 'Rozvrh',
  pohled: 'shifts',
  pristup: ['rozvrh.zobrazit', 'rozvrh.nahled'],
  nastroj: {
    nazev: 'Rozvrh',
    ikona: 'calendar',
    popis: 'Měsíční mřížka směn s generováním, publikováním a nastavením rozvrhu.',
  },
  doporucene: [
    'rozvrh.dostupnost_tymu',
    'rozvrh.diry',
    'rozvrh.poptavka',
    'rozvrh.zadosti_volno',
    'rozvrh.vymeny',
    'rozvrh.hodiny_lidi',
    'rozvrh.dnesni_smeny',
    'akce.nejblizsi',
    'uzaverky.kalendar',
    'dochazka.prave_na_smene',
    'odkaz',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'rozvrh.dostupnost_tymu', s: 'L' },
      { w: 'rozvrh.diry', s: 'S' },
      { w: 'rozvrh.zadosti_volno', s: 'S' },
      { w: 'rozvrh.vymeny', s: 'S' },
      { w: 'rozvrh.hodiny_lidi', s: 'S' },
      { w: 'nastroj' },
    ],
  },
  aktivni: false,
};
