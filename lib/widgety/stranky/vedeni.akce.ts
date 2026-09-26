// Stránka „Akce" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B8) plochu
// zapnulo. Nástroj = seznam akcí s detailem (obsluha, balení, menu, vyúčtování) a „Nová akce".
// Kreslí se v administraci (pohled events) i v Managero client (záložka Akce) — obojí je
// EventsView, takže jedna plocha a jedno rozložení.
//
// Výchozí rozložení: Příprava nejbližší akce a Výsledek poslední nad seznamem. Výsledek chce
// akce.finance — role bez něj ho nedostane (filtr, spec §1.5). Nejbližší akce je jen
// v doporučených: na stránce, jejíž nástroj je seznam akcí, by se opakovala.
// Ikona nástroje je kalendář (kalendář s fajfkou má widget Nejbližší akce, AK-19).
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.akce',
  rozhrani: 'vedeni',
  nazev: 'Akce',
  pohled: 'events',
  pristup: ['akce.zobrazit'],
  nastroj: { nazev: 'Akce', ikona: 'calendar', popis: 'Seznam akcí s formulářem, obsluhou a přípravou.' },
  doporucene: ['akce.checklist', 'akce.vysledek', 'akce.nejblizsi'],
  vychozi: { 'typ:vedeni': [{ w: 'akce.checklist', s: 'M' }, { w: 'akce.vysledek', s: 'M' }, { w: 'nastroj' }] },
  aktivni: true,
};
