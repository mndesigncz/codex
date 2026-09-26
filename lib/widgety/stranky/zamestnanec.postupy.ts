// Stránka „Postupy" (zaměstnanec). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B6b)
// plochu zapnulo. Nástroj = seznam postupů ke spuštění (components/procedures/Procedures.tsx);
// „Moje průběhy" pod ním jsou widget postupy.posledni_prubehy (bez postupy.prubehy_tymu jen vlastní).
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.postupy',
  rozhrani: 'zamestnanec',
  nazev: 'Postupy',
  pohled: 'procedures',
  pristup: ['postupy.zobrazit'],
  nastroj: { nazev: 'Postupy', ikona: 'clipboard', popis: 'Postupy ke spuštění a návrhy nových.' },
  doporucene: ['postupy.povinne_dnes', 'postupy.posledni_prubehy', 'postupy.pripominky', 'postupy.spustit'],
  vychozi: {
    'typ:zamestnanec': [
      { w: 'postupy.povinne_dnes', s: 'M' },
      { w: 'postupy.pripominky', s: 'M' },
      { w: 'nastroj' },
      { w: 'postupy.posledni_prubehy', s: 'L' },
    ],
  },
  aktivni: true,
};
