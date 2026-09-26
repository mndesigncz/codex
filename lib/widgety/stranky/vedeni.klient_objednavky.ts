// Stránka „Objednávky" (vedení). Katalog widgetů ji nezná: kolo 68 založilo jen nástroj ve výchozím
// rozložení; widgety doplní a plochu zapne (aktivni: true) balík B8 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.klient_objednavky',
  rozhrani: 'vedeni',
  nazev: 'Objednávky',
  pohled: 'klient:orders',
  pristup: ['klient.prehled'],
  nastroj: { nazev: 'Objednávky', ikona: 'cup', popis: 'Fronta objednávek od stolu k přijetí a odeslání do kasy.' },
  doporucene: [],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }] },
  aktivni: false,
};
