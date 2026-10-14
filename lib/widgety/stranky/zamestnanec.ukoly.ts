// Stránka „Úkoly" (zaměstnanec). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B6a) plochu
// zapnulo. Nástroj = components/employee/Tasks.tsx: moje úkoly a úkoly pro kohokoli po dnech nebo
// týden, s checklisty a proklikem na návod. Výchozí rozložení je podle katalogu jen nástroj.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.ukoly',
  rozhrani: 'zamestnanec',
  nazev: 'Úkoly',
  pohled: 'tasks',
  pristup: null,
  nastroj: { nazev: 'Úkoly', ikona: 'check', popis: 'Moje úkoly po dnech s checklisty a návody.' },
  // Kolo 11: Úkoly za body mají v nástroji vlastní sekci „Za body navíc" (Tasks.tsx) — widget je jen v galerii.
  doporucene: ['ukoly.za_body', 'ukoly.po_terminu', 'ukoly.tyden', 'vyroba.k_vyrobe', 'postupy.povinne_dnes', 'navody.povinne_cteni'],
  vychozi: { 'typ:zamestnanec': [{ w: 'nastroj' }] },
  aktivni: true,
};
