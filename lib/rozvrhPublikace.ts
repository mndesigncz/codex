// Stav publikování rozvrhu (kolo 7, R7-1 — první krok nálezu „rozvrh-publikovani-bez-stavu").
//
// Publikovat dřív jen rozeslalo upozornění a nic si nezapamatovalo: majitel nevěděl, jestli
// listopad už publikoval, ani že se od té doby něco změnilo. POST /api/schedule/publish teď
// zapíše do schedule_publications čas, autora, počet směn a otisk směn měsíce; GET
// /api/schedule vrátí { publishedAt, zmeneno } a plánovač ukáže Chip v hlavičce.
//
// Otisk je TENTÝŽ výraz, kterým GET /api/schedule počítá `verze` měsíce (a generátor ji
// ověřuje při uložení návrhu) — md5 přes id, člověka, den a časy směn. Změna času, nová
// i smazaná směna otisk změní; poznámka ke směně ne (není to změna rozvrhu, kvůli které by
// se mělo znovu budit celý tým). Počet změn se záměrně neukazuje: úpravy času a mazání by
// ho rozbily a číslo by lhalo.
//
// Čistý modul bez Reactu a databáze (test scripts/testy/k83-rozvrh.ts).

export type StavPublikace = 'nepublikovano' | 'publikovano' | 'zmeneno';

/**
 * Stav měsíce pro Chip v plánovači:
 *  - nepublikováno — žádný záznam o publikování (Chip jen, když měsíc má směny),
 *  - publikováno — otisk směn je stejný jako při publikování,
 *  - změněno od publikování — otisk se liší.
 * Neznámý otisk (výpočet selhal, starší záznam) se nehádá jako změna: rozhodne počet
 * směn, pokud ho záznam má; jinak „publikováno".
 */
export function stavPublikace(o: {
  publishedAt: string | Date | null | undefined;
  ulozenyOtisk?: string | null;
  aktualniOtisk?: string | null;
  /** Počet směn při publikování (schedule_publications.shift_count). */
  ulozenyPocet?: number | null;
  /** Počet směn v měsíci teď. */
  pocetSmen: number;
}): StavPublikace {
  if (!o.publishedAt) return 'nepublikovano';
  if (o.ulozenyOtisk && o.aktualniOtisk) return o.ulozenyOtisk === o.aktualniOtisk ? 'publikovano' : 'zmeneno';
  if (o.ulozenyPocet != null && Number.isFinite(o.ulozenyPocet) && o.ulozenyPocet !== o.pocetSmen) return 'zmeneno';
  return 'publikovano';
}

/** Publikace z odpovědi GET /api/schedule (`publication`), nebo null u neznámého tvaru. */
export interface Publikace { publishedAt: string; zmeneno: boolean }
export function publikaceZOdpovedi(raw: unknown): Publikace | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { publishedAt?: unknown; zmeneno?: unknown };
  return typeof r.publishedAt === 'string' && r.publishedAt ? { publishedAt: r.publishedAt, zmeneno: r.zmeneno === true } : null;
}

/** Stav pro Chip v plánovači z publikace v odpovědi; „Nepublikováno" se ukáže jen s nějakou směnou. */
export function stavChipu(publikace: Publikace | null, pocetSmen: number): StavPublikace | null {
  if (!publikace) return pocetSmen > 0 ? 'nepublikovano' : null;
  return publikace.zmeneno ? 'zmeneno' : 'publikovano';
}
