// Stránka „Menu" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B4 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.menu',
  rozhrani: 'vedeni',
  nazev: 'Menu',
  pohled: 'klient:menu',
  pristup: ['menu.zobrazit'],
  nastroj: { nazev: 'Menu', ikona: 'leaf', popis: 'Menu pro hosty: sekce, položky, ceny, vzhled a zveřejnění.' },
  doporucene: ['menu.stav', 'menu.vyprodano', 'menu.wifi', 'trzby.top_produkty'],
  vychozi: {
    'typ:vedeni': [
      { w: 'menu.stav', s: 'S' },
      { w: 'menu.vyprodano', s: 'M' },
      { w: 'menu.wifi', s: 'S' },
      { w: 'nastroj' },
    ],
  },
  aktivni: false,
};
