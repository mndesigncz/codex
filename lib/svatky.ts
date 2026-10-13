// České státní svátky jako čistá funkce (kolo 8, R8-1 — příplatky ve mzdě).
//
// Aplikace dosud svátky neznala, takže „K výplatě" u kavárny otevřené 28. září
// bylo systematicky nízko — od roku 2024 mají nárok na příplatek za svátek
// i lidé na DPP a DPČ. Pevné svátky jsou tabulka, Velký pátek a Velikonoční
// pondělí se dopočítají z data Velikonoc (Meeus/Jones/Butcher), takže modul
// nepotřebuje žádný externí seznam a platí pro libovolný rok.
//
// Bez Reactu a bez databáze: čte ho lib/dochazkaPrehled (příplatkový rozpad
// záznamu) a testy v scripts/testy/k84-vyplaty.ts. Dny jsou pražské
// „RRRR-MM-DD" — stejný tvar, jaký nese denZaznamu a rozvrh.

import { dayPlus } from './pragueTime.ts';

/** Pevné svátky „MM-DD" → název (zákon č. 245/2000 Sb.). */
export const PEVNE_SVATKY: readonly { md: string; nazev: string }[] = [
  { md: '01-01', nazev: 'Den obnovy samostatného českého státu' },
  { md: '05-01', nazev: 'Svátek práce' },
  { md: '05-08', nazev: 'Den vítězství' },
  { md: '07-05', nazev: 'Den slovanských věrozvěstů Cyrila a Metoděje' },
  { md: '07-06', nazev: 'Den upálení mistra Jana Husa' },
  { md: '09-28', nazev: 'Den české státnosti' },
  { md: '10-28', nazev: 'Den vzniku samostatného československého státu' },
  { md: '11-17', nazev: 'Den boje za svobodu a demokracii' },
  { md: '12-24', nazev: 'Štědrý den' },
  { md: '12-25', nazev: '1. svátek vánoční' },
  { md: '12-26', nazev: '2. svátek vánoční' },
];

/** Velikonoční neděle daného roku (gregoriánský kalendář, algoritmus Meeus/Jones/Butcher) jako „RRRR-MM-DD". */
export function velikonocniNedele(rok: number): string {
  const a = rok % 19, b = Math.floor(rok / 100), c = rok % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesic = Math.floor((h + l - 7 * m + 114) / 31);
  const den = ((h + l - 7 * m + 114) % 31) + 1;
  return `${rok}-${String(mesic).padStart(2, '0')}-${String(den).padStart(2, '0')}`;
}

const cache = new Map<number, Map<string, string>>();

/** Všechny státní svátky roku: den „RRRR-MM-DD" → název. Velký pátek je svátkem od roku 2016. */
export function ceskeSvatky(rok: number): Map<string, string> {
  const hotove = cache.get(rok);
  if (hotove) return hotove;
  const m = new Map<string, string>();
  for (const s of PEVNE_SVATKY) m.set(`${rok}-${s.md}`, s.nazev);
  const nedele = velikonocniNedele(rok);
  if (rok >= 2016) m.set(dayPlus(nedele, -2), 'Velký pátek');
  m.set(dayPlus(nedele, 1), 'Velikonoční pondělí');
  cache.set(rok, m);
  return m;
}

/** Název svátku pro den „RRRR-MM-DD", nebo null, když to svátek není (i pro nečitelný vstup). */
export function nazevSvatku(den: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) return null;
  return ceskeSvatky(Number(den.slice(0, 4))).get(den) ?? null;
}

export function jeSvatek(den: string): boolean {
  return nazevSvatku(den) != null;
}

/** Sobota nebo neděle (den „RRRR-MM-DD"). */
export function jeVikend(den: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) return false;
  const d = new Date(`${den}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}
