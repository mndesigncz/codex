// Brána průvodce na serveru: kam poslat člověka, který otevřel aplikaci.
//
// Rozhoduje SERVER, ne klient: klient by nejdřív ukázal aplikaci a teprve
// pak přesměroval (záblesk Přehledu před průvodcem). Podnik se bere z databáze
// (users.team_id), ne z tokenu — token nese podnik z posledního přihlášení.
//
// Brána je FAIL-OPEN: když se databáze nedá přečíst (výpadek, nasazení před
// migrací sloupce, sondy bez databáze), vrací `null` a aplikace se chová jako
// dřív. Průvodce nikdy nesmí být důvod, proč se člověk nedostane do aplikace.

import { neon } from '@neondatabase/serverless';
import { jeStav, type StavPruvodce } from './typy.ts';

export interface InfoOBrane {
  /** Přihlášený je vlastník aktivního podniku. */
  vlastnik: boolean;
  /** Stav průvodce; null = podnik z doby před průvodcem. */
  stav: StavPruvodce | null;
}

/** Nejdéle tak dlouho se čeká na databázi; pak se brána otevře (fail-open). */
export const LIMIT_BRANY_MS = 2500;

export async function infoOBrane(userId: number): Promise<InfoOBrane | null> {
  if (!Number.isFinite(userId)) return null;
  const dotaz = (async (): Promise<InfoOBrane | null> => {
    const sql = neon(process.env.DATABASE_URL!);
    const [t] = await sql`SELECT owner_id, onboarding FROM teams WHERE id = (SELECT team_id FROM users WHERE id = ${userId})`;
    if (!t) return null;
    const s = (t.onboarding as { stav?: unknown } | null)?.stav;
    return { vlastnik: Number(t.owner_id) === userId, stav: jeStav(s) ? s : null };
  })();
  const limit = new Promise<null>(res => setTimeout(() => res(null), LIMIT_BRANY_MS));
  try { return await Promise.race([dotaz, limit]); } catch { return null; }
}

/** Má se nový vlastník poslat do průvodce? Jen stav `nove`; rozpracované a přeskočené ne. */
export function maJitDoPruvodce(info: InfoOBrane | null): boolean {
  return !!info && info.vlastnik && info.stav === 'nove';
}
