// Stránka „TO GO" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B5b v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.togo',
  rozhrani: 'vedeni',
  nazev: 'TO GO',
  pohled: 'togo',
  pristup: null,
  nastroj: null,
  inkoust: true,
  doporucene: [
    'pokladna.dnes',
    'trzby.po_dnech',
    'dochazka.dnes_v_podniku',
    'vyroba.k_vyrobe',
    'chat.neprectene',
    'sklad.dochazi',
    'finance.uctenky',
    'odkaz',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'pokladna.dnes', s: 'M' },
      { w: 'trzby.po_dnech', s: 'M' },
      { w: 'dochazka.dnes_v_podniku', s: 'M' },
      { w: 'vyroba.k_vyrobe', s: 'M' },
      { w: 'chat.neprectene', s: 'S' },
      { w: 'sklad.dochazi', s: 'S' },
      { w: 'finance.uctenky', s: 'S' },
    ],
  },
  aktivni: false,
};
