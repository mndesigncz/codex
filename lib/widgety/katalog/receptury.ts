// Widgety oblasti „Receptury" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/receptury.tsx, výpočet v lib/recepturyPrehled.ts.
// Soubor patří balíku B4. Kolo 69: oba widgety hotové. Ikony se liší (AK-19): na stránce Receptury
// jsou ve výchozím rozložení vedle sebe a `tag` už nese Marže produktů, `info` Suroviny bez ceny.
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/pos/products → products[], recipes[], unmapped[]; GET /api/inventory → length
  {
    id: 'receptury.pokryti',
    oblast: 'receptury',
    nazev: 'Pokrytí recepturou',
    popis: 'Kolik % položek menu má recepturu, kolik se prodává bez receptury, kolik položek je ve skladu.',
    ikona: 'leaf',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.receptury'],
    opravneni: { vse: ['receptury.zobrazit'], nektere: [] },
    tarif: 'max',
    stav: 'hotovo',
  },
  // Data: GET /api/pos/products → unmapped[{productId,productName,soldCount}]
  {
    id: 'receptury.bez_receptury',
    oblast: 'receptury',
    nazev: 'Prodává se, ale neodepisuje',
    popis: 'Nejprodávanější položky z kasy bez receptury (tyhle prodeje se ze skladu neodepíšou) — proklik do editoru.',
    // Účtenka: prodeje z kasy, které se ze skladu neodepíšou.
    ikona: 'receipt',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.sklad', 'vedeni.receptury'],
    opravneni: { vse: ['receptury.zobrazit'], nektere: [], pole: { 'akce:doplnit_recepturu': 'receptury.upravit' } },
    tarif: 'max',
    stav: 'hotovo',
  },
];
