// Widgety oblasti „Organizace" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/organizace.tsx. Soubor patří balíku B5b; převedeno
// z katalogu widgetů jednorázovým skriptem (spec §2.2), hotové v kole 69.
//
// Na stránce Všechny podniky nese widget součty (M), seznam podniků je nástroj stránky. Měsíc
// „Tento" znamená měsíc stránky — na Všech podnicích ten z přepínače v hlavičce, jinde dnešní
// (mesicZVolby v ./finance.ts).
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
    stranky: ['vedeni.prehled', 'vedeni.vsechny_podniky'],
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
    stav: 'hotovo',
  },
];
