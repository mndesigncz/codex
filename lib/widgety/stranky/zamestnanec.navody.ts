// Stránka „Návody" (zaměstnanec). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B6b v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.navody',
  rozhrani: 'zamestnanec',
  nazev: 'Návody',
  pohled: 'guides',
  pristup: ['navody.zobrazit'],
  nastroj: { nazev: 'Návody', ikona: 'book', popis: 'Knihovna návodů s kategoriemi a čtečkou.' },
  doporucene: ['navody.povinne_cteni', 'navody.nove', 'navody.k_uzaverce', 'odkaz'],
  vychozi: {
    'typ:zamestnanec': [{ w: 'navody.povinne_cteni', s: 'M' }, { w: 'navody.nove', s: 'M' }, { w: 'nastroj' }],
  },
  aktivni: false,
};
