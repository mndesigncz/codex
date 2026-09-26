// Widgety oblasti „Rozvrh" — metadata bez Reactu (kolo 68, v kole 69 dopsal balík B1).
//
// Komponenty jsou v components/widgety/oblasti/rozvrh.tsx, výpočty v lib/rozvrhPrehled.ts.
// Kolo 69 dopsalo všechno, co bylo 'planovany': bloky, které dřív visely natvrdo nad a pod
// plánovačem (díry, výměny, žádosti o volno) a v Mých směnách (Kdo má směnu), jsou widgety.
// Ikony se ve výchozím rozložení stránky nesmí opakovat (AK-19) — proto každý svou,
// ne šestkrát „calendar".
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: vedení: GET /api/schedule?month → shifts[{employeeName,employeeAvatar,date,startTime,endTime,type}]
  // (rozvrh.zobrazit); náhled: GET /api/shifts?team=1&month →
  // shifts[{employeeName,typeLabel,typeColor,startTime,endTime}] (rozvrh.nahled); tablet: GET /api/attendance →
  // roster[{name,shiftStart,shiftEnd,openSince}] (dochazka.tablet)
  // Pozor: Dnešní widget bere /api/shifts, které jména nevrací → u každého stojí „Zaměstnanec". Použít zdroje
  // výše.
  {
    id: 'rozvrh.dnesni_smeny',
    oblast: 'rozvrh',
    nazev: 'Dnešní směny',
    popis: 'Kdo má dnes směnu, od kdy do kdy a jestli už přišel.',
    ikona: 'calendar',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.prehled', 'vedeni.rozvrh', 'vedeni.dochazka', 'kiosk.smena'],
    opravneni: {
      vse: [],
      nektere: ['rozvrh.zobrazit', 'rozvrh.nahled', 'dochazka.tablet', 'dochazka.zobrazit'],
      pole: {
        planovac: 'rozvrh.zobrazit',
        nahled: 'rozvrh.nahled',
        prichody: ['dochazka.zobrazit', 'dochazka.tablet'],
      },
    },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'den',
        nazev: 'Den',
        typ: 'vyber',
        moznosti: [{ id: 'dnes', nazev: 'Dnes' }, { id: 'zitra', nazev: 'Zítra' }],
        vychozi: 'dnes',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/availability?month → submissions[{employeeId,employeeName,unavailableDates}]; GET /api/teams
  // → members
  // Pozor: Dnes hlídáno jen smi("shifts") — role s rozvrh.nahled bez dostupnost.zobrazit vidí „0 z N zadalo".
  // Pozor: poznámky k dostupnosti (osobní důvody) do widgetu nepatří
  {
    id: 'rozvrh.dostupnost_tymu',
    oblast: 'rozvrh',
    nazev: 'Dostupnost týmu',
    popis: 'Kdo už zadal dostupnost na příští měsíc a kdo ještě ne.',
    ikona: 'swap',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.rozvrh', 'vedeni.tym'],
    opravneni: {
      vse: ['dostupnost.zobrazit'],
      nektere: [],
      pole: { 'akce:sestavit_rozvrh': 'rozvrh.generovat', 'akce:vyplnit_za_cloveka': 'dostupnost.upravit' },
    },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'mesic',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'pristi', nazev: 'Příští' }, { id: 'tento', nazev: 'Tento' }],
        vychozi: 'pristi',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/schedule?month → gaps[{date,from,to,minutes}], understaffed[{date,shiftTypeName}]
  {
    id: 'rozvrh.diry',
    oblast: 'rozvrh',
    nazev: 'Díry v obsazení',
    popis: 'Dny, kdy je otevřeno a nikdo není v podniku, a neobsazené typy směn.',
    ikona: 'warning',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.rozvrh'],
    opravneni: { vse: ['rozvrh.zobrazit'], nektere: [], pole: { 'akce:doplnit_smenu': 'rozvrh.upravit' } },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'mesic',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'tento', nazev: 'Tento' }, { id: 'pristi', nazev: 'Příští' }],
        vychozi: 'tento',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/schedule?month → demand{datum:{reservations,guests}}
  {
    id: 'rozvrh.poptavka',
    oblast: 'rozvrh',
    nazev: 'Poptávka z rezervací',
    popis: 'Nejvytíženější dny podle potvrzených rezervací (počet rezervací a hostů) — ať se na ně naplánuje víc lidí.',
    ikona: 'trend',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.rozvrh'],
    opravneni: { vse: ['rozvrh.zobrazit'], nektere: [] },
    tarif: 'max',
    nastaveni: [
      {
        klic: 'mesic',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'tento', nazev: 'Tento' }, { id: 'pristi', nazev: 'Příští' }],
        vychozi: 'tento',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/timeoff → requests[{employeeName,fromDate,toDate,type,status}]
  {
    id: 'rozvrh.zadosti_volno',
    oblast: 'rozvrh',
    nazev: 'Žádosti o volno',
    popis: 'Čekající žádosti o volno se Schválit a Zamítnout a schválené volno, které ještě neskončilo.',
    ikona: 'sun',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.rozvrh'],
    opravneni: {
      vse: ['volno.zobrazit'],
      nektere: [],
      pole: { typ: 'volno.zobrazit', 'akce:schvalit_zamitnout': 'volno.schvalovat' },
    },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/shifts/offers → offers[{status,date,startTime,endTime,offeredByName,claimedByName}]
  {
    id: 'rozvrh.vymeny',
    oblast: 'rozvrh',
    nazev: 'Výměny směn',
    popis: 'Burza: nabídnuté směny k převzetí; pro vedení převzetí čekající na schválení.',
    ikona: 'handover',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.rozvrh', 'vedeni.moje_smeny', 'zamestnanec.moje_smeny'],
    opravneni: {
      vse: [],
      nektere: ['rozvrh.burza', 'rozvrh.vymeny_schvalovat'],
      pole: { 'akce:prevzit_nabidnout': 'rozvrh.burza', 'akce:schvalit': 'rozvrh.vymeny_schvalovat' },
    },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/schedule?month → shifts[{employeeId,employeeName,startTime,endTime}]; limit:
  // GET /api/schedule/rules → teamMaxHours, members[] (rozvrh.nastaveni)
  {
    id: 'rozvrh.hodiny_lidi',
    oblast: 'rozvrh',
    nazev: 'Naplánované hodiny',
    popis: 'Kolik hodin má kdo v měsíci naplánováno — a kdo se blíží limitu z pravidel generátoru.',
    ikona: 'clock',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.rozvrh'],
    opravneni: { vse: ['rozvrh.zobrazit'], nektere: [], pole: { limit_hodin: 'rozvrh.nastaveni' } },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'mesic',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'tento', nazev: 'Tento' }, { id: 'pristi', nazev: 'Příští' }],
        vychozi: 'tento',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/shifts?team=1&month → enabled, shifts[{employeeName,date,startTime,endTime,typeLabel,isMine}]
  {
    id: 'rozvrh.tym_nahled',
    oblast: 'rozvrh',
    nazev: 'Kdo má směnu',
    popis: 'Náhled rozvrhu týmu (jména a časy, bez sazeb) na dnes a týden.',
    ikona: 'users',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu', 'vedeni.moje_smeny', 'zamestnanec.moje_smeny', 'zamestnanec.dostupnost'],
    opravneni: { vse: ['rozvrh.nahled'], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'rozsah',
        nazev: 'Rozsah',
        typ: 'vyber',
        moznosti: [{ id: 'dnes', nazev: 'Dnes' }, { id: 'tyden', nazev: 'Týden' }],
        vychozi: 'tyden',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/availability?month=<příští> → null = nezadáno
  // Pozor: vlastní data; tablet ne
  {
    id: 'rozvrh.pripominka_dostupnosti',
    oblast: 'rozvrh',
    nazev: 'Zadej dostupnost',
    popis: 'Připomínka, že ještě nemáš zadanou dostupnost na příští měsíc.',
    ikona: 'bell',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu', 'vedeni.moje_smeny', 'zamestnanec.moje_smeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    kostra: { S: 'text', M: 'text' },
    stav: 'hotovo',
  },
];
