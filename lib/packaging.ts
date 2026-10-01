// Open-package tracking — shared model for goods that are stocked in packages
// but consumed gradually from an opened one: a tin of tobacco, a bottle of
// spirits, a sack of coffee. The category carries the settings; each item only
// says how big its own package is and how much is left in the open one.
//
// Stock is deliberately kept as two numbers so nothing about existing items
// changes: `quantity` stays the count of SEALED packages, `openAmount` is the
// remainder of the single open package (one per item by design).

export type ScaleKind = 'fraction' | 'absolute';

export interface ScaleStep {
  label: string;
  /** fraction scale: 0–100 % of the package */
  pct?: number;
  /** absolute scale: amount in the category's content unit */
  value?: number;
}

export interface Scale {
  kind: ScaleKind;
  steps: ScaleStep[];
}

// Reads the way people already talk about a half-empty tin, so one scale fits
// every package size in the category.
export const DEFAULT_SCALE: Scale = {
  kind: 'fraction',
  steps: [
    { label: 'Plná', pct: 100 },
    { label: '¾', pct: 75 },
    { label: 'Půl', pct: 50 },
    { label: '¼', pct: 25 },
    { label: 'Dochází', pct: 10 },
    { label: 'Prázdná', pct: 0 },
  ],
};

// Jednotky obsahu jsou společné s převody množství (lib/jednotky.ts).
import { CONTENT_UNITS, jednotkaMnozstvi } from './jednotky.ts';
export { CONTENT_UNITS };

/**
 * What the min/critical thresholds are counted in. 'package' keeps the original
 * meaning (3 = three tins); 'content' switches the whole category to the content
 * unit (300 = three hundred grams), which is how people think about a category
 * where the package size differs from item to item.
 */
export type ThresholdUnit = 'package' | 'content';

export interface CategoryPackaging {
  tracksOpen: boolean;
  contentUnit: string | null;
  defaultPackageSize: number | null;
  thresholdUnit: ThresholdUnit;
  scale: Scale;
}

export interface PackagedItem {
  quantity: number;
  packageSize?: number | null;
  openAmount?: number | null;
}

export function normalizeScale(raw: any): Scale {
  const kind: ScaleKind = raw?.kind === 'absolute' ? 'absolute' : 'fraction';
  const rawSteps = Array.isArray(raw?.steps) ? raw.steps : [];
  const steps: ScaleStep[] = rawSteps
    .map((s: any) => {
      const label = String(s?.label ?? '').trim().slice(0, 30);
      if (!label) return null;
      if (kind === 'absolute') {
        const value = Number(s?.value);
        return Number.isFinite(value) && value >= 0 ? { label, value } : null;
      }
      const pct = Number(s?.pct);
      return Number.isFinite(pct) ? { label, pct: Math.max(0, Math.min(100, pct)) } : null;
    })
    .filter(Boolean) as ScaleStep[];
  if (!steps.length) return DEFAULT_SCALE;
  // Fullest first — that is the order people scan for.
  steps.sort((a, b) => (b.pct ?? b.value ?? 0) - (a.pct ?? a.value ?? 0));
  return { kind, steps };
}

export function normalizeThresholdUnit(raw: any): ThresholdUnit {
  return raw === 'content' ? 'content' : 'package';
}

export function normalizeCategoryPackaging(row: any): CategoryPackaging {
  const size = Number(row?.default_package_size ?? row?.defaultPackageSize);
  return {
    tracksOpen: (row?.tracks_open ?? row?.tracksOpen) === true,
    contentUnit: row?.content_unit ?? row?.contentUnit ?? null,
    defaultPackageSize: Number.isFinite(size) && size > 0 ? size : null,
    thresholdUnit: normalizeThresholdUnit(row?.threshold_unit ?? row?.thresholdUnit),
    scale: normalizeScale(row?.scale),
  };
}

/** Concrete amounts a step maps to for one particular package size. */
export function resolveSteps(scale: Scale, packageSize: number): { label: string; amount: number }[] {
  return scale.steps.map(s => ({
    label: s.label,
    amount: scale.kind === 'absolute'
      ? Math.min(s.value ?? 0, packageSize)
      : round3((packageSize * (s.pct ?? 0)) / 100),
  }));
}

/** Total content across sealed packages plus the open remainder. */
export function totalContent(item: PackagedItem): number {
  const size = Number(item.packageSize) || 0;
  return round3(Math.max(0, item.quantity) * size + (Number(item.openAmount) || 0));
}

/**
 * Stock expressed in packages, where a half-full tin counts as 0.5. Lets the
 * existing min/critical thresholds stay in packages and still be honest.
 */
export function effectivePackages(item: PackagedItem): number {
  const size = Number(item.packageSize) || 0;
  if (size <= 0) return item.quantity;
  return round3(item.quantity + (Number(item.openAmount) || 0) / size);
}

export type StockStatus = 'ok' | 'low' | 'critical';

export interface ThresholdItem extends PackagedItem {
  minQuantity: number;
  criticalQuantity: number;
}

/**
 * The number the thresholds are compared against. Packages by default (a
 * half-full tin counts as 0.5), total content when the category is set to
 * watch grams instead.
 */
export function stockMeasure(item: PackagedItem, packaging?: CategoryPackaging | null): number {
  return packaging?.tracksOpen && packaging.thresholdUnit === 'content'
    ? totalContent(item)
    : effectivePackages(item);
}

/** One place that decides low/critical, so every screen agrees. */
export function stockStatus(item: ThresholdItem, packaging?: CategoryPackaging | null): StockStatus {
  const measure = stockMeasure(item, packaging);
  if (measure <= item.criticalQuantity) return 'critical';
  if (measure <= item.minQuantity) return 'low';
  return 'ok';
}

/** What to print after a threshold value: "3 balení" vs "300 g". */
export function thresholdUnitLabel(packaging: CategoryPackaging | null | undefined, packageWord = 'balení'): string {
  if (packaging?.tracksOpen && packaging.thresholdUnit === 'content' && packaging.contentUnit) {
    return packaging.contentUnit;
  }
  return packageWord;
}

/** "2 krabičky + 50 g" — what the shelf actually looks like. */
export function formatStock(item: PackagedItem, unit: string | null, packageWord = 'balení'): string {
  const open = Number(item.openAmount) || 0;
  const sealed = `${item.quantity} ${packageWord}`;
  if (!unit || open <= 0) return sealed;
  return `${sealed} + ${fmtAmount(open)} ${unit}`;
}

/** Množství s českou čárkou, nejvýš tři desetinná místa (0,68 l zůstane „0,68"). */
export function fmtAmount(n: number): string {
  return String(round3(n)).replace('.', ',');
}

/**
 * Take `amount` of content out of the stock: the open package first, then
 * sealed ones get cracked as needed. Without a package size the amount comes
 * straight off `quantity` — the item is simply counted in its own unit.
 * Never goes below zero; selling from an empty shelf is a counting error,
 * not negative stock.
 */
export function consumeContent(
  item: PackagedItem,
  amount: number,
  // Sloupec `quantity` bývá v databázi ještě INTEGER (viz lib/cenaSloupce):
  // desetinné číslo by zápis odmítl a u odpisu prodejů shodilo celou transakci.
  // `celeKusy` proto u položky bez balení zaokrouhlí výsledek na celé.
  opts?: { celeKusy?: boolean },
): { quantity: number; openAmount: number | null } {
  const size = Number(item.packageSize) || 0;
  let qty = Math.max(0, Number(item.quantity) || 0);
  if (size <= 0) {
    const zbyva = opts?.celeKusy ? Math.round(qty - amount) : round3(qty - amount);
    return { quantity: Math.max(0, zbyva), openAmount: item.openAmount ?? null };
  }
  let open = Math.max(0, Number(item.openAmount) || 0);
  let left = amount;
  while (left > 0) {
    if (open >= left) { open = round3(open - left); left = 0; break; }
    left = round3(left - open); open = 0;
    if (qty > 0) { qty -= 1; open = size; } else break;
  }
  return { quantity: qty, openAmount: open };
}

/**
 * Efektivní velikost balení a jednotka obsahu položky: vlastní hodnota, jinak
 * zděděná z kategorie (inventory_categories.default_package_size / content_unit).
 * JEDINÉ místo, které to rozhoduje — odpis, náklady, inventura, receptury
 * i API skladu se mají ptát tady, ne číst `package_size` ze sloupce.
 * Velikost 0 nebo záporná se bere jako nevyplněná.
 */
export function efektivniBaleni(
  item: { packageSize?: number | string | null; contentUnit?: string | null },
  packaging?: { defaultPackageSize?: number | null; contentUnit?: string | null } | null,
): { packageSize: number | null; contentUnit: string | null } {
  const vlastni = Number(item?.packageSize);
  const zKategorie = Number(packaging?.defaultPackageSize);
  const size = Number.isFinite(vlastni) && vlastni > 0 ? vlastni
    : Number.isFinite(zKategorie) && zKategorie > 0 ? zKategorie : null;
  const unit = String(item?.contentUnit ?? '').trim() || String(packaging?.contentUnit ?? '').trim() || null;
  return { packageSize: size, contentUnit: unit };
}

/**
 * Balení položky tak, jak ho klient dostane z /api/inventory: ta posílá vedle
 * syrových polí (`packageSize`, `contentUnit` — to, co je v položce vyplněné
 * a co se upravuje ve formuláři) i hotové `effectivePackageSize` /
 * `effectiveContentUnit` se zděděním z kategorie. Bez nich (položka z jiného
 * zdroje) se spadne na vlastní hodnoty.
 */
export function baleniPolozky(item: any): { packageSize: number | null; contentUnit: string | null } {
  if (item && (item.effectivePackageSize !== undefined || item.effectiveContentUnit !== undefined)) {
    const size = Number(item.effectivePackageSize);
    return {
      packageSize: Number.isFinite(size) && size > 0 ? size : null,
      contentUnit: String(item.effectiveContentUnit ?? '').trim() || null,
    };
  }
  return efektivniBaleni(item ?? {}, null);
}

/** Jednotka, v níž je množství u položky vedené (receptury, kroky návodů, odpisy). */
export function jednotkaPolozky(item: any): string {
  return jednotkaMnozstvi({ unit: item?.unit, ...baleniPolozky(item) });
}

/** The unit partial amounts are measured in — the item's own setting wins. */
export function itemContentUnit(
  item: { contentUnit?: string | null },
  packaging?: CategoryPackaging | null,
): string | null {
  return item.contentUnit ?? packaging?.contentUnit ?? null;
}

/** How full the open package is, 0–100, for progress bars. */
export function openPct(item: PackagedItem): number {
  const size = Number(item.packageSize) || 0;
  if (size <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((Number(item.openAmount) || 0) / size) * 100)));
}

// Zaokrouhlení jen na tři desetinná místa: stačí k odstranění chyby plovoucí
// čárky (0,7 − 0,02 = 0,6799999…), ale neztrácí přesnost u l a kg
// (0,68 l zůstane 0,68; dřív zaokrouhlení na desetiny vrátilo 0,7 a nic se
// neodečetlo). U ml a g jsou čísla celá a zůstávají celá.
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Odpis prodeje ze skladu: nejdřív načaté balení, pak se načne nové, nikdy
 * pod nulu. Na rozdíl od `consumeContent` počítá na tři desetinná místa
 * (0,7 l minus 0,02 l musí zůstat 0,68 — zaokrouhlení na desetiny by
 * podniku vracelo 0,02 l při každém drinku). `celeKusy`: viz `consumeContent`
 * — u položky bez balení a INTEGER sloupce se počet zaokrouhlí na celé, ať
 * jeden neplatný zápis nesrazí odpis všech surovin a značky účtenek.
 */
export function odepsatProdej(qty: number, open: number, pkg: number, amount: number, celeKusy = false) {
  if (pkg > 0) {
    open -= amount;
    while (open < 0 && qty > 0) { qty -= 1; open += pkg; }
    if (open < 0) open = 0;
    open = Math.round(open * 1000) / 1000;
  } else {
    const zbyva = celeKusy ? Math.round(qty - amount) : Math.round((qty - amount) * 1000) / 1000;
    qty = Math.max(0, zbyva);
  }
  return { qty, open };
}
