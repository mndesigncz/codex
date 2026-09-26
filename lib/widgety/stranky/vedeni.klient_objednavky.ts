// Stránka „Objednávky" (vedení, Managero client). Kolo 68 založilo jen nástroj, kolo 69 (balík B8)
// plochu zapnulo. Nástroj = fronta objednávek od stolu (StaffInbox) s kartičkou hosta u kasy.
//
// Výchozí rozložení: fronta nahoře, pod ní dnešní rezervace v S a Vyprodáno v M — u baru se
// zároveň přijímá objednávka a přepíná, co došlo (widget oblasti menu, B4).
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.klient_objednavky',
  rozhrani: 'vedeni',
  nazev: 'Objednávky',
  pohled: 'klient:orders',
  pristup: ['objednavky.zobrazit'],
  nastroj: { nazev: 'Objednávky', ikona: 'cup', popis: 'Fronta objednávek od stolu k přijetí a odeslání do kasy.' },
  doporucene: ['klient.dnesni_rezervace', 'menu.vyprodano', 'menu.stav', 'prehled.ceka_na_tebe', 'klient.hodnoceni'],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }, { w: 'klient.dnesni_rezervace', s: 'S' }, { w: 'menu.vyprodano', s: 'M' }] },
  aktivni: true,
};
