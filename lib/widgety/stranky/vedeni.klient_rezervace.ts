// Stránka „Rezervace" (vedení). Katalog widgetů ji nezná: kolo 68 založilo jen nástroj ve výchozím
// rozložení; widgety doplní a plochu zapne (aktivni: true) balík B8 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.klient_rezervace',
  rozhrani: 'vedeni',
  nazev: 'Rezervace',
  pohled: 'klient:reservations',
  pristup: ['klient.prehled'],
  nastroj: { nazev: 'Rezervace', ikona: 'calendarCheck', popis: 'Rezervace po dnech s potvrzením a usazením.' },
  doporucene: [],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }] },
  aktivni: false,
};
