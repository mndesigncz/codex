// Widgety oblasti „Docházka" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/dochazka.tsx. Widget se stavem 'planovany' komponentu
// ještě nemá: nekreslí se ani nenabízí, dokud ho balík B2 v kole 69 nenapíše a nepřepne na 'hotovo'.
// Soubor patří balíku B2; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/attendance?days=1 → roster[{id,name,avatar,openSince,shiftStart,shiftEnd}]
  // Pozor: tablet (dochazka.tablet) dostane roster bez sazeb
  {
    id: 'dochazka.prave_na_smene',
    oblast: 'dochazka',
    nazev: 'Právě na směně',
    popis: 'Kdo je zrovna napíchnutý a od kdy.',
    ikona: 'location',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'kiosk'],
    stranky: ['vedeni.prehled', 'vedeni.rozvrh', 'vedeni.dochazka', 'vedeni.tym'],
    opravneni: {
      vse: [],
      nektere: ['dochazka.zobrazit', 'dochazka.tablet'],
      pole: { 'akce:ukoncit': 'dochazka.upravit' },
    },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/attendance?days=1 → roster[{name,shiftStart,shiftEnd,openSince}]
  // Pozor: roster nese jen první směnu dne (LIMIT 1).
  {
    id: 'dochazka.dnes_v_podniku',
    oblast: 'dochazka',
    nazev: 'Dnes v podniku',
    popis: 'Plán proti skutečnosti: kdo má dnes směnu, kdo už přišel, kdo ještě ne (po začátku směny oranžově).',
    ikona: 'clock',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'kiosk'],
    stranky: ['vedeni.prehled', 'vedeni.dochazka', 'vedeni.togo', 'kiosk.smena'],
    opravneni: { vse: [], nektere: ['dochazka.zobrazit', 'dochazka.tablet'] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/attendance → roster[me].openSince; POST /api/attendance {employeeId, action: in|out}
  // Pozor: vlastní data — každý člen
  {
    id: 'dochazka.moje_pichacky',
    oblast: 'dochazka',
    nazev: 'Píchačky',
    popis: 'Příchod a odchod na jedno ťuknutí a čas tvé směny.',
    ikona: 'clock',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.prehled', 'zamestnanec.domu', 'vedeni.dochazka'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    kostra: { S: 'text', M: 'text' },
    stav: 'hotovo',
  },
  // Data: GET /api/attendance?days=N → entries[] × roster.hourlyRate (lib/wages); GET /api/closings → tržby;
  // GET /api/teams → team.labor_target_pct
  {
    id: 'dochazka.mzdy_za_obdobi',
    oblast: 'dochazka',
    nazev: 'Mzdy za období',
    popis: 'Mzdové náklady za období Docházky a jejich podíl na tržbách proti cíli.',
    ikona: 'clock',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.dochazka', 'vedeni.finance'],
    opravneni: {
      vse: ['dochazka.zobrazit', 'finance.mzdy'],
      nektere: [],
      pole: { podil_na_trzbach: 'finance.trzby' },
    },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [
          { id: 'stranka', nazev: 'Podle stránky' },
          { id: '7_dni', nazev: '7 dní' },
          { id: '30_dni', nazev: '30 dní' },
          { id: '90_dni', nazev: '90 dní' },
        ],
        vychozi: 'stranka',
      },
    ],
    stav: 'planovany',
  },
  // Data: GET /api/attendance?days=N → entries[{employeeId,employeeName,clockIn,clockOut}], roster.hourlyRate
  {
    id: 'dochazka.souhrn_hodin',
    oblast: 'dochazka',
    nazev: 'Souhrn hodin',
    popis: 'Odpracované hodiny a počet směn po lidech; se sazbami i výdělek.',
    ikona: 'clock',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.dochazka'],
    opravneni: { vse: ['dochazka.zobrazit'], nektere: [], pole: { kc_u_cloveka_razeni_nejvic_mzdy: 'finance.mzdy' } },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [
          { id: '7_dni', nazev: '7 dní' },
          { id: '30_dni', nazev: '30 dní' },
          { id: '90_dni', nazev: '90 dní' },
        ],
        vychozi: '30_dni',
      },
      {
        klic: 'razeni',
        nazev: 'Řadit',
        typ: 'vyber',
        moznosti: [{ id: 'hodiny', nazev: 'Hodiny' }, { id: 'mzda', nazev: 'Mzda' }, { id: 'jmeno', nazev: 'Jméno' }],
        vychozi: 'hodiny',
      },
    ],
    stav: 'planovany',
  },
  // Data: GET /api/attendance?days=1 → roster[{openSince,shiftEnd}] (openSince && teď > shiftEnd)
  // Pozor: Server zapomenuté odchody v noci zavírá sám (autoCloseEntry); widget upozorní dřív.
  {
    id: 'dochazka.dlouhe_prichody',
    oblast: 'dochazka',
    nazev: 'Otevřené příchody',
    popis: 'Kdo je napíchnutý déle, než měl plánovanou směnu (typicky zapomenutý odchod) — s Ukončit.',
    ikona: 'clock',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.dochazka'],
    opravneni: { vse: ['dochazka.zobrazit'], nektere: [], pole: { 'akce:ukoncit': 'dochazka.upravit' } },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/attendance → entries[{clockIn,clockOut}] (posledních 60 dní)
  // Pozor: Větev zaměstnance v /api/attendance nefiltruje team_id → sčítá hodiny ze všech podniků, kde člověk
  // pracuje.
  // Pozor: vlastní data
  {
    id: 'dochazka.moje_odpracovano',
    oblast: 'dochazka',
    nazev: 'Odpracováno',
    popis: 'Kolik hodin máš tento měsíc odpracováno podle píchaček.',
    ikona: 'chart',
    velikosti: ['S'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu', 'vedeni.moje_smeny', 'zamestnanec.moje_smeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: dnes jen po dnech: GET /api/closings/wage?date → wage{ms,rate,earned}
  // Backend: triviální: /api/closings/wage?month=YYYY-MM (součet) nebo vlastní sazba ve větvi zaměstnance
  // /api/attendance, když má finance.moje_mzda
  {
    id: 'moje.vydelek',
    oblast: 'dochazka',
    nazev: 'Můj výdělek',
    popis: 'Kolik jsem si tento měsíc vydělal: hodiny × vlastní sazba.',
    ikona: 'clock',
    velikosti: ['S'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu', 'vedeni.moje_smeny', 'zamestnanec.moje_smeny'],
    opravneni: { vse: [], nektere: ['finance.moje_mzda', 'finance.mzdy'] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
];
