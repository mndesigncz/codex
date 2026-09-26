// Stránka „Věrnost" (vedení, Managero client). Kolo 68 založilo jen nástroj, kolo 69 (balík B8)
// plochu zapnulo. Nástroj = pravidla bodů a úrovní, razítkové kampaně, kupony a promo kódy
// (LoyaltyTabs).
//
// Výchozí rozložení: čísla za 30 dní nad nástrojem (dřív „Za posledních 30 dní" uvnitř
// záložky jako další podoba čísel), nástroj pod nimi.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.klient_vernost',
  rozhrani: 'vedeni',
  nazev: 'Věrnost',
  pohled: 'klient:loyalty',
  pristup: ['vernost.zobrazit', 'kupony.spravovat'],
  nastroj: { nazev: 'Věrnost', ikona: 'tag', popis: 'Pravidla věrnosti, razítka a kupony.' },
  doporucene: ['klient.vernost_30dni', 'klient.clenove', 'finance.hoste_vernost'],
  vychozi: { 'typ:vedeni': [{ w: 'klient.vernost_30dni', s: 'M' }, { w: 'nastroj' }] },
  aktivni: true,
};
