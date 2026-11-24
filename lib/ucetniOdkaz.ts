// Podepsaný odkaz na podklady pro účetní (bez účtu v aplikaci).
//
// Účetní nemá v podniku účet a mít nemusí: dostane odkaz (e-mailem nebo zkopírovaný),
// který 14 dní stahuje ZIP s podklady za jedno období. Odkaz nese podnik, období,
// příznak výplat, verzi odkazů podniku a konec platnosti; podpis je HMAC-SHA256
// přes tajemství aplikace (jako lib/pravni/zalohaOdkaz.ts). Odvolání všech odkazů
// najednou = zvýšení `teams.accountant_link_ver` (starý odkaz pak nesedí verzí).
// ZIP se skládá až při stažení — v odkazu ani nikde jinde se data neukládají.
//
// Čistý modul bez databáze (testy: scripts/testy/ucetni-export.ts).

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Jak dlouho odkaz platí. */
export const PLATNOST_ODKAZU_UCETNI_DNI = 14;
const MIN_TAJEMSTVI = 16;

export interface ObsahOdkazu {
  teamId: number;
  od: string;
  do: string;
  /** Smí odkaz vydat i výplaty (tvůrce měl `finance.mzdy`). */
  mzdy: boolean;
  /** Verze odkazů podniku v okamžiku vytvoření. */
  verze: number;
}

const RE_DEN = /^\d{4}-\d{2}-\d{2}$/;

function podpis(telo: string, tajemstvi: string): string {
  return createHmac('sha256', tajemstvi).update(`ucetni:${telo}`).digest('base64url');
}

/**
 * Token: `<podnik>.<od bez pomlček>.<do bez pomlček>.<mzdy 0|1>.<verze>.<vyprseni s>.<podpis>`.
 * Bez tajemství (nebo s krátkým) null — neověřitelný odkaz se nevydá.
 */
export function podepisOdkazUcetni(o: ObsahOdkazu, tajemstvi: string | undefined, ted: Date = new Date()): string | null {
  if (!tajemstvi || tajemstvi.length < MIN_TAJEMSTVI) return null;
  if (!Number.isSafeInteger(o.teamId) || o.teamId <= 0 || !Number.isSafeInteger(o.verze) || o.verze <= 0) return null;
  if (!RE_DEN.test(o.od) || !RE_DEN.test(o.do)) return null;
  const exp = Math.floor(ted.getTime() / 1000) + PLATNOST_ODKAZU_UCETNI_DNI * 86400;
  const telo = `${o.teamId}.${o.od.replace(/-/g, '')}.${o.do.replace(/-/g, '')}.${o.mzdy ? 1 : 0}.${o.verze}.${exp}`;
  return `${telo}.${podpis(telo, tajemstvi)}`;
}

export type OvereniOdkazuUcetni =
  | { ok: true; obsah: ObsahOdkazu; vyprsi: Date }
  | { ok: false; duvod: 'neplatny' | 'vyprsel' };

const den = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

/** Ověří podpis (konstantní čas) a platnost. Verzi podniku porovná volající s databází (`platnaVerze`). */
export function overOdkazUcetni(token: unknown, tajemstvi: string | undefined, ted: Date = new Date()): OvereniOdkazuUcetni {
  if (!tajemstvi || tajemstvi.length < MIN_TAJEMSTVI) return { ok: false, duvod: 'neplatny' };
  if (typeof token !== 'string' || token.length > 300) return { ok: false, duvod: 'neplatny' };
  const m = /^(\d{1,10})\.(\d{8})\.(\d{8})\.([01])\.(\d{1,9})\.(\d{1,12})\.([A-Za-z0-9_-]{20,100})$/.exec(token);
  if (!m) return { ok: false, duvod: 'neplatny' };
  const telo = token.slice(0, token.lastIndexOf('.'));
  const cekany = Buffer.from(podpis(telo, tajemstvi));
  const dany = Buffer.from(m[7]);
  if (cekany.length !== dany.length || !timingSafeEqual(cekany, dany)) return { ok: false, duvod: 'neplatny' };
  const teamId = Number(m[1]), verze = Number(m[5]), exp = Number(m[6]);
  if (!Number.isSafeInteger(teamId) || teamId <= 0 || !Number.isSafeInteger(exp)) return { ok: false, duvod: 'neplatny' };
  if (exp * 1000 <= ted.getTime()) return { ok: false, duvod: 'vyprsel' };
  return { ok: true, obsah: { teamId, od: den(m[2]), do: den(m[3]), mzdy: m[4] === '1', verze }, vyprsi: new Date(exp * 1000) };
}

/** Sedí verze z odkazu s aktuální verzí odkazů podniku? (Po „Zneplatnit všechny odkazy" už ne.) */
export function platnaVerze(obsah: Pick<ObsahOdkazu, 'verze'>, verzePodniku: unknown): boolean {
  const v = Number(verzePodniku ?? 1);
  return Number.isSafeInteger(v) && v > 0 && obsah.verze === v;
}

/** Cesta odkazu (základ adresy doplní volající). */
export function cestaOdkazuUcetni(token: string): string {
  return `/api/ucetni/odkaz?t=${encodeURIComponent(token)}`;
}
