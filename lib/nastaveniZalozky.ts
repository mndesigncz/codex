// Záložky Nastavení a odkazy na ně (?view=settings&tab=<id>).
// Čistý modul bez Reactu: layouty (vedení i zaměstnanec) z něj berou platné id,
// aniž by tahaly celé Nastavení; testy: scripts/testy/k79-nastaveni.ts, k81-nastaveni.ts.

export type SectionId =
  | 'account' | 'jazyk' | 'app' | 'notifications' | 'security' | 'privacy' | 'zkratky'
  | 'team' | 'billing' | 'podnik' | 'organizace' | 'audit' | 'pos' | 'roles' | 'stranky' | 'nahlaseni';

export const ZALOZKY_NASTAVENI: readonly SectionId[] = [
  'account', 'jazyk', 'app', 'notifications', 'security', 'privacy', 'zkratky',
  'team', 'billing', 'podnik', 'organizace', 'audit', 'pos', 'roles', 'stranky', 'nahlaseni',
];

/** Skupina záložky: „Osobní" (můj účet, platí v každém podniku) a „Podnik" (nastavení podniku). */
export type SkupinaNastaveni = 'osobni' | 'podnik';

/**
 * Do které skupiny záložka patří. Nadpisy skupin kreslí boční pás na počítači
 * i svislý seznam sekcí na telefonu (kolo 6, balík B3) — jedno rozdělení pro obojí.
 * `Record` drží úplnost: nová záložka bez skupiny neprojde typovou kontrolou.
 */
export const SKUPINA_ZALOZKY: Record<SectionId, SkupinaNastaveni> = {
  account: 'osobni', jazyk: 'osobni', app: 'osobni', notifications: 'osobni', security: 'osobni', privacy: 'osobni', zkratky: 'osobni',
  // Organizace (kolo 7): vlastní sekce jen pro podnik v organizaci — dřív čtvrtá karta pod Tým › Podnik,
  // kam nápověda „Všechny podniky" odkazovala na sekci, která v pásu nebyla.
  podnik: 'podnik', organizace: 'podnik', roles: 'podnik', stranky: 'podnik', pos: 'podnik', billing: 'podnik', audit: 'podnik', nahlaseni: 'podnik', team: 'podnik',
};

/** Pořadí skupin v seznamu i v bočním pásu. */
export const SKUPINY_NASTAVENI: readonly SkupinaNastaveni[] = ['osobni', 'podnik'];

/** Cokoli z adresy → platná záložka, jinak undefined (Nastavení pak otevře Účet). */
export function zalozkaNastaveni(v: unknown): SectionId | undefined {
  return ZALOZKY_NASTAVENI.find(z => z === v);
}

/**
 * Otevřít na telefonu rovnou sekci, ne seznam sekcí? Jen když o záložku někdo
 * výslovně požádal (odkaz `?tab=`, banner předplatného, paleta hledání). Účet je
 * výchozí hodnota, kterou layouty posílají vždycky — ta znamená „Nastavení", tedy seznam.
 */
export function otevritSekciRovnou(v: unknown): boolean {
  const z = zalozkaNastaveni(v);
  return !!z && z !== 'account';
}
