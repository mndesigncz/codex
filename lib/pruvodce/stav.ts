// Stav průvodce v databázi — jediné místo, které čte a píše `teams.onboarding`.
// Jen pro server. Sloupec přibyl s průvodcem, takže se před migrací (/api/init
// po nasazení) všechno chová, jako by průvodce neexistoval: čtení vrací
// „nedostupné", zápis se tiše vzdá a volající nic nerozbije.

import { neon } from '@neondatabase/serverless';
import type { Onboarding } from './typy.ts';
import { cistiOnboarding } from './schema.ts';

const sql = neon(process.env.DATABASE_URL!);

/** Postgres „sloupec neexistuje" (42703) a „tabulka neexistuje" (42P01): nasazeno před migrací. */
export const jePredMigraci = (e: unknown): boolean => {
  const c = (e as { code?: unknown } | null)?.code;
  return c === '42703' || c === '42P01';
};

export interface NactenyStav {
  /** Sloupec existuje a dotaz prošel. */
  dostupne: boolean;
  /** null = podnik z doby před průvodcem (nebo poškozený záznam). */
  onboarding: Onboarding | null;
  /** Vlastník podniku (teams.owner_id). */
  vlastnikId: number | null;
}

/** Stav průvodce podniku; chybu databáze (jinou než před migrací) vyhodí. */
export async function nactiStav(teamId: number): Promise<NactenyStav> {
  try {
    const [t] = await sql`SELECT owner_id, onboarding FROM teams WHERE id = ${teamId}`;
    if (!t) return { dostupne: false, onboarding: null, vlastnikId: null };
    return { dostupne: true, onboarding: cistiOnboarding(t.onboarding), vlastnikId: t.owner_id != null ? Number(t.owner_id) : null };
  } catch (e) {
    if (jePredMigraci(e)) {
      // Bez sloupce aspoň vlastníka, ať se dá rozhodnout o oprávnění.
      try {
        const [t] = await sql`SELECT owner_id FROM teams WHERE id = ${teamId}`;
        return { dostupne: false, onboarding: null, vlastnikId: t?.owner_id != null ? Number(t.owner_id) : null };
      } catch { return { dostupne: false, onboarding: null, vlastnikId: null }; }
    }
    throw e;
  }
}

/** Zapíše celý záznam. Vrací false před migrací; jinou chybu vyhodí. */
export async function ulozStav(teamId: number, o: Onboarding): Promise<boolean> {
  try {
    await sql`UPDATE teams SET onboarding = ${JSON.stringify(o)}::jsonb WHERE id = ${teamId}`;
    return true;
  } catch (e) {
    if (jePredMigraci(e)) return false;
    throw e;
  }
}

export interface PodnikProPruvodce {
  name: string;
  currency: string;
  locale: string;
  week_start: number;
  business_type: string | null;
  opening_hours: Record<string, unknown> | null;
  address: string | null;
  country: string | null;
  join_code: string | null;
}

/** Co v podniku teď je — předvyplnění průvodce. Každý dotaz zvlášť: chybějící sloupec nevezme ostatní. */
export async function nactiPodnik(teamId: number): Promise<PodnikProPruvodce> {
  const p: PodnikProPruvodce = { name: '', currency: 'CZK', locale: 'cs-CZ', week_start: 1, business_type: null, opening_hours: null, address: null, country: null, join_code: null };
  try {
    const [t] = await sql`SELECT name, join_code FROM teams WHERE id = ${teamId}`;
    p.name = String(t?.name ?? '');
    p.join_code = t?.join_code ?? null;
  } catch { /* jádro se čte vždy; chyba se ukáže jinde */ }
  try {
    const [t] = await sql`SELECT currency, locale, week_start, business_type FROM teams WHERE id = ${teamId}`;
    if (t) { p.currency = t.currency || 'CZK'; p.locale = t.locale || 'cs-CZ'; p.week_start = t.week_start ?? 1; p.business_type = t.business_type ?? null; }
  } catch { /* před migrací */ }
  try {
    const [t] = await sql`SELECT opening_hours FROM teams WHERE id = ${teamId}`;
    p.opening_hours = t?.opening_hours && typeof t.opening_hours === 'object' && Object.keys(t.opening_hours).length ? t.opening_hours : null;
  } catch { /* před migrací */ }
  try {
    const [t] = await sql`SELECT address, country FROM teams WHERE id = ${teamId}`;
    p.address = t?.address ?? null;
    p.country = t?.country ?? null;
  } catch { /* před migrací */ }
  return p;
}
