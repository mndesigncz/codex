// Stránka „Stoly a plánek" (vedení, Managero client). Kolo 68 založilo jen nástroj, kolo 69
// (balík B8) plochu zapnulo. Nástroj = seznam stolů, tisk QR a plánek podniku.
//
// Výchozí rozložení: jen nástroj — stoly jsou nastavení, ne denní práce; Propojení Clientu
// (je stůl spárovaný s kasou?) je v doporučených.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.klient_stoly',
  rozhrani: 'vedeni',
  nazev: 'Stoly a plánek',
  pohled: 'klient:tables',
  pristup: ['stoly.zobrazit'],
  nastroj: { nazev: 'Stoly a plánek', ikona: 'location', popis: 'Plánek podniku, stoly a QR kódy na stůl.' },
  doporucene: ['klient.propojeni', 'klient.dnesni_rezervace', 'klient.objednavky_od_stolu'],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }] },
  aktivni: true,
};
