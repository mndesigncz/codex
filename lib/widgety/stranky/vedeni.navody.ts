// Stránka „Návody" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B6b)
// plochu zapnulo. Nástroj = knihovna návodů s kategoriemi, čtečkou a editorem (components/Guides.tsx).
// Pás návrhů je widget navody.navrhy a „Kdo četl" ve čtečce má souhrn ve widgetu navody.kdo_necetl.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.navody',
  rozhrani: 'vedeni',
  nazev: 'Návody',
  pohled: 'guides',
  pristup: ['navody.zobrazit'],
  nastroj: { nazev: 'Návody', ikona: 'book', popis: 'Knihovna návodů s kategoriemi, čtečkou a editorem.' },
  doporucene: [
    'navody.povinne_cteni',
    'navody.kdo_necetl',
    'navody.nove',
    'navody.navrhy',
    'navody.k_uzaverce',
    'odkaz',
  ],
  vychozi: { 'typ:vedeni': [{ w: 'navody.navrhy', s: 'M' }, { w: 'navody.kdo_necetl', s: 'M' }, { w: 'nastroj' }] },
  aktivni: true,
};
