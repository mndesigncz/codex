// Stránka „Plánování" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B6a v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.planovani',
  rozhrani: 'vedeni',
  nazev: 'Plánování',
  pohled: 'planning',
  pristup: ['planovani.zobrazit'],
  nastroj: {
    nazev: 'Nástěnka plánování',
    ikona: 'kanban',
    popis: 'Kanban s kartami Nápady, Rozpracováno, Ke schválení a Hotovo.',
  },
  doporucene: ['planovani.souhrn', 'planovani.ke_schvaleni', 'napady.nejzadanejsi', 'napady.nove'],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }] },
  aktivni: false,
};
