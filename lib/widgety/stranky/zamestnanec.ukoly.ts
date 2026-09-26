// Stránka „Úkoly" (zaměstnanec). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B6a v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.ukoly',
  rozhrani: 'zamestnanec',
  nazev: 'Úkoly',
  pohled: 'tasks',
  pristup: null,
  nastroj: { nazev: 'Úkoly', ikona: 'check', popis: 'Moje úkoly po dnech s checklisty a návody.' },
  doporucene: ['ukoly.po_terminu', 'vyroba.k_vyrobe', 'postupy.povinne_dnes', 'navody.povinne_cteni'],
  vychozi: { 'typ:zamestnanec': [{ w: 'nastroj' }] },
  aktivni: false,
};
