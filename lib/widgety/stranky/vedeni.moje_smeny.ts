// Stránka „Moje směny" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B1) plochu
// zapnulo. Nástroj = nadcházející směny s exportem do kalendáře a nabídkou do burzy
// (components/employee/MyShifts.tsx). Tři dlaždice, Schválené volno, Minulé směny, Kdo má směnu
// a burza jsou widgety. Dostupnost a žádost o volno zůstávají pod plochou jako formuláře
// (kreslí je EmployerLayout, který patří jinému balíku).
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.moje_smeny',
  rozhrani: 'vedeni',
  nazev: 'Moje směny',
  pohled: 'my-shifts',
  pristup: null,
  nastroj: {
    nazev: 'Nadcházející směny',
    ikona: 'calendar',
    popis: 'Tvoje nadcházející směny, export do kalendáře a nabídka směny do burzy.',
  },
  doporucene: [
    'moje.smeny_prehled',
    'rozvrh.pripominka_dostupnosti',
    'rozvrh.vymeny',
    'moje.schvalene_volno',
    'moje.minule_smeny',
    'rozvrh.tym_nahled',
    'uzaverky.kalendar',
    'moje.vydelek',
    'dochazka.moje_odpracovano',
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
  aktivni: true,
};
