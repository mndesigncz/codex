// Stránka „Docházka" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B2) zapnulo plochu.
//
// Nástroj = záznamy docházky po dnech (hledání, úprava, přidání, export). Přepínač období 7/30/90
// zůstává v hlavičce stránky a řídí i widgety s volbou „Podle stránky" (Mzdy, Souhrn hodin).
// Výchozí rozložení je z katalogu beze změny: nahoře kdo je teď na směně a zapomenuté odchody,
// pod tím peníze a hodiny, nástroj na konci.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.dochazka',
  rozhrani: 'vedeni',
  nazev: 'Docházka',
  pohled: 'attendance',
  pristup: ['dochazka.zobrazit'],
  nastroj: {
    nazev: 'Záznamy docházky',
    ikona: 'clock',
    popis: 'Záznamy po dnech s hledáním, úpravou, přidáním a exportem.',
  },
  doporucene: [
    'dochazka.prave_na_smene',
    'dochazka.dnes_v_podniku',
    'dochazka.dlouhe_prichody',
    'dochazka.mzdy_za_obdobi',
    'dochazka.souhrn_hodin',
    'finance.trzby_vs_mzdy',
    'tym.bez_sazby',
    'rozvrh.dnesni_smeny',
    'dochazka.moje_pichacky',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'dochazka.prave_na_smene', s: 'L' },
      { w: 'dochazka.dlouhe_prichody', s: 'S' },
      { w: 'dochazka.mzdy_za_obdobi', s: 'M' },
      { w: 'tym.bez_sazby', s: 'S' },
      { w: 'dochazka.souhrn_hodin', s: 'L' },
      { w: 'nastroj' },
    ],
  },
  aktivni: true,
};
