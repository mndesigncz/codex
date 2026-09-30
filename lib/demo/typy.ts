// Společné typy mock serveru ukázky.

import type { DemoStav } from './stav';

export interface Pozadavek {
  metoda: string;
  url: URL;
  /** Cesta bez query, např. `/api/tasks`. */
  cesta: string;
  q: URLSearchParams;
  /** Tělo požadavku: JSON rozparsovaný, jinak text, jinak null. */
  telo: any;
}

export interface Odpoved {
  status?: number;
  telo: unknown;
  /** Zpoždění odpovědi v ms (generování rozvrhu se má dát „vidět"). */
  zpozdeni?: number;
}

/** Událost pro rodiče (prodejní stránku): coach marks a přepínač scén. */
export type HlaseniAkce = (akce: string, detail?: Record<string, unknown>) => void;

export interface Kontext {
  stav: DemoStav;
  hlas: HlaseniAkce;
}

/** Handler vrací odpověď, nebo `undefined` = „tohle nevyřizuju". */
export type Obsluha = (p: Pozadavek, k: Kontext) => Odpoved | undefined;

export const ok = (telo: unknown = { ok: true }, status = 200): Odpoved => ({ status, telo });
export const chyba = (zprava: string, status = 400, extra: Record<string, unknown> = {}): Odpoved => ({ status, telo: { error: zprava, ...extra } });
