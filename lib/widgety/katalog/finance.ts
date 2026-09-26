// Widgety oblasti „Finance" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/finance.tsx. Widget se stavem 'planovany' komponentu
// ještě nemá: nekreslí se ani nenabízí, dokud ho balík B5b v kole 69 nenapíše a nepřepne na 'hotovo'.
// Soubor patří balíku B5b; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/finance?month →
  // summary{revenue,prevRevenue,closingsCount,purchases,wagesCash,wagesWorked,gross,mzdySkryte}
  {
    id: 'finance.souhrn_mesice',
    oblast: 'finance',
    nazev: 'Souhrn měsíce',
    popis: 'Tržby (± % proti minulému měsíci), nákupy a výdaje, mzdy, hrubý výsledek.',
    ikona: 'coins',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.finance'],
    opravneni: { vse: ['finance.zobrazit'], nektere: [], pole: { mzdy_a_vysledek_po_mzdach: 'finance.mzdy' } },
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
        klic: 'metrika',
        nazev: 'Metrika (S)',
        typ: 'vyber',
        moznosti: [
          { id: 'trzby', nazev: 'Tržby' },
          { id: 'nakupy', nazev: 'Nákupy' },
          { id: 'mzdy', nazev: 'Mzdy' },
          { id: 'vysledek', nazev: 'Výsledek' },
        ],
        vychozi: 'trzby',
      },
    ],
    stav: 'planovany',
  },
  // Data: GET /api/finance?month → summary.revenue, summary.wagesWorked, summary.wagesCash, summary.prevRevenue;
  // GET /api/teams → team.labor_target_pct
  {
    id: 'finance.trzby_vs_mzdy',
    oblast: 'finance',
    nazev: 'Tržby vs. mzdy',
    popis: 'Podíl mezd na tržbách proti cíli podniku (zelená pod cílem, červená nad).',
    ikona: 'coins',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.dochazka', 'vedeni.finance'],
    opravneni: { vse: ['finance.zobrazit', 'finance.mzdy'], nektere: [] },
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
    stav: 'planovany',
  },
  // Data: GET /api/finance?month → ledger[{kind,amount}], summary{wagesCash,wagesWorked,stockValue}
  {
    id: 'finance.kam_sly_penize',
    oblast: 'finance',
    nazev: 'Kam šly peníze',
    popis: 'Pruhy: nákupy a účtenky, výdaje z kasy, mzdy; pod tím hodnota zboží ve skladu.',
    ikona: 'coins',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.finance'],
    opravneni: { vse: ['finance.zobrazit'], nektere: [], pole: { radek_mzdy: 'finance.mzdy' } },
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
    stav: 'planovany',
  },
  // Data: GET /api/pos/margins?month → totals{marginPct,margin,cogs,revenueKnown,noRecipe,noRecipeShare},
  // items[], insights[]
  // Pozor: finance.marze v katalogu vyžaduje sklad.ceny a receptury.zobrazit
  {
    id: 'finance.marze',
    oblast: 'finance',
    nazev: 'Marže',
    popis: 'Marže na položkách s recepturou, co vydělává nejvíc a nejmíň, rady (drahé suroviny, položky bez receptury).',
    ikona: 'coins',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.receptury', 'vedeni.finance'],
    opravneni: { vse: ['finance.marze'], nektere: [] },
    tarif: 'max',
    nastaveni: [
      {
        klic: 'mesic',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'tento', nazev: 'Tento' }, { id: 'minuly', nazev: 'Minulý' }],
        vychozi: 'tento',
      },
      {
        klic: 'razeni',
        nazev: 'Řadit',
        typ: 'vyber',
        moznosti: [{ id: 'marze', nazev: 'Marže' }, { id: 'trzba', nazev: 'Tržba' }, { id: 'kusy', nazev: 'Kusy' }],
        vychozi: 'trzba',
      },
    ],
    stav: 'planovany',
  },
  // Data: GET /api/finance?month → guest{orders,total,offPos,offPosTotal,members,newMembers,couponsRedeemed}
  {
    id: 'finance.hoste_vernost',
    oblast: 'finance',
    nazev: 'Hosté ve financích',
    popis: 'Objednávky od stolu (a kolik jich nedoteklo do pokladny), členové věrnosti, uplatněné kupony.',
    ikona: 'coins',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.finance', 'vedeni.klient'],
    opravneni: { vse: ['finance.zobrazit'], nektere: [] },
    tarif: 'max',
    nastaveni: [
      {
        klic: 'mesic',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'tento', nazev: 'Tento' }, { id: 'minuly', nazev: 'Minulý' }],
        vychozi: 'tento',
      },
    ],
    stav: 'planovany',
  },
  // Data: GET /api/finance/advice?month → advice[], blind[], counts{}
  {
    id: 'finance.doporuceni',
    oblast: 'finance',
    nazev: 'Doporučení',
    popis: 'Co s čísly udělat: rady ke tržbám, produktům a lidem, včetně přiznaných slepých míst.',
    ikona: 'coins',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.finance'],
    opravneni: { vse: ['finance.analyza'], nektere: [], pole: { skupina_lide: 'finance.mzdy' } },
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
    stav: 'planovany',
  },
  // Data: GET /api/finance?month → insights[{icon,title,text,tone}]
  // Pozor: Překrývá se s Doporučeními; nabídnout oba, výchozí jen Doporučení.
  {
    id: 'finance.postrehy',
    oblast: 'finance',
    nazev: 'Postřehy měsíce',
    popis: 'Krátké postřehy z čísel měsíce: tržby proti minulému měsíci, podíl mezd proti cíli, nejslabší den, rozdíly v kase, závislost na dodavateli, podíl karet, sklad proti tržbám.',
    ikona: 'coins',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.finance'],
    opravneni: { vse: ['finance.zobrazit'], nektere: [] },
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
    stav: 'planovany',
  },
  // Data: GET /api/inventory/shrinkage[?id] → ready, stocktake{completedAt,counted},
  // totals{lostValue,surplusValue,netValue,missing,surplus}, rows[], insights[]
  {
    id: 'finance.ztraty',
    oblast: 'finance',
    nazev: 'Ztráty a manka',
    popis: 'Poslední inventura v penězích: kolik chybí a přebývá, nejdražší ztráty, ztráta v % z prodaného.',
    ikona: 'coins',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.sklad', 'vedeni.finance'],
    opravneni: { vse: ['finance.ztraty'], nektere: [] },
    tarif: 'zdarma',
    stav: 'planovany',
  },
  // Data: GET /api/receipts → receipts[{photoUrl,supplier,amount,note,createdAt}] (bez finance.uctenky_zobrazit
  // jen vlastní)
  {
    id: 'finance.uctenky',
    oblast: 'finance',
    nazev: 'Účtenky z nákupů',
    popis: 'Nafotit účtenku jedním ťuknutím; poslední účtenky a součet za měsíc.',
    ikona: 'coins',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.finance', 'vedeni.togo'],
    opravneni: {
      vse: [],
      nektere: ['finance.uctenky_zobrazit', 'finance.uctenky_pridat'],
      pole: { 'akce:nafotit': 'finance.uctenky_pridat', 'akce:upravit_smazat': 'finance.uctenky_upravit' },
    },
    tarif: 'zdarma',
    stav: 'planovany',
  },
];
