// Widgety oblasti „Sklad a výroba" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/sklad.tsx. Widget se stavem 'planovany' komponentu
// ještě nemá: nekreslí se ani nenabízí, dokud ho balík B3 v kole 69 nenapíše a nepřepne na 'hotovo'.
// Soubor patří balíku B3; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/inventory → [{name,quantity,unit,status,categoryId,madeInHouse,archived,approved}] (status
  // počítá server)
  // Pozor: Přehled dnes počítá i archivované položky a neschválené návrhy, Sklad je vynechává → čísla nesedí.
  // Filtrovat archived!=true && approved!=false.
  {
    id: 'sklad.dochazi',
    oblast: 'sklad',
    nazev: 'Docházející zásoby',
    popis: 'Co je kriticky málo a co dochází — s množstvím a proklikem do skladu.',
    ikona: 'box',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: [
      'vedeni.prehled',
      'zamestnanec.domu',
      'vedeni.sklad',
      'zamestnanec.sklad',
      'vedeni.togo',
      'kiosk.smena',
    ],
    opravneni: { vse: ['sklad.zobrazit'], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'kategorie',
        typ: 'zdroj',
        zdroj: 'sklad.kategorie',
        nazev: 'Kategorie',
        vychozi: null,
        prazdne: 'Celý sklad',
      },
      { klic: 'jen_kriticke', typ: 'prepinac', nazev: 'Jen kriticky málo', vychozi: false },
      { klic: 'vyroba', typ: 'prepinac', nazev: 'Včetně vlastní výroby', vychozi: false },
    ],
    kostra: { S: 'cislo', M: 'seznam', L: 'seznam' },
    stav: 'hotovo',
  },
  // Data: GET /api/inventory →
  // [{status,quantity,minQuantity,maxQuantity,supplier,buyFor[],madeInHouse,unitCost}]; GET /api/suppliers →
  // suppliers[]; množství: Inventory.suggestedAmount()
  {
    id: 'sklad.nakupni_seznam',
    oblast: 'sklad',
    nazev: 'Nákupní seznam',
    popis: 'Co objednat: pod limitem (kritické první) a suroviny chybějící na výrobu; návrh množství do maxima, seskupeno podle dodavatele; Objednat.',
    ikona: 'box',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.sklad'],
    opravneni: {
      vse: ['sklad.zobrazit'],
      nektere: [],
      pole: {
        odhad_ceny: 'sklad.ceny',
        'akce:sestavit_objednavku': 'nakup.vytvorit',
        'akce:odeslat_dodavateli': 'nakup.odeslat',
      },
    },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'dodavatel',
        nazev: 'Dodavatel',
        typ: 'zdroj',
        zdroj: 'dodavatele',
        vychozi: null,
        prazdne: 'Všichni dodavatelé',
      },
      { klic: 'jen_kriticke', nazev: 'Jen kriticky málo', typ: 'prepinac', vychozi: false },
    ],
    stav: 'planovany',
  },
  // Data: GET /api/finance?month → summary.stockValue (finance.zobrazit); nebo GET /api/inventory → Σ quantity ×
  // unitCost (sklad.ceny)
  // Backend: triviální pro M: vrátit stockTop, který /api/finance už počítá (route.ts:227-247) a zahazuje
  // Pozor: Sklad a Finance dnes počítají hodnotu jinak (Sklad bez načatých balení a včetně archivovaných).
  // Sjednotit na výpočet z /api/finance.
  {
    id: 'sklad.hodnota_zasob',
    oblast: 'sklad',
    nazev: 'Hodnota zásob',
    popis: 'Kolik peněz leží na regálech (i poměrem z načatých balení) a u větší velikosti tři nejdražší položky.',
    ikona: 'box',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.sklad', 'vedeni.finance'],
    opravneni: { vse: [], nektere: ['sklad.ceny', 'finance.zobrazit'] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/inventory →
  // [approved=false]{name,category,quantity,unit,submittedByName,description,photoUrl}
  {
    id: 'sklad.navrhy',
    oblast: 'sklad',
    nazev: 'Nové věci od týmu',
    popis: 'Položky zapsané týmem jako návrh (s fotkou, kdo a kolik) — Schválit / Zamítnout, i hromadně.',
    ikona: 'box',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.sklad'],
    opravneni: {
      vse: ['sklad.schvalovat'],
      nektere: [],
      pole: { 'akce:schvalit': 'sklad.schvalovat', 'akce:zamitnout': 'sklad.schvalovat' },
    },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/inventory/reports → reports[{items,note,status,author_name,created_at}]
  {
    id: 'sklad.hlaseni',
    oblast: 'sklad',
    nazev: 'Hlášení ze skladu',
    popis: 'Co tým nahlásil jako docházející / chybějící — Vyřízeno, nebo rovnou do nákupního seznamu.',
    ikona: 'box',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.sklad'],
    opravneni: { vse: ['sklad.hlaseni_vyridit'], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/orders → orders[{supplier,items[],status,createdAt,receivedAt,totalCost}]
  {
    id: 'sklad.objednavky',
    oblast: 'sklad',
    nazev: 'Objednávky u dodavatelů',
    popis: 'Objednávky čekající na příjem (kdy, u koho, položky) — Přijmout naskladní.',
    ikona: 'box',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.sklad'],
    opravneni: {
      vse: ['nakup.zobrazit'],
      nektere: [],
      pole: { totalcost: 'sklad.ceny', 'akce:prijmout_zrusit': 'nakup.prijmout' },
    },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/production → toMake[]; POST /api/inventory/{id}/produce
  {
    id: 'vyroba.k_vyrobe',
    oblast: 'sklad',
    nazev: 'K výrobě',
    popis: 'Co má směna vyrobit, v kolika dávkách a jestli jsou suroviny.',
    ikona: 'fire',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: [
      'vedeni.prehled',
      'zamestnanec.domu',
      'vedeni.sklad',
      'zamestnanec.sklad',
      'vedeni.togo',
      'vedeni.ukoly',
      'zamestnanec.ukoly',
      'kiosk.smena',
    ],
    opravneni: { vse: ['vyroba.vyrabet'], nektere: [] },
    tarif: 'max',
    stav: 'hotovo',
  },
  // Data: GET /api/inventory → [{unitCost,packageSize}]; GET /api/pos/usage →
  // usage{itemId:[{productName,amount}]}
  // Pozor: Bez sklad.ceny je unitCost maskovaný null → dnešní karta hlásí chybějící cenu u VŠECH surovin
  // (Provozní). Proto vyžaduje sklad.ceny.
  {
    id: 'sklad.chybi_udaje',
    oblast: 'sklad',
    nazev: 'Suroviny bez ceny nebo balení',
    popis: 'Suroviny, které kasa používá v recepturách, ale chybí jim cena nebo velikost balení — bez nich se nespočítá marže ani odpis z načatého balení.',
    ikona: 'box',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.sklad', 'vedeni.receptury'],
    opravneni: {
      vse: ['receptury.zobrazit', 'sklad.ceny'],
      nektere: [],
      pole: { 'akce:doplnit': ['sklad.upravit', 'sklad.ceny_upravit'] },
    },
    tarif: 'max',
    stav: 'planovany',
  },
  // Data: GET /api/inventory/log → [{itemName,oldQuantity,newQuantity,oldOpen,newOpen,note,userName,createdAt}]
  {
    id: 'sklad.posledni_pohyby',
    oblast: 'sklad',
    nazev: 'Poslední pohyby skladu',
    popis: 'Kdo kdy co odepsal, naskladnil nebo opravil (posledních 20 pohybů).',
    ikona: 'box',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.sklad'],
    opravneni: { vse: ['sklad.historie'], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'druh',
        nazev: 'Pohyby',
        typ: 'vyber',
        moznosti: [
          { id: 'vse', nazev: 'Vše' },
          { id: 'rucni', nazev: 'Ruční' },
          { id: 'prodej_z_kasy', nazev: 'Prodej z kasy' },
        ],
        vychozi: 'vse',
      },
    ],
    stav: 'planovany',
  },
  // Data: GET /api/stocktake → open{data[],createdAt}, history[{completedAt}]
  {
    id: 'sklad.inventura',
    oblast: 'sklad',
    nazev: 'Inventura',
    popis: 'Běží inventura? Kolik položek je spočítaných — Pokračovat v počítání. Jinak kdy byla poslední.',
    ikona: 'box',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.sklad', 'zamestnanec.sklad'],
    opravneni: {
      vse: ['inventura.pocitat'],
      nektere: [],
      pole: { 'akce:zahajit_zrusit': 'inventura.spravovat', 'akce:dokoncit': 'inventura.dokoncit' },
    },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: POST /api/inventory (NewStockEntry)
  {
    id: 'sklad.zapsat_novou',
    oblast: 'sklad',
    nazev: 'Zapsat novou věc',
    popis: 'Rychlá akce: přišlo zboží — vyfotit, napsat kolik; bez sklad.pridat jde jako návrh ke schválení.',
    ikona: 'box',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['zamestnanec.sklad', 'kiosk.smena'],
    opravneni: { vse: [], nektere: ['sklad.pridat', 'sklad.navrhnout'] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/inventory; POST /api/inventory/reports
  {
    id: 'sklad.nahlasit',
    oblast: 'sklad',
    nazev: 'Nahlásit chybějící',
    popis: 'Vyber, co dochází nebo chybí, a pošli hlášení vedení.',
    ikona: 'box',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['zamestnanec.sklad'],
    opravneni: { vse: ['sklad.hlasit'], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/inventory → [{categoryId,status}]; GET /api/inventory/categories → [{id,name,parentId}]
  {
    id: 'sklad.stav_kategorie',
    oblast: 'sklad',
    nazev: 'Stav kategorie',
    popis: 'Jedna kategorie skladu jako widget: kolik položek, kolik dochází, proklik rovnou do ní (jako dlaždice, ale živá).',
    ikona: 'box',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    vicekrat: true,
    maxInstanci: 6,
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.sklad', 'zamestnanec.sklad'],
    opravneni: { vse: ['sklad.zobrazit'], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'kategorie',
        nazev: 'Kategorie',
        typ: 'zdroj',
        zdroj: 'sklad.kategorie',
        vychozi: null,
        napoveda: 'Bez vybrané kategorie widget nic neukáže.',
      },
    ],
    stav: 'planovany',
  },
];
