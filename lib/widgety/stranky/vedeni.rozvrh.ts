// Stránka „Rozvrh" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B1) plochu
// zapnulo. Nástroj = měsíční mřížka směn s generováním, publikováním a nastavením rozvrhu
// (components/scheduling/ScheduleBuilder.tsx). Bloky, které dřív visely natvrdo nad mřížkou
// (Dostupnost týmu, Díry v obsazení) a pod ní (Výměny, Žádosti o volno), jsou widgety.
//
// Výchozí rozložení je z katalogu: dostupnost jako střední karta (pilulky „kdo ještě nezadal"
// zalomené do řádků, ne jedenáct řádků seznamu) a hned za ní mřížka — na telefonu se dřív
// plánovač utopil pod velkou dostupností a čtyřmi frontami a mřížka začínala až o dvě
// obrazovky níž (kolo 6 UX, nález rozvrh-telefon-nastroj-utopeny). Fronty a čísla (Díry,
// Žádosti o volno, Výměny, Naplánované hodiny) jsou až pod ní. Nový default platí jen tam,
// kde uživatel ani podnik nemá uložené vlastní rozložení. Záložky nastavení (Typy směn,
// Otevírací doba, Pevné dny, Pravidla) widgety nemají — jsou uvnitř nástroje.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.rozvrh',
  rozhrani: 'vedeni',
  nazev: 'Rozvrh',
  pohled: 'shifts',
  pristup: ['rozvrh.zobrazit', 'rozvrh.nahled'],
  nastroj: {
    nazev: 'Plánovač rozvrhu',
    ikona: 'calendar',
    popis: 'Měsíční mřížka směn s generováním, publikováním a nastavením rozvrhu.',
  },
  doporucene: [
    'rozvrh.dostupnost_tymu',
    'rozvrh.diry',
    'rozvrh.zadosti_volno',
    'rozvrh.vymeny',
    'rozvrh.hodiny_lidi',
    'rozvrh.poptavka',
    'rozvrh.dnesni_smeny',
    'akce.nejblizsi',
    'uzaverky.kalendar',
    'dochazka.prave_na_smene',
    'odkaz',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'rozvrh.dostupnost_tymu', s: 'M' },
      { w: 'nastroj' },
      { w: 'rozvrh.diry', s: 'S' },
      { w: 'rozvrh.zadosti_volno', s: 'S' },
      { w: 'rozvrh.vymeny', s: 'S' },
      { w: 'rozvrh.hodiny_lidi', s: 'S' },
    ],
  },
  aktivni: true,
};
