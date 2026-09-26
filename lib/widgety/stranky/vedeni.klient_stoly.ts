// Stránka „Stoly a plánek" (vedení). Katalog widgetů ji nezná: kolo 68 založilo jen nástroj ve
// výchozím rozložení; widgety doplní a plochu zapne (aktivni: true) balík B8 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.klient_stoly',
  rozhrani: 'vedeni',
  nazev: 'Stoly a plánek',
  pohled: 'klient:tables',
  pristup: ['klient.prehled'],
  nastroj: { nazev: 'Stoly a plánek', ikona: 'location', popis: 'Plánek podniku, stoly a QR kódy na stůl.' },
  doporucene: [],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }] },
  aktivni: false,
};
