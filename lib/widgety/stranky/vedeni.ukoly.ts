// Stránka „Úkoly" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true) a
// doporučené i výchozí rozložení upřesní balík B6a v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.ukoly',
  rozhrani: 'vedeni',
  nazev: 'Úkoly',
  pohled: 'tasks',
  pristup: ['ukoly.zobrazit_tym', 'ukoly.zadavat'],
  nastroj: { nazev: 'Úkoly', ikona: 'check', popis: 'Seznam a týden úkolů s filtrem podle lidí a opakováním.' },
  doporucene: [
    'ukoly.po_terminu',
    'ukoly.podle_lidi',
    'ukoly.splneno_dnes',
    'ukoly.dnes',
    'vyroba.k_vyrobe',
    'postupy.povinne_dnes',
  ],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }] },
  aktivni: false,
};
