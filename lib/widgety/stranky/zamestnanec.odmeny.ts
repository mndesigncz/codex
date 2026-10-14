// Stránka „Odměny" (zaměstnanec). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B7) plochu
// zapnulo. Nástroj = moje úroveň, body a pokrok k další úrovni (components/employee/MyRewards.tsx);
// bloky pod ním (výtky, katalog, odkud mám body, úrovně, hodnocení směn) jsou teď widgety.
//
// Proti katalogu je Zpětná vazba ve výchozím střední, ne velká: velká nese pod novým hodnocením
// i historii a ta by se na téhle stránce opakovala s widgetem Hodnocení mých směn. Střední se
// v klidu nekreslí, dokud není co potvrdit — výtka tak stojí nahoře, jen když opravdu je.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.odmeny',
  rozhrani: 'zamestnanec',
  nazev: 'Odměny',
  pohled: 'rewards',
  pristup: null,
  nastroj: { nazev: 'Moje úroveň', ikona: 'award', popis: 'Moje úroveň, body, pokrok k další úrovni a výhody.' },
  doporucene: [
    'moje.zpetna_vazba',
    'moje-smeny.navic',
    'moje-smeny.tresty',
    'odmeny.katalog',
    'moje.odkud_body',
    'odmeny.urovne',
    'moje.hodnoceni_smen',
    'moje.tento_mesic',
  ],
  vychozi: {
    'typ:zamestnanec': [
      { w: 'moje.zpetna_vazba', s: 'M' },
      { w: 'nastroj' },
      // Kolo 9 (N1): sekce „Navíc" = velký widget s filtrem a měsícem (zápisy, body, nabídka).
      { w: 'moje-smeny.navic', s: 'L' },
      // Kolo 10 (balík Z): „Moje tresty" = velký widget se souhrnem měsíce, filtrem a měsícem; z oznámení
      // (?view=rewards&arg=tresty) se nad stránkou otevře detail nejnovějšího nepotvrzeného (MyRewards).
      { w: 'moje-smeny.tresty', s: 'L' },
      { w: 'odmeny.katalog', s: 'L' },
      { w: 'moje.odkud_body', s: 'M' },
      { w: 'odmeny.urovne', s: 'M' },
      { w: 'moje.hodnoceni_smen', s: 'L' },
    ],
  },
  aktivni: true,
};
