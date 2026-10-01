// Záložky Nastavení a odkazy na ně (?view=settings&tab=<id>).
// Čistý modul bez Reactu: layouty (vedení i zaměstnanec) z něj berou platné id,
// aniž by tahaly celé Nastavení; testy: scripts/testy/k79-nastaveni.ts.

export type SectionId =
  | 'account' | 'jazyk' | 'app' | 'notifications' | 'security' | 'privacy' | 'zkratky'
  | 'team' | 'billing' | 'podnik' | 'audit' | 'pos' | 'roles' | 'stranky' | 'nahlaseni';

export const ZALOZKY_NASTAVENI: readonly SectionId[] = [
  'account', 'jazyk', 'app', 'notifications', 'security', 'privacy', 'zkratky',
  'team', 'billing', 'podnik', 'audit', 'pos', 'roles', 'stranky', 'nahlaseni',
];

/** Cokoli z adresy → platná záložka, jinak undefined (Nastavení pak otevře Účet). */
export function zalozkaNastaveni(v: unknown): SectionId | undefined {
  return ZALOZKY_NASTAVENI.find(z => z === v);
}
