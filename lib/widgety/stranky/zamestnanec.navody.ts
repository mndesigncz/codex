// Stránka „Návody" (zaměstnanec). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B6b)
// plochu zapnulo. Nástroj = knihovna návodů s kategoriemi a čtečkou (components/Guides.tsx);
// štítek „povinné čtení" na kartě má souhrn ve widgetu navody.povinne_cteni.
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
  aktivni: true,
};
