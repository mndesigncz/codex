// Čistá logika výroby vlastních produktů — bez databáze, aby šla testovat
// v `npm test`. Datovou vrstvu (načtení skladu, úkoly, vlajky) drží
// lib/production.ts.

import { stockMeasure, type CategoryPackaging, type StockStatus } from './packaging.ts';
// Relativní cesta, ne alias `@/`: tenhle soubor si načítá `npm test`
// přímo Nodem (`node scripts/test-units.ts`) a ten aliasy z tsconfigu nezná.
import { czCount } from './czech.ts';

export const MAX_BATCHES = 10;
export const MAX_INGREDIENTS = 20;

export interface StockRow {
  id: number; name: string; category: string; categoryId: number | null;
  quantity: number; minQuantity: number; criticalQuantity: number; maxQuantity: number;
  unit: string; packageSize: number | null; openAmount: number | null; contentUnit: string | null;
  madeInHouse: boolean; batchYield: number | null; batchSteps: string | null; productionLabel: string | null;
  packaging: CategoryPackaging | null;
  status: StockStatus;
}

export interface RecipeLine {
  ingredientId: number; name: string; amount: number; unit: string;
  /** kolik je ve skladu v jednotce receptury */
  available: number;
  /** kolik je potřeba na všechny dávky */
  need: number;
  missing: number;
}

export interface ProductionPlan {
  item: StockRow;
  batches: number;
  yieldTotal: number;
  lines: RecipeLine[];
  missing: RecipeLine[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const fmtQty = (n: number) => r3(n).toLocaleString('cs-CZ', { maximumFractionDigits: 3 });

/** Velikost balení položky (vlastní, jinak z kategorie). */
export function sizeOf(row: StockRow): number {
  return Number(row.packageSize ?? row.packaging?.defaultPackageSize ?? 0) || 0;
}

/** Jednotka, ve které se surovina v receptuře počítá: obsah u balených, jinak vlastní jednotka. */
export function recipeUnit(row: StockRow): string {
  return sizeOf(row) > 0 ? (row.contentUnit ?? row.packaging?.contentUnit ?? row.unit) : row.unit;
}

/** Kolik je suroviny ve skladu v jednotce receptury. */
export function availableOf(row: StockRow): number {
  const size = sizeOf(row);
  return size > 0
    ? r3(Math.max(0, row.quantity) * size + (Number(row.openAmount) || 0))
    : Math.max(0, row.quantity);
}

/** Kolik dávek je potřeba, aby se položka dostala na plný stav. */
export function batchesNeeded(item: StockRow): number {
  const yieldQty = item.batchYield && item.batchYield > 0 ? item.batchYield : 1;
  const size = sizeOf(item);
  const byContent = !!item.packaging?.tracksOpen && item.packaging.thresholdUnit === 'content' && size > 0;
  const measure = stockMeasure({ ...item, packageSize: size || null } as any, item.packaging);
  const target = item.maxQuantity > 0 ? item.maxQuantity : Math.max(item.minQuantity * 2, item.minQuantity + 1);
  const deficit = Math.max(0, target - measure);
  const yieldMeasure = byContent ? yieldQty * size : yieldQty;
  return Math.min(MAX_BATCHES, Math.max(1, Math.ceil(deficit / yieldMeasure)));
}

/** Výrobní plán položky: dávky, suroviny, co chybí. */
export function planFor(item: StockRow, recipe: { ingredientId: number; amount: number }[], stock: Map<number, StockRow>, batches?: number): ProductionPlan {
  const n = batches && batches > 0 ? Math.min(MAX_BATCHES, batches) : batchesNeeded(item);
  const lines: RecipeLine[] = [];
  for (const r of recipe) {
    const ing = stock.get(r.ingredientId);
    if (!ing) continue;
    const need = r3(r.amount * n);
    const available = availableOf(ing);
    lines.push({
      ingredientId: ing.id, name: ing.name, amount: r.amount, unit: recipeUnit(ing),
      available, need, missing: r3(Math.max(0, need - available)),
    });
  }
  return {
    item, batches: n,
    yieldTotal: r3((item.batchYield && item.batchYield > 0 ? item.batchYield : 1) * n),
    lines, missing: lines.filter(l => l.missing > 0),
  };
}

export function taskTitleFor(item: StockRow): string {
  const label = (item.productionLabel ?? '').trim();
  return label || `Vyrobit ${item.name}`;
}

/**
 * Postup, který má v úkolu vyhrát.
 *
 * Návod připnutý k položce bije holý text `batch_steps`: prošel schválením,
 * má kategorii, dá se u něj potvrdit přečtení a je vidět i ze záložky Návody.
 * Když návod není, zůstává starý text — stovky položek ho mají vyplněný
 * a migrovat je kvůli nepovinné vazbě by bylo riskantnější než tohle.
 */
function postupUkolu(plan: ProductionPlan, navod?: NavodUkolu | null): string[] {
  const zNavodu = (navod?.steps ?? []).map(s => s.trim()).filter(Boolean);
  if (zNavodu.length) return zNavodu;
  return (plan.item.batchSteps ?? '')
    .split('\n').map(s => s.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
}

/** Návod připnutý k vyráběné položce — tolik, kolik úkol potřebuje. */
export interface NavodUkolu { id: number; title: string; steps: string[] }

export function describe(plan: ProductionPlan, navod?: NavodUkolu | null): string {
  const { item } = plan;
  const yieldQty = item.batchYield && item.batchYield > 0 ? item.batchYield : null;
  const head = yieldQty
    ? `${plan.batches}× dávka po ${fmtQty(yieldQty)} ${item.unit} — ve skladu ${fmtQty(availableOf(item))} ${recipeUnit(item)}, po výrobě +${fmtQty(plan.yieldTotal)} ${item.unit}.`
    : `Ve skladu zbývá ${fmtQty(availableOf(item))} ${recipeUnit(item)}.`;
  const lines: string[] = [head];
  if (plan.lines.length) {
    lines.push('', `Suroviny na ${plan.batches === 1 ? 'jednu dávku' : czCount(plan.batches, { one: 'dávku', few: 'dávky', many: 'dávek' })}:`);
    for (const l of plan.lines) {
      const ok = l.missing <= 0;
      lines.push(`• ${l.name} ${fmtQty(l.need)} ${l.unit} — ve skladu ${fmtQty(l.available)} ${l.unit} ${ok ? '✓' : `✗ chybí ${fmtQty(l.missing)} ${l.unit}, je v nákupním seznamu`}`);
    }
  }
  const postup = postupUkolu(plan, navod);
  if (postup.length) {
    lines.push('', navod ? `Podle návodu „${navod.title}":` : 'Postup:', ...postup.map(s => `${s}`));
  }
  lines.push('', 'Po odškrtnutí se dávka naskladní a suroviny odepíšou samy.');
  return lines.join('\n').slice(0, 4000);
}

export function checklistFor(plan: ProductionPlan, navod?: NavodUkolu | null): { text: string; done: boolean }[] {
  const steps = postupUkolu(plan, navod);
  const items = steps.length
    ? steps
    : plan.lines.map(l => `Odměřit ${l.name} ${fmtQty(l.need)} ${l.unit}`);
  return items.slice(0, 50).map(text => ({ text: text.slice(0, 300), done: false }));
}

