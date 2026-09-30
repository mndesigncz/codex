// Jednorázové odkazy z e-mailu: obnovení hesla a potvrzení smazání účtu.
//
// Čisté, bez databáze (testy: scripts/testy/k77-ucet.ts).
//  * Token je 32 náhodných bajtů (256 bitů), v databázi je jen jeho SHA-256
//    otisk: kdo získá kopii databáze, z otisku se k účtu nedostane.
//  * Platí krátce a jen jednou (`used_at`).
//  * Odpověď na žádost je vždy stejná, ať e-mail existuje, nebo ne (nejde
//    tak zjistit, kdo je v aplikaci registrovaný).

import { createHash, randomBytes } from 'node:crypto';

/** Jak dlouho platí odkaz na obnovení hesla. */
export const RESET_PLATNOST_MIN = 60;
/** Jak dlouho platí odkaz na potvrzení smazání účtu. */
export const SMAZANI_PLATNOST_MIN = 60;

export function hashTokenu(token: string): string {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function novyToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashTokenu(token) };
}

/** Token v požadavku vypadá jako náš (délka a znaky); levné odmítnutí smetí před dotazem do databáze. */
export function vypadaJakoToken(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(t);
}

export interface RadekTokenu { expires_at: Date | string; used_at: Date | string | null }

/** Je řádek použitelný: nevypršel a nebyl použit. */
export function jePlatny(r: RadekTokenu | null | undefined, ted: Date = new Date()): boolean {
  if (!r) return false;
  if (r.used_at) return false;
  const exp = new Date(r.expires_at).getTime();
  return Number.isFinite(exp) && exp > ted.getTime();
}

export function vyprseni(minut: number, ted: Date = new Date()): Date {
  return new Date(ted.getTime() + minut * 60_000);
}

/** Heslo aspoň 8 znaků (stejné pravidlo jako registrace a změna hesla). */
export function hesloStaci(h: unknown): h is string {
  return typeof h === 'string' && h.length >= 8 && h.length <= 200;
}

/**
 * Kam vede odkaz v e-mailu: host do hostovské části (universal link ho otevře
 * v Managero client), ostatní do provozní.
 */
export function cestaObnoveniHesla(role: string | null | undefined, token: string): string {
  const q = `?token=${encodeURIComponent(token)}`;
  return role === 'customer' ? `/client/nove-heslo${q}` : `/nove-heslo${q}`;
}
