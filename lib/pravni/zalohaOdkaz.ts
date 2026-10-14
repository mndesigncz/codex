// Odkaz na zálohu dat podniku (spuštění, balík P).
//
// Denní e-mail se zálohou dřív nesl celou zálohu jako nešifrovanou přílohu:
// soukromé zprávy, sazby a mzdy ležely ve schránkách a jejich zálohách bez
// jakékoli kontroly přístupu. Teď e-mail nese jen odkaz s podpisem (HMAC přes
// NEXTAUTH_SECRET), platný 7 dní. Odkaz sám nic nevydá: endpoint
// /api/backup/stahnout navíc chce přihlášení člověka s oprávněním data.zaloha
// v tom podniku a zálohu skládá až v tu chvíli (nikde se neukládá).
//
// Čistý modul bez databáze (testy: scripts/testy/k88-pravni-zaloha.ts).

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Jak dlouho odkaz z e-mailu platí. */
export const PLATNOST_ODKAZU_DNI = 7;

/** Tajemství kratší než tohle se nepoužije: podpis by šel uhodnout. */
const MIN_TAJEMSTVI = 16;

function podpis(teamId: number, exp: number, tajemstvi: string): string {
  return createHmac('sha256', tajemstvi).update(`zaloha:${teamId}:${exp}`).digest('base64url');
}

/**
 * Token do odkazu: `<podnik>.<vyprseni v sekundách>.<podpis>`. Bez tajemství
 * (nebo s krátkým) vrací null — odkaz, který nejde ověřit, se neposílá.
 */
export function podepisOdkazZalohy(teamId: number, tajemstvi: string | undefined, ted: Date = new Date()): string | null {
  if (!tajemstvi || tajemstvi.length < MIN_TAJEMSTVI) return null;
  if (!Number.isInteger(teamId) || teamId <= 0) return null;
  const exp = Math.floor(ted.getTime() / 1000) + PLATNOST_ODKAZU_DNI * 86400;
  return `${teamId}.${exp}.${podpis(teamId, exp, tajemstvi)}`;
}

export type OvereniOdkazu = { ok: true; teamId: number; vyprsi: Date } | { ok: false; duvod: 'neplatny' | 'vyprsel' };

/** Ověří token z odkazu: podpis v konstantním čase, pak platnost. */
export function overOdkazZalohy(token: unknown, tajemstvi: string | undefined, ted: Date = new Date()): OvereniOdkazu {
  if (!tajemstvi || tajemstvi.length < MIN_TAJEMSTVI) return { ok: false, duvod: 'neplatny' };
  if (typeof token !== 'string' || token.length > 200) return { ok: false, duvod: 'neplatny' };
  const m = /^(\d{1,10})\.(\d{1,12})\.([A-Za-z0-9_-]{20,100})$/.exec(token);
  if (!m) return { ok: false, duvod: 'neplatny' };
  const teamId = Number(m[1]);
  const exp = Number(m[2]);
  if (!Number.isSafeInteger(teamId) || teamId <= 0 || !Number.isSafeInteger(exp)) return { ok: false, duvod: 'neplatny' };
  const cekany = Buffer.from(podpis(teamId, exp, tajemstvi));
  const dany = Buffer.from(m[3]);
  if (cekany.length !== dany.length || !timingSafeEqual(cekany, dany)) return { ok: false, duvod: 'neplatny' };
  if (exp * 1000 <= ted.getTime()) return { ok: false, duvod: 'vyprsel' };
  return { ok: true, teamId, vyprsi: new Date(exp * 1000) };
}

/** Cesta odkazu z e-mailu (základ adresy doplní volající). */
export function cestaOdkazuZalohy(token: string): string {
  return `/api/backup/stahnout?t=${encodeURIComponent(token)}`;
}

/**
 * Sloupce, které do zálohy nesmí, ať jsou v kterékoli tabulce: sazby a mzdové
 * údaje (hodinová sazba, výdělek ze směny, výplata z kasy, typ a rozsah smlouvy,
 * nárok na dovolenou, pravidla výplat), přístupové údaje (hash hesla, tokeny
 * pozvánek a sdílených odkazů, token Noisia) a interní poznámka správce platformy.
 */
export const VYRAZENE_SLOUPCE: readonly string[] = [
  'hourly_rate', 'wage_rate', 'wage_earned', 'self_payout', 'contract_type', 'contract_hours_year', 'vacation_per_year', 'pay_rules',
  'password_hash', 'token', 'token_hash', 'noisium_token', 'admin_note',
];

/** Řádek bez vyřazených sloupců (nový objekt, vstup se nemění). */
export function bezVyrazenych<T extends Record<string, unknown>>(radek: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(radek)) if (!VYRAZENE_SLOUPCE.includes(k)) out[k] = v;
  return out as Partial<T>;
}

/** Druhy konverzací, které do zálohy patří: jen týmový kanál (vidí ho celý tým, tedy i příjemce). */
export const KONVERZACE_V_ZALOZE: readonly string[] = ['team'];
