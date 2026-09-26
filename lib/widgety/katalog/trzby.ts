// Widgety oblasti „Tržby a pokladna" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/trzby.tsx. Soubor patří balíku B5b; převedeno
// z katalogu widgetů jednorázovým skriptem (spec §2.2), v kole 69 jsou hotové všechny widgety oblasti.
//
// Ikony (kolo 69): katalog dal celé oblasti `receipt` a na Financích i v TO GO by se ve výchozím
// rozložení opakovala (AK-19). Každý widget má proto vlastní — podle toho, co ukazuje (graf po dnech
// `chart`, hodiny `sun`, platby `card`…); `receipt` zůstává jen Pokladně dnes.
//
// Období („dnes", „7 dní"…) se počítá v pražském dni (lib/pragueTime), ne v hodinách prohlížeče.
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/pos/summary?date=<dnes> → connected, placeName, total, bills, cash, card, other, tips
  // Pozor: API pustí dnešek i s uzaverky.vytvorit (kvůli uzávěrce) — widget MUSÍ chtít finance.trzby, jinak ho
  // vidí Provozní
  {
    id: 'pokladna.dnes',
    oblast: 'trzby',
    nazev: 'Pokladna dnes',
    popis: 'Dnešní tržba z pokladny: celkem, hotově, kartou a spropitné.',
    ikona: 'receipt',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.uzaverky', 'vedeni.togo'],
    opravneni: { vse: ['finance.trzby'], nektere: [] },
    tarif: 'max',
    kostra: { S: 'cislo', M: 'cislo' },
    muzeInkoust: true,
    stav: 'hotovo',
  },
  // Data: GET /api/pos/daily?from&to → totals{total,bills,cash,card,tips,methods,avgBill}, notes[], lastSyncAt
  // Pozor: L velikost je dnešní LiveRevenue; menší části jsou samostatné widgety níž (trzby.*).
  {
    id: 'pokladna.zive',
    oblast: 'trzby',
    nazev: 'Živě z pokladny',
    popis: 'Živý pohled na zvolené období: tržba, hotově, kartou, spropitné, způsoby platby a poctivé poznámky (chybějící ceny, refundace, nesesynchronizované účtenky). Dnešek se obnovuje po 2 min.',
    ikona: 'play',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.finance'],
    opravneni: { vse: ['finance.trzby'], nektere: [], pole: { po_obsluze: 'finance.trzby_lide' } },
    tarif: 'max',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [
          { id: 'dnes', nazev: 'Dnes' },
          { id: 'vcera', nazev: 'Včera' },
          { id: '7_dni', nazev: '7 dní' },
          { id: '30_dni', nazev: '30 dní' },
        ],
        vychozi: 'dnes',
      },
    ],
    stav: 'hotovo',
  },
  // Data: pokladna: GET /api/pos/daily?from&to → days[{day,total,bills}]; uzávěrky:
  // GET /api/closings/calendar?month → days{datum:{revenue}} (jen s finance.trzby + uzaverky.zobrazit_vse)
  {
    id: 'trzby.po_dnech',
    oblast: 'trzby',
    nazev: 'Tržba po dnech',
    popis: 'Sloupcový graf tržby po dnech se zvýrazněným rekordem a průměrem. Zdroj pokladna, nebo uzávěrky (funguje i bez pokladny).',
    ikona: 'chart',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.uzaverky', 'vedeni.finance', 'vedeni.togo'],
    opravneni: { vse: ['finance.trzby'], nektere: [], pole: { zdroj_uzaverky: 'uzaverky.zobrazit_vse' } },
    kostra: { M: 'graf', L: 'graf' },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [
          { id: '7_dni', nazev: '7 dní' },
          { id: '14_dni', nazev: '14 dní' },
          { id: '30_dni', nazev: '30 dní' },
          { id: 'tento_mesic', nazev: 'Tento měsíc' },
        ],
        vychozi: '7_dni',
      },
      {
        klic: 'zdroj',
        nazev: 'Zdroj',
        typ: 'vyber',
        tarif: 'max',
        napoveda: 'Bez pokladny se tržba bere z uzávěrek.',
        moznosti: [{ id: 'pokladna', nazev: 'Pokladna' }, { id: 'uzaverky', nazev: 'Uzávěrky' }],
        vychozi: 'pokladna',
      },
    ],
    stav: 'hotovo',
  },
  // Data: období: GET /api/pos/daily?from&to → hours[24]; měsíc: GET /api/pos/insights?month → hours[24],
  // staff[24], staffing[], staffingAdvice[]
  {
    id: 'trzby.hodiny',
    oblast: 'trzby',
    nazev: 'Špičky během dne',
    popis: 'Tržba po hodinách; v měsíčním režimu s obsazeností (kolik lidí bylo na směně) a radami, kde chybí nebo přebývá obsluha.',
    ikona: 'sun',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.uzaverky', 'vedeni.finance'],
    opravneni: {
      vse: ['finance.trzby'],
      nektere: [],
      pole: { obsazeni_a_rady: 'finance.analyza', prumerna_sazba_v_rade: 'finance.mzdy' },
    },
    kostra: { M: 'graf', L: 'graf' },
    tarif: 'max',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [
          { id: 'dnes', nazev: 'Dnes' },
          { id: '7_dni', nazev: '7 dní' },
          { id: '30_dni', nazev: '30 dní' },
          { id: 'mesic_s_obsazenim', nazev: 'Měsíc s obsazením' },
        ],
        vychozi: '7_dni',
      },
    ],
    stav: 'hotovo',
  },
  // Data: období: GET /api/pos/daily?from&to → items[{name,category,qty,revenue}]; měsíc s marží:
  // GET /api/pos/margins?month → items[{name,qty,revenue,cost,marginPct}]
  {
    id: 'trzby.top_produkty',
    oblast: 'trzby',
    nazev: 'Top produkty',
    popis: 'Co se nejvíc prodává — podle kusů nebo tržby; s oprávněním na marže i marže a náklad na suroviny.',
    ikona: 'award',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.receptury', 'vedeni.menu', 'vedeni.finance'],
    opravneni: { vse: ['finance.trzby'], nektere: [], pole: { marze_naklad: 'finance.marze' } },
    tarif: 'max',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [
          { id: 'dnes', nazev: 'Dnes' },
          { id: '7_dni', nazev: '7 dní' },
          { id: '30_dni', nazev: '30 dní' },
          { id: 'mesic', nazev: 'Měsíc' },
        ],
        vychozi: '7_dni',
      },
      {
        klic: 'razeni',
        nazev: 'Řadit podle',
        typ: 'vyber',
        moznosti: [{ id: 'kusy', nazev: 'Kusy' }, { id: 'trzba', nazev: 'Tržba' }, { id: 'marze', nazev: 'Marže' }],
        vychozi: 'kusy',
      },
      {
        klic: 'pocet',
        nazev: 'Kolik řádků',
        typ: 'vyber',
        moznosti: [{ id: '3', nazev: '3' }, { id: '5', nazev: '5' }, { id: '10', nazev: '10' }],
        vychozi: '5',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/pos/daily?from&to → byPerson[{name,total,bills}]
  {
    id: 'trzby.po_obsluze',
    oblast: 'trzby',
    nazev: 'Tržby po obsluze',
    popis: 'Kdo kolik namarkoval (tržba, účtenky, podíl) za období.',
    ikona: 'user',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.uzaverky', 'vedeni.finance'],
    opravneni: { vse: ['finance.trzby', 'finance.trzby_lide'], nektere: [] },
    tarif: 'max',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [
          { id: 'dnes', nazev: 'Dnes' },
          { id: 'vcera', nazev: 'Včera' },
          { id: '7_dni', nazev: '7 dní' },
          { id: '30_dni', nazev: '30 dní' },
        ],
        vychozi: 'dnes',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/pos/daily?from&to → totals{cash,card,other,methods[{label,amount}],tips,tipsCash,tipsCard}
  {
    id: 'trzby.platby',
    oblast: 'trzby',
    nazev: 'Platby a spropitné',
    popis: 'Hotově / kartou / ostatní (stravenky, kredit…) a spropitné rozdělené na hotovost a kartu.',
    ikona: 'card',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.finance'],
    opravneni: { vse: ['finance.trzby'], nektere: [] },
    tarif: 'max',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [
          { id: 'dnes', nazev: 'Dnes' },
          { id: 'vcera', nazev: 'Včera' },
          { id: '7_dni', nazev: '7 dní' },
          { id: '30_dni', nazev: '30 dní' },
        ],
        vychozi: 'dnes',
      },
    ],
    stav: 'hotovo',
  },
  // Data: období: GET /api/pos/daily → totals.avgBill, totals.bills; měsíc: GET /api/pos/insights?month →
  // avgBill, avgPersons
  {
    id: 'trzby.prumerna_uctenka',
    oblast: 'trzby',
    nazev: 'Průměrná účtenka',
    popis: 'Průměrná útrata na účtenku (a v měsíci i počet osob na účtenku).',
    ikona: 'coins',
    velikosti: ['S'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.uzaverky', 'vedeni.finance'],
    opravneni: { vse: ['finance.trzby'], nektere: [], pole: { mesic: 'finance.analyza' } },
    tarif: 'max',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [{ id: 'dnes', nazev: 'Dnes' }, { id: '7_dni', nazev: '7 dní' }, { id: '30_dni', nazev: '30 dní' }],
        vychozi: '7_dni',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/pos/daily?from&to → days[{day,total,declared,diff,closings}]; měsíc:
  // GET /api/pos/insights?month → reconcile{days[],totals{comparedDays,offDays,netDiff},insights[]}
  {
    id: 'trzby.kasa_vs_uzaverky',
    oblast: 'trzby',
    nazev: 'Kasa proti uzávěrkám',
    popis: 'Den po dni: co prošlo pokladnou proti tomu, co lidé napočítali v uzávěrce; dny s rozdílem nad práh a dny s tržbou bez uzávěrky.',
    ikona: 'swap',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.uzaverky'],
    opravneni: {
      vse: ['finance.trzby'],
      nektere: [],
      pole: { mesicni_rozbor: 'finance.analyza', jmena_u_rozdilu: 'finance.trzby_lide' },
    },
    tarif: 'max',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [
          { id: '7_dni', nazev: '7 dní' },
          { id: '30_dni', nazev: '30 dní' },
          { id: 'mesic', nazev: 'Měsíc' },
        ],
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
    stav: 'hotovo',
  },
  // Data: GET /api/pos/status → connected, placeName, lastSyncAt, lastError, itemsPending, billsCount, lastDay
  {
    id: 'pokladna.stav',
    oblast: 'trzby',
    nazev: 'Stav pokladny',
    popis: 'Je pokladna napojená, kdy proběhla synchronizace, kolik účtenek čeká na položky, poslední chyba.',
    ikona: 'refresh',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    // Kolo 69: doporučený na Financích — čísla z pokladny tam dávají smysl jen s vědomím, kdy
    // proběhla poslední synchronizace.
    stranky: ['vedeni.finance'],
    opravneni: {
      vse: ['pokladna.stav'],
      nektere: [],
      pole: { 'akce:synchronizovat_ted': 'pokladna.synchronizovat' },
    },
    tarif: 'max',
    stav: 'hotovo',
  },
];
