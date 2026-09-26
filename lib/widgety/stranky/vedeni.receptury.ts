// Stránka „Receptury" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B4) plochu
// zapnulo. Nástroj = položky menu z kasy s hledáním, kategoriemi a editorem receptury
// (components/inventory/RecipesView.tsx). Bloky, které byly natvrdo nad seznamem — tři dlaždice
// s čísly a tónovaný pás „Prodává se, ale neodepisuje" — jsou widgety Pokrytí recepturou a
// Prodává se, ale neodepisuje.
//
// Výchozí rozložení je z katalogu: čísla nahoře (pokrytí, marže, suroviny bez ceny), pod nimi
// fronta prodejů bez receptury a nakonec nástroj. Provozní nemá finance.marze ani sklad.ceny,
// takže mu Marže produktů a Suroviny bez ceny vypadnou a zbytek zůstane.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.receptury',
  rozhrani: 'vedeni',
  nazev: 'Receptury',
  pohled: 'recipes',
  pristup: ['receptury.zobrazit'],
  nastroj: {
    nazev: 'Receptury z kasy',
    ikona: 'clipboard',
    popis: 'Položky menu z kasy s hledáním a kategoriemi, jejich receptury a marže.',
  },
  doporucene: [
    'receptury.pokryti',
    'receptury.bez_receptury',
    'finance.marze',
    'sklad.chybi_udaje',
    'trzby.top_produkty',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'receptury.pokryti', s: 'M' },
      { w: 'finance.marze', s: 'S' },
      { w: 'sklad.chybi_udaje', s: 'S' },
      { w: 'receptury.bez_receptury', s: 'L' },
      { w: 'nastroj' },
    ],
  },
  aktivni: true,
};
