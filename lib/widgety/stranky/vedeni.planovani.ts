// Stránka „Plánování" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B6a) plochu
// zapnulo. Nástroj = components/employer/PlanningBoard.tsx (tabule Nápady → Rozpracováno → Ke
// schválení → Hotovo). Výchozí rozložení je podle katalogu jen nástroj: počty karet má tabule
// v hlavičkách sloupců. Souhrn, karty ke schválení a nápady týmu jsou v „Doporučených".
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
  aktivni: true,
};
