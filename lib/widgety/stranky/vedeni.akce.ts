// Stránka „Akce" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B8 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.akce',
  rozhrani: 'vedeni',
  nazev: 'Akce',
  pohled: 'events',
  pristup: ['akce.zobrazit'],
  nastroj: { nazev: 'Akce', ikona: 'calendarCheck', popis: 'Seznam akcí s formulářem, obsluhou a přípravou.' },
  doporucene: ['akce.nejblizsi', 'akce.checklist', 'akce.vysledek'],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }] },
  aktivni: false,
};
