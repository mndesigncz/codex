// Stránka „Moje směny" (zaměstnanec). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B1)
// plochu zapnulo. Nástroj = nadcházející směny s exportem do kalendáře a nabídkou do burzy
// (components/employee/MyShifts.tsx). Bloky, které dřív stály natvrdo nad seznamem a pod ním
// (tři dlaždice, Kdo má směnu, Schválené volno, Minulé směny, kalendář a burza), jsou widgety.
//
// Výchozí z katalogu: čísla nahoře, seznam, pak tým a vlastní historie. Kalendář uzávěrek
// na konci ukáže zaměstnanci jeho vlastní dny (bez uzaverky.zobrazit_vse rozsah Tým nemá).
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.moje_smeny',
  rozhrani: 'zamestnanec',
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
  aktivni: true,
};
