// Widgety oblasti „Docházka" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/dochazka.tsx, výpočty v lib/dochazkaPrehled.ts.
// Soubor patří balíku B2; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
// V kole 69 jsou hotové všechny widgety oblasti.
//
// Ikony (kolo 69): katalog dal skoro všem `clock`; na Docházce je ve výchozím rozložení pět
// widgetů a ikona se nesmí opakovat (AK-19). Mzdy mají `coins`, Souhrn `chart`, Otevřené
// příchody `warning`, Dnes v podniku `calendar`; `clock` si nechaly Píchačky a nástroj.
//
// Souhrn hodin dostal volbu „Podle stránky" (a je výchozí): stránka Docházka má přepínač
// 7/30/90 dní a katalog u ní říká, že widgety s obdobím berou období ze stránky. S pevnými
// 30 dny by pod přepínačem na týden ukazoval měsíc.
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
    cil: { pohled: 'attendance' },
    stav: 'hotovo',
  },
  // Data: GET /api/attendance?days=1 → roster[{name,shiftStart,shiftEnd,openSince}]
  // Pozor: roster nese jen první směnu dne (LIMIT 1).
  {
    id: 'dochazka.dnes_v_podniku',
    oblast: 'dochazka',
    nazev: 'Dnes v podniku',
    popis: 'Plán proti skutečnosti: kdo má dnes směnu, kdo už přišel, kdo ještě ne (po začátku směny oranžově).',
    ikona: 'calendar',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'kiosk'],
    stranky: ['vedeni.prehled', 'vedeni.dochazka', 'vedeni.togo', 'kiosk.smena'],
    opravneni: { vse: [], nektere: ['dochazka.zobrazit', 'dochazka.tablet'] },
    tarif: 'zdarma',
    cil: { pohled: 'attendance' },
    stav: 'hotovo',
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
    cil: { pohled: 'attendance' },
    stav: 'hotovo',
  },
  // Data: GET /api/attendance?days=N → entries[] × roster.hourlyRate (lib/wages); GET /api/closings → tržby;
  // GET /api/teams → team.labor_target_pct
  {
    id: 'dochazka.mzdy_za_obdobi',
    oblast: 'dochazka',
    nazev: 'Mzdy za období',
    popis: 'Mzdové náklady za období Docházky a jejich podíl na tržbách proti cíli.',
    ikona: 'coins',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.dochazka', 'vedeni.finance'],
    opravneni: {
      vse: ['dochazka.zobrazit', 'finance.mzdy'],
      nektere: [],
      // Podíl potřebuje obojí (pole s polem klíčů znamená „kterýkoli"), proto dva
      // záznamy: tržby vidět a vidět je ze všech uzávěrek — bez zobrazit_vse
      // vrátí /api/closings jen vlastní uzávěrky a podíl by vyšel násobně vyšší.
      pole: { podil_na_trzbach: 'finance.trzby', podil_na_trzbach_vsechny_uzaverky: 'uzaverky.zobrazit_vse' },
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
    cil: { pohled: 'attendance' },
    stav: 'hotovo',
  },
  // Data: GET /api/attendance?days=N → entries[{employeeId,employeeName,clockIn,clockOut}], roster.hourlyRate
  // Kolo 10 (tresty, balík V): u člověka s pozdním příchodem „Dát trest za pozdní příchod" v „···" (tresty.udelit;
  // nevyřízený příchod podle GET /api/tresty/navrhy, klíč `pozde:<id záznamu>`).
  {
    id: 'dochazka.souhrn_hodin',
    oblast: 'dochazka',
    nazev: 'Souhrn hodin',
    popis: 'Odpracované hodiny a počet směn po lidech; se sazbami i výdělek.',
    ikona: 'chart',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.dochazka'],
    opravneni: { vse: ['dochazka.zobrazit'], nektere: [], pole: { kc_u_cloveka_razeni_nejvic_mzdy: 'finance.mzdy', 'akce:trest_za_pozde': 'tresty.udelit' } },
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
      {
        klic: 'razeni',
        nazev: 'Řadit',
        typ: 'vyber',
        moznosti: [{ id: 'hodiny', nazev: 'Odpracované hodiny' }, { id: 'mzda', nazev: 'Mzda' }, { id: 'jmeno', nazev: 'Jméno' }],
        vychozi: 'hodiny',
      },
    ],
    cil: { pohled: 'attendance' },
    stav: 'hotovo',
  },
  // Data: GET /api/attendance?days=1 → roster[{openSince,shiftEnd}] (openSince && teď > shiftEnd)
  // Pozor: Server zapomenuté odchody v noci zavírá sám (autoCloseEntry); widget upozorní dřív.
  {
    id: 'dochazka.dlouhe_prichody',
    oblast: 'dochazka',
    nazev: 'Otevřené příchody',
    popis: 'Kdo je napíchnutý déle, než měl plánovanou směnu (typicky zapomenutý odchod) — s Ukončit.',
    ikona: 'warning',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.dochazka'],
    opravneni: { vse: ['dochazka.zobrazit'], nektere: [], pole: { 'akce:ukoncit': 'dochazka.upravit' } },
    tarif: 'zdarma',
    cil: { pohled: 'attendance' },
    stav: 'hotovo',
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
    cil: { pohled: 'attendance' },
    stav: 'hotovo',
  },
  // Data: dnes jen po dnech: GET /api/closings/wage?date → wage{ms,rate,earned}
  // Backend: triviální: /api/closings/wage?month=YYYY-MM (součet) nebo vlastní sazba ve větvi zaměstnance
  // /api/attendance, když má finance.moje_mzda
  {
    id: 'moje.vydelek',
    oblast: 'dochazka',
    nazev: 'Můj výdělek',
    popis: 'Kolik jsem si vydělal: hodiny × vlastní sazba, prémie a srážky; tento nebo minulý měsíc.',
    ikona: 'coins',
    // Kolo 5 (vzor Homebase „Earnings"): M s rozpadem, L i se seznamem prémií; měsíc podle nastavení.
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu', 'vedeni.moje_smeny', 'zamestnanec.moje_smeny'],
    opravneni: { vse: [], nektere: ['finance.moje_mzda', 'finance.mzdy'] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'mesic',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'tento', nazev: 'Tento' }, { id: 'minuly', nazev: 'Minulý' }],
        vychozi: 'tento',
      },
    ],
    // Klepnutí na Přehledu vede na Moje směny, kde je výdělek spolu s odpracovanými hodinami.
    cil: { pohled: 'my-shifts' },
    stav: 'hotovo',
  },
  // Data: GET /api/attendance → entries[{clockIn,clockOut,source,note,updatedBy}] — stejná adresa jako Odpracováno
  // a Můj výdělek (zaměstnanec dostane vlastní záznamy za 70 dní), výpočet lib/dochazkaPrehled.radkyMojeDochazky.
  // Kolo 7 (vzor Homebase / 7shifts „My timesheet"): den na řádek, zapomenutý odchod a „ručně" (vedení opravilo).
  // Ikona `clipboard`: na Mých směnách ani na Domů ve výchozím rozložení není (AK-19).
  {
    id: 'dochazka.moje_zaznamy',
    oblast: 'dochazka',
    nazev: 'Moje docházka',
    popis: 'Tvoje příchody a odchody po dnech za měsíc.',
    ikona: 'clipboard',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['zamestnanec'],
    stranky: ['zamestnanec.moje_smeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'mesic',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'tento', nazev: 'Tento' }, { id: 'minuly', nazev: 'Minulý' }],
        vychozi: 'tento',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/attendance?days=N (hodiny, sazby, prémie), GET /api/closings (dýško), GET /api/payroll?od&do
  // (z kasy, vyplaceno, zámky, smlouvy, pravidla). Zápisy: /api/payroll/payments, /locks, /rules, /smlouva.
  // Kolo 8 (R8-1, vzor 7shifts „Worked Hours & Wages", Lightspeed „Labor report"): řádek na člověka, na počítači
  // tabulka s řazením a Celkem, na telefonu karty; CSV pro účetní; „Vyplaceno" a „Uzavřít období"; Pravidla výplat.
  // Ikona `receipt`: na Docházce ve výchozím rozložení není (AK-19).
  {
    id: 'dochazka.vyplatni_listina',
    oblast: 'dochazka',
    nazev: 'Výplatní listina',
    popis: 'Řádek na člověka: hodiny, mzda, příplatky, dýško, prémie, co už odešlo z kasy a kolik doplatit; CSV pro účetní, Vyplaceno a uzavření období.',
    ikona: 'receipt',
    velikosti: ['L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.dochazka', 'vedeni.finance'],
    opravneni: {
      vse: ['dochazka.zobrazit'],
      nektere: [],
      pole: {
        kc_mzda_z_kasy_doplatit: 'finance.mzdy',
        dysko: ['finance.trzby', 'uzaverky.zobrazit_vse'],
        'akce:csv': 'dochazka.exportovat',
        'akce:vyplaceno': 'finance.sazby_upravit',
        'akce:pravidla': 'finance.sazby_upravit',
      },
    },
    tarif: 'zdarma',
    kostra: { L: 'seznam' },
    cil: { pohled: 'attendance' },
    stav: 'hotovo',
  },
];
