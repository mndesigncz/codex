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

export const CONTENT_UNITS = ['g', 'kg', 'ml', 'l', 'ks'] as const;

export interface CategoryPackaging {
  tracksOpen: boolean;
  contentUnit: string | null;
  defaultPackageSize: number | null;
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

export function normalizeCategoryPackaging(row: any): CategoryPackaging {
  const size = Number(row?.default_package_size ?? row?.defaultPackageSize);
  return {
    tracksOpen: (row?.tracks_open ?? row?.tracksOpen) === true,
    contentUnit: row?.content_unit ?? row?.contentUnit ?? null,
    defaultPackageSize: Number.isFinite(size) && size > 0 ? size : null,
    scale: normalizeScale(row?.scale),
  };
}

/** Concrete amounts a step maps to for one particular package size. */
export function resolveSteps(scale: Scale, packageSize: number): { label: string; amount: number }[] {
  return scale.steps.map(s => ({
    label: s.label,
    amount: scale.kind === 'absolute'
      ? Math.min(s.value ?? 0, packageSize)
      : round1((packageSize * (s.pct ?? 0)) / 100),
  }));
}

/** Total content across sealed packages plus the open remainder. */
export function totalContent(item: PackagedItem): number {
  const size = Number(item.packageSize) || 0;
  return round1(Math.max(0, item.quantity) * size + (Number(item.openAmount) || 0));
}

/**
 * Stock expressed in packages, where a half-full tin counts as 0.5. Lets the
 * existing min/critical thresholds stay in packages and still be honest.
 */
export function effectivePackages(item: PackagedItem): number {
  const size = Number(item.packageSize) || 0;
  if (size <= 0) return item.quantity;
  return round1(item.quantity + (Number(item.openAmount) || 0) / size);
}

/** "2 krabičky + 50 g" — what the shelf actually looks like. */
export function formatStock(item: PackagedItem, unit: string | null, packageWord = 'balení'): string {
  const open = Number(item.openAmount) || 0;
  const sealed = `${item.quantity} ${packageWord}`;
  if (!unit || open <= 0) return sealed;
  return `${sealed} + ${fmtAmount(open)} ${unit}`;
}

export function fmtAmount(n: number): string {
  const r = round1(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
}

/** How full the open package is, 0–100, for progress bars. */
export function openPct(item: PackagedItem): number {
  const size = Number(item.packageSize) || 0;
  if (size <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((Number(item.openAmount) || 0) / size) * 100)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
