// Efektivní sleva člena: úroveň a slevové skupiny. Bez importů ze serveru,
// ať to jde i do prohlížeče (karta hosta, seznam členů).
//
// Pravidlo jako v Kartičce: člen ve víc skupinách (a s úrovní) bere NEJVYŠŠÍ
// z nabízených slev, nikdy jejich součet. Při shodě vyhrává úroveň — je to
// výchozí zdroj a hostovi se nemění text, když skupina nic nepřidá.

export interface SlevaSkupiny { name: string; discount: number }

export interface EfektivniSleva {
  /** Sleva v procentech, 0–100. */
  pct: number;
  /** Odkud sleva je: z úrovně, ze skupiny, nebo nikde (0 %). */
  zdroj: 'uroven' | 'skupina' | null;
  /** Název skupiny, nebo úrovně (např. „Zlatý host"); null bez slevy. */
  nazev: string | null;
}

const procenta = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

export function efektivniSleva(vstup: {
  uroven?: { discount?: number | null; label?: string | null } | null;
  skupiny?: SlevaSkupiny[] | null;
}): EfektivniSleva {
  let pct = procenta(vstup.uroven?.discount);
  let zdroj: EfektivniSleva['zdroj'] = pct > 0 ? 'uroven' : null;
  let nazev: string | null = pct > 0 ? (vstup.uroven?.label ?? null) : null;
  for (const g of vstup.skupiny ?? []) {
    const d = procenta(g?.discount);
    if (d > pct) { pct = d; zdroj = 'skupina'; nazev = String(g?.name ?? '') || null; }
  }
  return { pct, zdroj, nazev };
}
