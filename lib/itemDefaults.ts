// What a new item in a category starts with. The fields a shop fills in the
// same way for every product — unit, package size, thresholds, supplier — are
// set once on the category instead of retyped on each item.

export interface ItemDefaults {
  brand?: string;
  unit?: string;
  supplier?: string;
  supplierUrl?: string;
  unitCost?: number | null;
  packageSize?: number | null;
  minQuantity?: number | null;
  criticalQuantity?: number | null;
  maxQuantity?: number | null;
  /** Prefilled into the item's description so the wording stays consistent. */
  description?: string;
}

/** Fields offered in the category editor, in the order they appear. */
export const DEFAULT_FIELDS: {
  key: keyof ItemDefaults;
  label: string;
  kind: 'text' | 'number' | 'url' | 'multiline';
  hint?: string;
}[] = [
  { key: 'brand', label: 'Značka', kind: 'text', hint: 'Např. Stanislaw' },
  { key: 'unit', label: 'Jednotka', kind: 'text', hint: 'ks, balení…' },
  { key: 'packageSize', label: 'Velikost balení', kind: 'number' },
  { key: 'minQuantity', label: 'Upozornit při', kind: 'number' },
  { key: 'criticalQuantity', label: 'Kriticky málo při', kind: 'number' },
  { key: 'maxQuantity', label: 'Max. množství', kind: 'number' },
  { key: 'unitCost', label: 'Cena za jednotku', kind: 'number' },
  { key: 'supplier', label: 'Dodavatel', kind: 'text' },
  { key: 'supplierUrl', label: 'Odkaz na objednání', kind: 'url' },
  { key: 'description', label: 'Popis', kind: 'multiline', hint: 'Předvyplní se, dá se přepsat' },
];

const TEXT_KEYS = ['brand', 'unit', 'supplier', 'supplierUrl', 'description'] as const;
const NUMBER_KEYS = ['unitCost', 'packageSize', 'minQuantity', 'criticalQuantity', 'maxQuantity'] as const;

export function normalizeDefaults(raw: any): ItemDefaults {
  if (!raw || typeof raw !== 'object') return {};
  const out: ItemDefaults = {};
  TEXT_KEYS.forEach(k => {
    const v = String(raw[k] ?? '').trim();
    if (v) (out as any)[k] = v.slice(0, k === 'description' ? 300 : 120);
  });
  NUMBER_KEYS.forEach(k => {
    const n = Number(raw[k]);
    if (Number.isFinite(n) && n >= 0) (out as any)[k] = n;
  });
  return out;
}

export function hasDefaults(d: ItemDefaults | null | undefined): boolean {
  return !!d && Object.keys(d).length > 0;
}

/**
 * The defaults that apply to a category: its own, layered on top of everything
 * its ancestors set, so a general rule high up still holds further down while a
 * subcategory can override a single field.
 */
export function mergeDefaults(chain: (ItemDefaults | null | undefined)[]): ItemDefaults {
  return chain.reduce<ItemDefaults>((acc, d) => (d ? { ...acc, ...d } : acc), {});
}
