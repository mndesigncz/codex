// Stránka „Věrnost" (vedení). Katalog widgetů ji nezná: kolo 68 založilo jen nástroj ve výchozím
// rozložení; widgety doplní a plochu zapne (aktivni: true) balík B8 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.klient_vernost',
  rozhrani: 'vedeni',
  nazev: 'Věrnost',
  pohled: 'klient:loyalty',
  pristup: ['klient.prehled'],
  nastroj: { nazev: 'Věrnost', ikona: 'gift', popis: 'Pravidla věrnosti, razítka a kupony.' },
  doporucene: [],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }] },
  aktivni: false,
};
