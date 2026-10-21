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
  nazev: 'Věrnostní program',
  pohled: 'klient:loyalty',
  pristup: ['vernost.zobrazit', 'kupony.spravovat'],
  nastroj: { nazev: 'Věrnost', ikona: 'tag', popis: 'Pravidla věrnosti, razítka a kupony.' },
  doporucene: ['klient.vernost_30dni', 'klient.zdravi', 'klient.razitka_14', 'klient.clenove', 'finance.hoste_vernost'],
  // Kolo 92: program se živým náhledem karty nahoře, čísla za 30 dní pod ním.
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }, { w: 'klient.vernost_30dni', s: 'M' }] },
  aktivni: true,
};
