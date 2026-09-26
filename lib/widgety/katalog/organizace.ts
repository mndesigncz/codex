// Widgety oblasti „Organizace" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/organizace.tsx. Widget se stavem 'planovany' komponentu
// ještě nemá: nekreslí se ani nenabízí, dokud ho balík B5b v kole 69 nenapíše a nepřepne na 'hotovo'.
// Soubor patří balíku B5b; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/organization/overview?month →
  // teams[{name,revenue,wages,closings,missingClosings,pendingApproval,members,onShiftNow,stockAlerts}], total
  {
    id: 'organizace.podniky',
    oblast: 'organizace',
    nazev: 'Všechny podniky',
    popis: 'Konsolidovaný přehled poboček organizace: tržby, mzdy, chybějící uzávěrky, kdo je na směně, docházející sklad — proklik přepne podnik.',
    ikona: 'chart',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled'],
    opravneni: { vse: ['organizace.prehled'], nektere: [], pole: { trzby: 'finance.trzby', mzdy: 'finance.mzdy' } },
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
];
