// The toggleable widgets on each dashboard. The employer can hide any of these
// for their own dashboard or for their employees' dashboards. A widget is shown
// unless the team's dashboard_config sets it to false.

export type Widget = { id: string; label: string; hint?: string };

export const EMPLOYER_WIDGETS: Widget[] = [
  { id: 'shortcuts', label: 'Rychlý přístup', hint: 'Dlaždice na to, co řešíš každý den.' },
  { id: 'clock', label: 'Píchačky vedení', hint: 'Příchod/odchod pro tebe.' },
  { id: 'kpis', label: 'Klíčové metriky', hint: 'Zaměstnanci, směny, úkoly, sklad.' },
  { id: 'onShift', label: 'Právě na směně', hint: 'Kdo je zrovna napíchnutý.' },
  { id: 'rateShifts', label: 'Ohodnotit směny', hint: 'Rychlé hodnocení dnešních směn.' },
  { id: 'announcements', label: 'Nástěnka oznámení' },
  { id: 'availability', label: 'Dostupnost týmu' },
  { id: 'lowStock', label: 'Nízké zásoby' },
  { id: 'todayShifts', label: 'Dnešní směny' },
];

export const EMPLOYEE_WIDGETS: Widget[] = [
  { id: 'shortcuts', label: 'Rychlý přístup', hint: 'Zkratky na to, co se dělá každou směnu.' },
  { id: 'nextShift', label: 'Nejbližší směna' },
  { id: 'feedback', label: 'Hodnocení směny', hint: 'Zpětná vazba od vedení a co napravit.' },
  { id: 'stats', label: 'Statistiky', hint: 'Úkoly, zprávy, odpracované hodiny.' },
  { id: 'announcements', label: 'Oznámení' },
  { id: 'closing', label: 'Uzávěrka směny' },
  { id: 'availability', label: 'Připomínka dostupnosti' },
  { id: 'lowStock', label: 'Docházející zásoby' },
];

// A widget is visible unless explicitly disabled in the config.
export function isWidgetOn(config: Record<string, any> | undefined | null, id: string): boolean {
  return !config || config[id] !== false;
}

// ---- Quick-access shortcuts -------------------------------------------------
// Tiles the employer composes per dashboard, so the things people actually do
// every shift are one tap away instead of buried in the menu.

export interface Shortcut {
  label: string;
  /** 'view:<id>' jumps to a nav view, 'inventory:<Kategorie>' opens the stock
   *  filtered to that category. */
  target: string;
  icon?: string;
}

export function normalizeShortcuts(raw: any): Shortcut[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: any) => ({
      label: String(s?.label ?? '').trim().slice(0, 40),
      target: String(s?.target ?? '').trim().slice(0, 80),
      icon: s?.icon ? String(s.icon).slice(0, 24) : undefined,
    }))
    .filter(s => s.label && s.target)
    .slice(0, 8);
}

export function readShortcuts(config: Record<string, any> | undefined | null): Shortcut[] {
  return normalizeShortcuts(config?.shortcuts);
}

/** Splits 'inventory:Tabáky' into its kind and argument. */
export function parseTarget(target: string): { kind: string; arg: string } {
  const i = target.indexOf(':');
  return i === -1 ? { kind: target, arg: '' } : { kind: target.slice(0, i), arg: target.slice(i + 1) };
}
