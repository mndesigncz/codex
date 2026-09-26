// Stránka „Směna" (tablet). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B9 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'kiosk.smena',
  rozhrani: 'kiosk',
  nazev: 'Směna',
  pohled: 'shift',
  pristup: null,
  nastroj: {
    nazev: 'Kdo je na směně',
    ikona: 'clock',
    popis: 'Píchání příchodu a odchodu s PINem a výběr, kdo u tabletu stojí.',
  },
  doporucene: [
    'oznameni.nastenka',
    'sklad.zapsat_novou',
    'akce.nejblizsi',
    'uzaverky.predavka',
    'rozvrh.dnesni_smeny',
    'dochazka.dnes_v_podniku',
    'postupy.povinne_dnes',
    'sdileni.pripnuta_nabidka',
    'klient.objednavky_od_stolu',
    'klient.dnesni_rezervace',
    'vyroba.k_vyrobe',
    'sklad.dochazi',
    'ukoly.dnes',
    'odmeny.zebricek',
    'menu.vyprodano',
  ],
  vychozi: {
    'typ:kiosk': [
      { w: 'oznameni.nastenka', s: 'L' },
      { w: 'nastroj' },
      { w: 'klient.objednavky_od_stolu', s: 'M' },
      { w: 'postupy.povinne_dnes', s: 'M' },
      { w: 'uzaverky.predavka', s: 'L' },
      { w: 'rozvrh.dnesni_smeny', s: 'M' },
      { w: 'vyroba.k_vyrobe', s: 'M' },
      { w: 'akce.nejblizsi', s: 'L' },
      { w: 'sklad.zapsat_novou', s: 'M' },
      { w: 'sklad.dochazi', s: 'M' },
      { w: 'sdileni.pripnuta_nabidka', s: 'L' },
    ],
  },
  aktivni: false,
};
