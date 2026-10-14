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
    cil: { pohled: 'my-shifts' },
    stav: 'hotovo',
  },
  // Data: GET /api/shifts?employeeId=<já>
  // Pozor: vlastní data
  {
    id: 'moje.smeny_prehled',
    oblast: 'moje-smeny',
    nazev: 'Moje směny v číslech',
    popis: 'Nadcházející, naplánované hodiny a celkem.',
    ikona: 'overview',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.moje_smeny', 'zamestnanec.moje_smeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    cil: { pohled: 'my-shifts' },
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
    cil: { pohled: 'my-shifts' },
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
    cil: { pohled: 'my-shifts' },
    stav: 'hotovo',
  },
  // Data: GET /api/navic (vlastní zápisy za 60 dní + platná nabídka), ?month= pro minulý měsíc; zápis POST /api/navic,
  // úprava/smazání vlastního čekajícího PATCH/DELETE /api/navic/[id] — kolo 9 (N1, balík Z), okno components/navic/ZapsatNavic.
  // Pozor: vlastní data (vedení vidí svoje; tým má widget odmeny.navic_tymu). Ikona `sparkle`: na Domů ani Odměnách
  // zaměstnance ve výchozím rozložení není (AK-19).
  {
    id: 'moje-smeny.navic',
    // Kolo 11: přibyl 14. 10. 2026 — doplní se i do uložených rozložení (lib/widgety/rozlozeni.ts doplnNove).
    pridano: '2026-10-14',
    oblast: 'moje-smeny',
    nazev: 'Navíc',
    popis: 'Co jsi udělal(a) nad rámec směny — zápisy, uznané body a nabídka „Co se dá udělat navíc".',
    ikona: 'sparkle',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu', 'zamestnanec.moje_smeny', 'zamestnanec.odmeny', 'vedeni.moje_smeny'],
    opravneni: { vse: [], nektere: ['navic.zapsat', 'navic.zobrazit_tym'], pole: { 'akce:zapsat': 'navic.zapsat' } },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'tento', nazev: 'Tento' }, { id: 'minuly', nazev: 'Minulý' }],
        vychozi: 'tento',
      },
    ],
    rychlyFiltr: 'obdobi',
    kostra: { S: 'cislo', M: 'seznam', L: 'seznam' },
    cil: { pohled: 'rewards' },
    stav: 'hotovo',
  },
  // Data: GET /api/tresty (vlastní tresty za 90 dní — tento i minulý měsíc celý), potvrzení a vyjádření
  // PATCH /api/tresty/[id] { seen } / { response, disagree } — kolo 10 (balík Z), okno components/tresty/DetailTrestu.
  // Pozor: vlastní data (každý člen bez oprávnění; vedení vidí svoje, tým má widget odmeny.tresty_tymu).
  // Malá karta na Přehledu (Domů) se bez nepotvrzeného trestu v klidu nekreslí (prazdno={null}).
  {
    id: 'moje-smeny.tresty',
    // Kolo 11: přibyl 14. 10. 2026 — doplní se i do uložených rozložení (lib/widgety/rozlozeni.ts doplnNove).
    pridano: '2026-10-14',
    oblast: 'moje-smeny',
    nazev: 'Moje tresty',
    popis: 'Co ti vedení vytklo, co za to bylo a co ještě čeká na tvé potvrzení.',
    ikona: 'warning',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu', 'zamestnanec.odmeny', 'vedeni.moje_smeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'tento', nazev: 'Tento' }, { id: 'minuly', nazev: 'Minulý' }],
        vychozi: 'tento',
      },
    ],
    rychlyFiltr: 'obdobi',
    kostra: { S: 'text', M: 'seznam', L: 'seznam' },
    cil: { pohled: 'rewards' },
    stav: 'hotovo',
  },
];
