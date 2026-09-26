// Widgety oblasti „Moje směny" — metadata bez Reactu (kolo 68, v kole 69 dopsal balík B1).
//
// Komponenty jsou v components/widgety/oblasti/moje-smeny.tsx, výpočty v lib/rozvrhPrehled.ts.
// Všechno jsou vlastní data přihlášeného (oprávnění žádné): tři dlaždice, Schválené volno
// a Minulé směny, které dřív Moje směny kreslily natvrdo nad seznamem a pod ním.
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/shifts → shifts[{date,startTime,endTime,typeLabel}] (vlastní)
  // Pozor: vlastní data
  {
    id: 'moje.nejblizsi_smena',
    oblast: 'moje-smeny',
    nazev: 'Nejbližší směna',
    popis: 'Kdy máš další směnu — den, čas a typ.',
    ikona: 'calendar',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu', 'zamestnanec.dostupnost'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    kostra: { S: 'text', M: 'text' },
    stav: 'hotovo',
  },
  // Data: GET /api/shifts?employeeId=<já>
  // Pozor: vlastní data
  {
    id: 'moje.smeny_prehled',
    oblast: 'moje-smeny',
    nazev: 'Moje směny v číslech',
    popis: 'Nadcházející, odpracované a celkem směn.',
    ikona: 'overview',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.moje_smeny', 'zamestnanec.moje_smeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/shifts?employeeId=<já> → [{…, rating}] — hodnocení vlastních směn vrací od kola 69
  // přímo /api/shifts (dřív /api/rewards, které člověku s odmeny.zebricek reviews nevracelo)
  // Pozor: vlastní data
  {
    id: 'moje.minule_smeny',
    oblast: 'moje-smeny',
    nazev: 'Minulé směny',
    popis: 'Odpracované směny s hodnocením.',
    ikona: 'archive',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.moje_smeny', 'zamestnanec.moje_smeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/timeoff?mine=1 → requests[] (vždy jen vlastní, i vedení s volno.zobrazit)
  // Pozor: vlastní data
  {
    id: 'moje.schvalene_volno',
    oblast: 'moje-smeny',
    nazev: 'Moje volno',
    popis: 'Schválené a čekající žádosti o volno.',
    ikona: 'sun',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.moje_smeny', 'zamestnanec.moje_smeny', 'zamestnanec.dostupnost'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
];
