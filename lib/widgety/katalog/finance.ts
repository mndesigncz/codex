// Widgety oblasti „Finance" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/finance.tsx. Soubor patří balíku B5b; převedeno
// z katalogu widgetů jednorázovým skriptem (spec §2.2), v kole 69 jsou hotové všechny widgety oblasti.
//
// Ikony (kolo 69): katalog dal celé oblasti `coins`; na Financích je ve výchozím rozložení sedm
// finančních widgetů a ikona se nesmí opakovat (AK-19). `coins` si nechal Souhrn měsíce, ostatní
// mají ikonu podle obsahu a nástroj Financí (kniha výdajů) má `book`.
import type { DefiniceWidgetu } from '../typy.ts';

/**
 * Měsíc widgetu z volby „Měsíc" (Tento / Minulý) a měsíce stránky.
 *
 * Proč relativně ke stránce: Finance i Všechny podniky mají v hlavičce přepínač měsíce
 * a katalog chce, aby ho widgety následovaly („Měsíc v hlavičce řídí všechny widgety").
 * Kdyby „Tento" znamenalo vždycky dnešní měsíc, souhrn nahoře by po přepnutí na srpen
 * ukazoval září a kniha výdajů pod ním srpen — dvě čísla za dva měsíce na jedné obrazovce.
 * Na stránce bez přepínače (Přehled, TO GO) je měsícem stránky dnešní pražský měsíc.
 *
 * `zaklad` je „RRRR-MM"; neznámá volba = „tento" (uložené nastavení z budoucí verze nesmí shodit widget).
 */
export function mesicZVolby(volba: unknown, zaklad: string): string {
  if (volba !== 'minuly') return zaklad;
  const [y, m] = zaklad.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

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
    kostra: { S: 'cislo', M: 'cislo', L: 'cislo' },
    // Hlavní číslo peněz Financí: na stránce s `inkoust` nese jedinou inkoustovou plochu (DP §2.10).
    muzeInkoust: true,
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
    stav: 'hotovo',
  },
  // Data: GET /api/finance?month → summary.revenue, summary.wagesWorked, summary.wagesCash, summary.prevRevenue,
  // summary.laborTargetPct (kolo 69: cíl podniku posílá /api/finance, dřív ho widget musel brát z /api/teams)
  {
    id: 'finance.trzby_vs_mzdy',
    oblast: 'finance',
    nazev: 'Tržby vs. mzdy',
    popis: 'Podíl mezd na tržbách proti cíli podniku (zelená pod cílem, červená nad).',
    ikona: 'users',
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
    stav: 'hotovo',
  },
  // Data: GET /api/finance?month → ledger[{kind,amount}], summary{wagesCash,wagesWorked,stockValue,stockTop}
  // (N8: hodnota zásob jen odsud — jedním výpočtem pro Finance i sklad)
  {
    id: 'finance.kam_sly_penize',
    oblast: 'finance',
    nazev: 'Kam šly peníze',
    popis: 'Pruhy: nákupy a účtenky, výdaje z kasy, mzdy; pod tím hodnota zboží ve skladu.',
    ikona: 'cart',
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
    stav: 'hotovo',
  },
  // Data: GET /api/pos/margins?month → totals{marginPct,margin,cogs,revenueKnown,noRecipe,noRecipeShare},
  // items[], insights[]
  // Pozor: finance.marze v katalogu vyžaduje sklad.ceny a receptury.zobrazit
  {
    id: 'finance.marze',
    oblast: 'finance',
    nazev: 'Marže',
    popis: 'Marže na položkách s recepturou, co vydělává nejvíc a nejmíň, rady (drahé suroviny, položky bez receptury).',
    ikona: 'tag',
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
    stav: 'hotovo',
  },
  // Data: GET /api/finance?month → guest{orders,total,offPos,offPosTotal,members,newMembers,couponsRedeemed}
  {
    id: 'finance.hoste_vernost',
    oblast: 'finance',
    nazev: 'Hosté ve financích',
    popis: 'Objednávky od stolu (a kolik jich nedoteklo do pokladny), členové věrnosti, uplatněné kupony.',
    ikona: 'gift',
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
    stav: 'hotovo',
  },
  // Data: GET /api/finance/advice?month → advice[], blind[], counts{}
  {
    id: 'finance.doporuceni',
    oblast: 'finance',
    nazev: 'Doporučení',
    popis: 'Co s čísly udělat: rady ke tržbám, produktům a lidem, včetně přiznaných slepých míst.',
    ikona: 'bulb',
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
    stav: 'hotovo',
  },
  // Data: GET /api/finance?month → insights[{icon,title,text,tone}]
  // Pozor: Překrývá se s Doporučeními; nabídnout oba, výchozí jen Doporučení.
  {
    id: 'finance.postrehy',
    oblast: 'finance',
    nazev: 'Postřehy měsíce',
    popis: 'Krátké postřehy z čísel měsíce: tržby proti minulému měsíci, podíl mezd proti cíli, nejslabší den, rozdíly v kase, závislost na dodavateli, podíl karet, sklad proti tržbám.',
    ikona: 'sparkle',
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
    stav: 'hotovo',
  },
  // Data: GET /api/inventory/shrinkage[?id] → ready, stocktake{completedAt,counted},
  // totals{lostValue,surplusValue,netValue,missing,surplus}, rows[], insights[]
  {
    id: 'finance.ztraty',
    oblast: 'finance',
    nazev: 'Ztráty a manka',
    popis: 'Poslední inventura v penězích: kolik chybí a přebývá, nejdražší ztráty, ztráta v % z prodaného.',
    ikona: 'warning',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.sklad', 'vedeni.finance'],
    opravneni: { vse: ['finance.ztraty'], nektere: [] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/receipts → receipts[{photoUrl,supplier,amount,note,createdAt}] (bez finance.uctenky_zobrazit
  // jen vlastní)
  {
    id: 'finance.uctenky',
    oblast: 'finance',
    nazev: 'Účtenky z nákupů',
    popis: 'Nafotit účtenku jedním ťuknutím; poslední účtenky a součet za měsíc.',
    ikona: 'camera',
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
    stav: 'hotovo',
  },
];
