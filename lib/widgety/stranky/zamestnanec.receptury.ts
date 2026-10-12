// Stránka „Receptury" (zaměstnanec) — kolo 5 UX: zaměstnanec s receptury.zobrazit vidí receptury
// z kasy (a s receptury.upravit je i upravuje — barista ví nejlíp, co do drinku jde), ne jen vedení.
// Nástroj je tatáž komponenta jako u vedení (components/inventory/RecipesView.tsx) s plochou
// `zamestnanec.receptury`; widgety s maržemi a surovinami bez ceny tu nejsou (finance.marze, sklad.ceny).
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.receptury',
  rozhrani: 'zamestnanec',
  nazev: 'Receptury',
  pohled: 'recipes',
  pristup: ['receptury.zobrazit'],
  nastroj: {
    nazev: 'Receptury z kasy',
    ikona: 'clipboard',
    popis: 'Položky menu z kasy s hledáním a kategoriemi a jejich receptury.',
  },
  doporucene: [
    'receptury.pokryti',
    'receptury.bez_receptury',
    'odkaz',
  ],
  vychozi: {
    'typ:zamestnanec': [
      { w: 'receptury.pokryti', s: 'M' },
      { w: 'receptury.bez_receptury', s: 'L' },
      { w: 'nastroj' },
    ],
  },
  aktivni: true,
};
