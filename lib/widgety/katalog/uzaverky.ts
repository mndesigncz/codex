// Widgety oblasti „Uzávěrky" — metadata bez Reactu (kolo 68, doplněno v kole 69).
//
// Komponenty jsou v components/widgety/oblasti/uzaverky.tsx, výpočty v lib/uzaverkyPrehled.ts.
// Soubor patří balíku B5a; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
// Kolo 69: všech deset widgetů má komponentu (stav 'hotovo'). Ikony už nejsou všude
// „trend" — v galerii se jinak nedaly od sebe rozeznat.
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/closings → missingClosings[{date,employees[{id,name,avatar}]}] (posledních 30 dní); měsíc:
  // GET /api/closings/calendar?month → days{datum:{missing,onShift[]}}
  // Pozor: /api/closings bere směny do dneška včetně, kalendář až do včerejška — widget má dnešek vynechat
  // (jinak svítí za běžící směnu).
  {
    id: 'uzaverky.chybejici',
    oblast: 'uzaverky',
    nazev: 'Chybějící uzávěrky',
    popis: 'Dny, kdy někdo pracoval, ale uzávěrka chybí — s lidmi na směně a tlačítkem Vyplnit.',
    ikona: 'warning',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.uzaverky'],
    opravneni: {
      vse: ['uzaverky.zobrazit_vse'],
      nektere: [],
      pole: { 'akce:vyplnit_za_smenu': 'uzaverky.za_jineho' },
    },
    tarif: 'zdarma',
    nastaveni: [{ klic: 'dnes', nazev: 'Počítat i dnešek', typ: 'prepinac', vychozi: false }],
    kostra: { S: 'cislo', M: 'seznam', L: 'seznam' },
    stav: 'hotovo',
  },
  // Data: GET /api/closings → closings[approved=false && !covered_by]{author_name,date,…}; rozdíl: lib/closing
  // cashDifference(c)
  {
    id: 'uzaverky.ke_schvaleni',
    oblast: 'uzaverky',
    nazev: 'Uzávěrky ke schválení',
    popis: 'Uzávěrky odeslané bez směny, které čekají na schválení — autor, den, rozdíl kasy, Schválit.',
    ikona: 'inbox',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.uzaverky'],
    opravneni: {
      vse: ['uzaverky.zobrazit_vse'],
      nektere: [],
      pole: { rozdil_kasy: 'finance.trzby', 'akce:schvalit': 'uzaverky.schvalovat', 'akce:smazat': 'uzaverky.mazat' },
    },
    tarif: 'zdarma',
    kostra: { S: 'cislo', M: 'seznam' },
    stav: 'hotovo',
  },
  // Data: GET /api/closings →
  // closings[]{cash_revenue,card_revenue,tips,self_payout,cash_removed,final_removal,closing_cash,…},
  // payDailyCash
  // Pozor: bez finance.trzby API tržbová pole maže (trzbaSkryta) — widget se nesmí ukázat (dnes ukazuje „0 Kč")
  {
    id: 'uzaverky.souhrn',
    oblast: 'uzaverky',
    nazev: 'Souhrn uzávěrek',
    popis: 'Tržba celkem (hotově/kartou), odvedeno a odloženo, vyplaceno hotově nebo spropitné, rozdíl kasy — za zvolené období.',
    ikona: 'coins',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.uzaverky'],
    opravneni: { vse: ['uzaverky.zobrazit_vse', 'finance.trzby'], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [
          { id: 'tento_mesic', nazev: 'Tento měsíc' },
          { id: 'minuly_mesic', nazev: 'Minulý měsíc' },
          { id: 'vse', nazev: 'Vše' },
        ],
        vychozi: 'tento_mesic',
      },
      {
        klic: 'metrika',
        nazev: 'Metrika (S)',
        typ: 'vyber',
        moznosti: [
          { id: 'trzba', nazev: 'Tržba' },
          { id: 'odvedeno', nazev: 'Odvedeno' },
          { id: 'vyplaceno', nazev: 'Vyplaceno' },
          { id: 'spropitne', nazev: 'Spropitné' },
          { id: 'rozdil_kasy', nazev: 'Rozdíl kasy' },
        ],
        vychozi: 'trzba',
      },
    ],
    kostra: { S: 'cislo', M: 'cislo', L: 'cislo' },
    stav: 'hotovo',
  },
  // Data: GET /api/closings → closings[] → lib/closing cashDifference() po uzávěrce (ne covered_by); měsíc
  // alternativně: GET /api/finance?month → summary.diffSum, summary.diffAbs
  {
    id: 'uzaverky.rozdil_kasy',
    oblast: 'uzaverky',
    nazev: 'Rozdíl pokladny',
    popis: 'Manko / přebytek za týden nebo měsíc: součet, součet absolutních rozdílů a dny, kde kasa nesedí nad práh.',
    ikona: 'swap',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.uzaverky', 'vedeni.finance'],
    opravneni: {
      vse: ['uzaverky.zobrazit_vse', 'finance.trzby'],
      nektere: [],
      pole: { jmeno_autora_u_rozdilu: 'finance.trzby_lide' },
    },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [{ id: '7_dni', nazev: '7 dní' }, { id: 'tento_mesic', nazev: 'Tento měsíc' }],
        vychozi: '7_dni',
      },
      {
        klic: 'prah',
        nazev: 'Práh rozdílu',
        typ: 'cislo',
        min: 0,
        max: 100000,
        krok: 10,
        vychozi: 50,
        napoveda: 'Částka v měně podniku.',
      },
    ],
    kostra: { S: 'cislo', M: 'cislo' },
    stav: 'hotovo',
  },
  // Data: GET /api/closings → closings[] (součet cash_revenue+card_revenue po dnech)
  {
    id: 'uzaverky.trendy',
    oblast: 'uzaverky',
    nazev: 'Trendy tržeb',
    popis: 'Tento týden proti stejným dnům minulého týdne, nejsilnější den v týdnu, rekordní den.',
    ikona: 'chart',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.uzaverky'],
    opravneni: { vse: ['uzaverky.zobrazit_vse', 'finance.trzby'], nektere: [] },
    tarif: 'pro',
    kostra: { M: 'cislo', L: 'cislo' },
    stav: 'hotovo',
  },
  // Data: doporučený zdroj: GET /api/finance?month → summary{revenue,purchases,wagesWorked,wagesCash,gross};
  // dnešní zdroj: GET /api/closings + GET /api/attendance?days=180 (entries × roster.hourlyRate, lib/wages) +
  // GET /api/orders (received.totalCost); cíl: GET /api/teams → team.labor_target_pct
  // Pozor: Dnes počítá „nákupy" jen z přijatých objednávek, Finance z účtenek + objednávek + výdajů z kasy → dvě
  // různá čísla za týž měsíc. Widget má brát /api/finance.
  {
    id: 'uzaverky.mesic_v_cislech',
    oblast: 'uzaverky',
    nazev: 'Měsíc v číslech',
    popis: 'Tržby × mzdové náklady × nákupy = orientační provozní výsledek, podíl mezd proti cíli.',
    ikona: 'trend',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.uzaverky'],
    opravneni: { vse: ['finance.zobrazit', 'finance.mzdy'], nektere: [] },
    tarif: 'pro',
    nastaveni: [
      {
        klic: 'mesic',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'tento', nazev: 'Tento' }, { id: 'minuly', nazev: 'Minulý' }],
        vychozi: 'tento',
      },
    ],
    kostra: { M: 'cislo', L: 'cislo' },
    stav: 'hotovo',
  },
  // Data: GET /api/closings/calendar?month[&scope=me] →
  // days{datum:{onShift[],closedBy[],hasClosing,missing,revenue?}}, selfOnly
  // Pozor: vlastní dny každý; tým s uzaverky.zobrazit_vse; tržba dne jen s finance.trzby; tablet dostane prázdno
  {
    id: 'uzaverky.kalendar',
    oblast: 'uzaverky',
    nazev: 'Kalendář uzávěrek',
    popis: 'Měsíc: kdo pracoval, kdo zavřel, kde chybí a co čeká; s přístupem k tržbám i tržba dne.',
    ikona: 'calendarCheck',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.rozvrh', 'vedeni.moje_smeny', 'zamestnanec.moje_smeny', 'vedeni.uzaverky'],
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
      {
        klic: 'rozsah',
        nazev: 'Čí dny',
        typ: 'vyber',
        moznosti: [{ id: 'moje', nazev: 'Moje' }, { id: 'tym', nazev: 'Tým', opravneni: 'uzaverky.zobrazit_vse' }],
        vychozi: 'tym',
      },
    ],
    kostra: { M: 'graf', L: 'graf' },
    stav: 'hotovo',
  },
  // Data: GET /api/closings/handover → handover{todo,runningOut,message}, date, authorName
  {
    id: 'uzaverky.predavka',
    oblast: 'uzaverky',
    nazev: 'Předávka',
    popis: 'Co ti nechala minulá směna: co dodělat, co dochází a vzkaz.',
    ikona: 'handover',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['zamestnanec.domu', 'vedeni.uzaverky', 'zamestnanec.uzaverka', 'kiosk.smena'],
    opravneni: { vse: ['uzaverky.predavka'], nektere: [] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/closings → eligibleShifts[{id,date,startTime,endTime}]
  {
    id: 'uzaverky.moje_uzaverka',
    oblast: 'uzaverky',
    nazev: 'Moje uzávěrka',
    popis: 'Připomene uzávěrku z tvé směny a vede rovnou k vyplnění.',
    ikona: 'coins',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu', 'zamestnanec.uzaverka'],
    opravneni: { vse: ['uzaverky.vytvorit'], nektere: [] },
    tarif: 'zdarma',
    kostra: { S: 'cislo', M: 'text' },
    stav: 'hotovo',
  },
  // Data: GET /api/closings → closings[] (bez uzaverky.zobrazit_vse jen vlastní)
  {
    id: 'uzaverky.moje_historie',
    oblast: 'uzaverky',
    nazev: 'Moje uzávěrky',
    popis: 'Poslední vlastní uzávěrky: tržba hotově/kartou, odloženo, výplata, rozdíl.',
    ikona: 'clock',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['zamestnanec'],
    stranky: ['zamestnanec.uzaverka'],
    opravneni: { vse: ['uzaverky.vytvorit'], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'pocet',
        nazev: 'Kolik řádků',
        typ: 'vyber',
        moznosti: [{ id: '3', nazev: '3' }, { id: '5', nazev: '5' }, { id: '10', nazev: '10' }],
        vychozi: '3',
      },
    ],
    stav: 'hotovo',
  },
];
