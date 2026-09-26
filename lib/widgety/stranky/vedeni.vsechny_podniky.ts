// Stránka „Všechny podniky" (vedení). Katalog widgetů ji nezná: kolo 68 založilo jen nástroj ve
// výchozím rozložení; widgety doplní a plochu zapne (aktivni: true) balík B5b v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.vsechny_podniky',
  rozhrani: 'vedeni',
  nazev: 'Všechny podniky',
  pohled: 'org',
  pristup: null,
  nastroj: {
    nazev: 'Všechny podniky',
    ikona: 'chart',
    popis: 'Tržby, mzdy a uzávěrky všech podniků organizace na jedné obrazovce.',
  },
  doporucene: [],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }] },
  aktivni: false,
};
