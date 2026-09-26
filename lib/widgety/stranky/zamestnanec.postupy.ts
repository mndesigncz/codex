// Stránka „Postupy" (zaměstnanec). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni: true)
// a doporučené i výchozí rozložení upřesní balík B6b v kole 69.
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
  aktivni: false,
};
