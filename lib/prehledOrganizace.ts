// Konsolidovaný přehled — čísla za víc podniků na jedné obrazovce.
//
// Čistá část bez databáze: co je jeden řádek za podnik, jak se sčítá celek
// a jak se rozhoduje, kdo přehled smí vidět. Sčítat se smí jen to, co má
// stejnou jednotku — tržby v různých měnách se nesčítají, přehled to
// přizná místo toho, aby sečetl koruny s eury.

import type { Clenstvi, NastaveniOrganizace } from './organizace';

export interface RadekPodniku {
  teamId: number;
  name: string;
  currency: string;
  /** Tržby z uzávěrek za období (hotově + kartou), bez akcí a bez stubů kolegů. */
  revenue: number;
  /** Mzdy z docházky × sazba (lib/wages), jen uzavřené záznamy. */
  wages: number;
  closings: number;
  /** Dny se směnou bez uzávěrky (do včerejška). */
  missingClosings: number;
  pendingApproval: number;
  members: number;
  onShiftNow: number;
  /** Položky skladu, které docházejí nebo jsou kriticky nízko. */
  stockAlerts: number;
}

export interface Souhrn {
  /** Měna celku, nebo null když se podniky v měně liší — pak se nesčítá. */
  currency: string | null;
  revenue: number;
  wages: number;
  /** Mzdy jako podíl tržeb v procentech; null bez tržeb. */
  laborPct: number | null;
  missingClosings: number;
  pendingApproval: number;
  onShiftNow: number;
  stockAlerts: number;
}

export function souhrn(radky: RadekPodniku[]): Souhrn {
  const meny = new Set(radky.map(r => r.currency));
  const jednaMena = meny.size <= 1;
  const revenue = jednaMena ? radky.reduce((s, r) => s + r.revenue, 0) : 0;
  const wages = jednaMena ? radky.reduce((s, r) => s + r.wages, 0) : 0;
  return {
    currency: jednaMena ? (radky[0]?.currency ?? null) : null,
    revenue, wages,
    laborPct: jednaMena && revenue > 0 ? Math.round((wages / revenue) * 1000) / 10 : null,
    missingClosings: radky.reduce((s, r) => s + r.missingClosings, 0),
    pendingApproval: radky.reduce((s, r) => s + r.pendingApproval, 0),
    onShiftNow: radky.reduce((s, r) => s + r.onShiftNow, 0),
    stockAlerts: radky.reduce((s, r) => s + r.stockAlerts, 0),
  };
}

/**
 * Které podniky smí člověk v přehledu vidět: jen ty z organizace, kde je
 * členem jako VEDENÍ. Vlastník organizace bez členství v pobočce ji nevidí —
 * to by byl tichý superadmin (stejné pravidlo jako u přepínání).
 */
export function podnikyProPrehled(clenstvi: Clenstvi[], organizationId: number): number[] {
  return clenstvi
    .filter(c => c.organizationId === organizationId && c.role === 'employer')
    .map(c => c.teamId);
}

export type DuvodOdmitnuti = 'bez_organizace' | 'vypnuto' | 'jeden_podnik' | null;

/** Proč přehled nejde ukázat — nebo null, když jde. */
export function procNejde(org: { nastaveni: NastaveniOrganizace } | null, viditelne: number[]): DuvodOdmitnuti {
  if (!org) return 'bez_organizace';
  if (!org.nastaveni.konsolidovanyPrehled) return 'vypnuto';
  if (viditelne.length < 2) return 'jeden_podnik';
  return null;
}

/** „2026-09" → [„2026-09-01", „2026-09-30"]. */
export function hraniceMesice(month: string): [string, string] | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  const posledni = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(posledni).padStart(2, '0')}`];
}
