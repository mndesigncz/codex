// The toggleable widgets on each dashboard. The employer can hide any of these
// for their own dashboard or for their employees' dashboards. A widget is shown
// unless the team's dashboard_config sets it to false.

export type Widget = { id: string; label: string; hint?: string };

export const EMPLOYER_WIDGETS: Widget[] = [
  { id: 'clock', label: 'Píchačky vedení', hint: 'Příchod/odchod pro tebe.' },
  { id: 'kpis', label: 'Klíčové metriky', hint: 'Zaměstnanci, směny, úkoly, sklad.' },
  { id: 'onShift', label: 'Právě na směně', hint: 'Kdo je zrovna napíchnutý.' },
  { id: 'announcements', label: 'Nástěnka oznámení' },
  { id: 'availability', label: 'Dostupnost týmu' },
  { id: 'lowStock', label: 'Nízké zásoby' },
  { id: 'todayShifts', label: 'Dnešní směny' },
];

export const EMPLOYEE_WIDGETS: Widget[] = [
  { id: 'nextShift', label: 'Nejbližší směna' },
  { id: 'stats', label: 'Statistiky', hint: 'Úkoly, zprávy, odpracované hodiny.' },
  { id: 'announcements', label: 'Oznámení' },
  { id: 'closing', label: 'Uzávěrka směny' },
  { id: 'availability', label: 'Připomínka dostupnosti' },
  { id: 'lowStock', label: 'Docházející zásoby' },
];

// A widget is visible unless explicitly disabled in the config.
export function isWidgetOn(config: Record<string, boolean> | undefined | null, id: string): boolean {
  return !config || config[id] !== false;
}
