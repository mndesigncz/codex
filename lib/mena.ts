// Měna a jazyk podniku pro texty, které skládá server — čistá část (bez databáze,
// aby šla testovat v `npm test`; načtení z podniku je v lib/menaPodniku.ts).
//
// Rady ve Financích, v marži, v denním přehledu i ve ztrátách se skládaly
// na serveru s natvrdo napsaným „Kč" a `cs-CZ`, ačkoli aplikace podporuje osm
// měn: eurová kavárna četla v radě „Chybí zboží za 120 Kč" pod třemi čísly
// v eurech. Server nemá `CurrencyProvider`, tak formátuje stejnou funkcí jako
// obrazovka (`formatMoney`).

import { DEFAULT_CURRENCY, formatCost, formatMoney, formatPrice, normalizeCurrency } from './money.ts';

/**
 * Hrubý počet korun na jednotku měny — JEN pro prahy v radách (od jaké částky
 * je rozdíl vidět). Není to kurz na přepočet peněz a nikdy se s ním nesmí
 * počítat účetní částka; 2000 Kč jako práh je v eurech ~80 €, ne 2000 €.
 */
const KC_NA_JEDNOTKU: Record<string, number> = {
  CZK: 1, EUR: 25, USD: 23, GBP: 29, PLN: 5.5, HUF: 0.065, CHF: 26, RON: 5,
};

/** Práh zadaný v korunách přepočtený na měnu podniku a zaokrouhlený na „hezké" číslo. */
export function prahVMene(kc: number, currency: string): number {
  const kurz = KC_NA_JEDNOTKU[normalizeCurrency(currency)] ?? 1;
  const v = kc / kurz;
  if (v <= 0) return 0;
  // Dvě platné číslice: 80, 2 400, 31 000 — ne 79,87.
  const rad = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.max(1, Math.round(v / rad) * rad);
}

export interface MenaPodniku {
  currency: string;
  locale: string;
  /** Celé jednotky měny s oddělovačem tisíců: „3 200 Kč", „3 200 €". */
  money: (n: number) => string;
  /** Cena zadaná člověkem (menu, objednávka hosta): s haléři, jen když je má. */
  price: (n: number) => string;
  /** Částka pod jednotku měny (náklad na porci) s desetinami: „0,62 €", ne „1 €". */
  cost: (n: number) => string;
  /** Práh z korun přepočtený na měnu podniku (viz `prahVMene`). */
  prah: (kc: number) => number;
}

export function menaZRadku(currency?: string | null, locale?: string | null): MenaPodniku {
  const code = normalizeCurrency(currency || DEFAULT_CURRENCY.currency);
  const loc = locale || DEFAULT_CURRENCY.locale;
  return { currency: code, locale: loc, money: (n: number) => formatMoney(n, code, loc), cost: (n: number) => formatCost(n, code, loc), price: (n: number) => formatPrice(n, code, loc), prah: (kc: number) => prahVMene(kc, code) };
}
