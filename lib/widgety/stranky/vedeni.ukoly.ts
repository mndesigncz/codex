// Stránka „Úkoly" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B6a) plochu
// zapnulo. Nástroj = components/employer/TaskManager.tsx: seznam po dnech nebo týden, filtr podle
// lidí, nový úkol s opakováním a checklistem.
//
// Výchozí rozložení je podle katalogu jen nástroj: seznam úkolů je sám přehledem (Po termínu je
// jeho první sekce) a čísla nad ním by opakovala totéž. Widgety Po termínu, Podle lidí a Splněno
// dnes jsou v galerii v „Doporučených" pro toho, kdo chce vidět počty dřív než řádky.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.ukoly',
  rozhrani: 'vedeni',
  nazev: 'Úkoly',
  pohled: 'tasks',
  pristup: ['ukoly.zobrazit_tym', 'ukoly.zadavat'],
  nastroj: { nazev: 'Úkoly', ikona: 'check', popis: 'Seznam a týden úkolů s filtrem podle lidí a opakováním.' },
  doporucene: ['ukoly.po_terminu', 'ukoly.podle_lidi', 'ukoly.splneno_dnes', 'ukoly.dnes', 'ukoly.tyden', 'vyroba.k_vyrobe', 'postupy.povinne_dnes'],
  vychozi: { 'typ:vedeni': [{ w: 'nastroj' }] },
  aktivni: true,
};
