// Výběr tvaru po číslovce. Jedno místo pro všech pět jazyků.
//
// Čeština a slovenština: 1 = one, 2–4 = few, všechno ostatní = other.
// Kategorii `many` čeština zná jen pro zlomky, a `lib/czech.ts` ji historicky
// používá pro „0 a 5+" (CzNoun.many). Tady se proto `many` u cs/sk bere jako
// `other` a výběr padá přes řetěz kategorie → other → many. Pravidlo pro cs/sk
// je psané ručně a je stejné, jaké mělo czForm před přechodem (i pro zlomky:
// 2,5 je „few"), aby se nezměnilo jediné skloňování v aplikaci.
//
// Angličtina, němčina a polština jdou přes Intl.PluralRules: polsky je 5
// „many" (5–21, 25–31…), „few" jsou 2–4 a 22–24 (ne 12–14), „other" zlomky.

import type { Jazyk } from './config.ts';

export type Kategorie = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
export type Tvary = Record<string, string | undefined>;

const pravidla = new Map<string, Intl.PluralRules>();

/** Kategorie pro číslo v jazyce; u cs/sk vrací jen one/few/other. */
export function kategorie(jazyk: Jazyk, n: number): Kategorie {
  if (jazyk === 'cs' || jazyk === 'sk') {
    const abs = Math.abs(n);
    if (abs === 1) return 'one';
    if (abs >= 2 && abs <= 4) return 'few';
    return 'other';
  }
  let pr = pravidla.get(jazyk);
  if (!pr) { pr = new Intl.PluralRules(jazyk); pravidla.set(jazyk, pr); }
  return pr.select(n) as Kategorie;
}

/**
 * Tvar pro číslo. Přesná shoda `=N` má přednost (např. `=0`), potom kategorie,
 * potom `other`, nakonec `many` (kvůli CzNoun, kde `many` znamená „ostatní").
 * Vrací prázdný řetězec, když není nic z toho: volající si tak nikdy
 * nezobrazí `undefined`.
 */
export function vyberTvar(jazyk: Jazyk, n: number, tvary: Tvary): string {
  const presny = tvary[`=${n}`];
  if (presny !== undefined) return presny;
  const k = kategorie(jazyk, n);
  return tvary[k] ?? tvary.other ?? tvary.many ?? '';
}
