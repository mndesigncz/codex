// Zápis a čtení souhlasu s podmínkami a zásadami (spuštění, balík P). Pravidla jsou
// v lib/pravni/verze.ts; tady jen databáze.
//
// Zápis jde samostatným UPDATE po založení účtu, ne do INSERT: před migrací sloupce
// terms_version / privacy_version chybí a založení účtu kvůli tomu nesmí spadnout.
// Nepovedený zápis se jen zaloguje — brána nové verze se pak člověka zeptá znovu.

import { neon } from '@neondatabase/serverless';
import { VERZE_PODMINEK, VERZE_ZASAD } from './verze';
import { zapisSouhlasPlatformy } from '../consentsDb';

const sql = neon(process.env.DATABASE_URL!);

/** Uloží souhlas s dnešními verzemi a čas. Vrací, jestli se zápis povedl. */
export async function zapisSouhlas(userId: number, kanal: 'registrace' | 'brana' = 'registrace'): Promise<boolean> {
  try {
    await sql`UPDATE users SET terms_version = ${VERZE_PODMINEK}, privacy_version = ${VERZE_ZASAD}, terms_accepted_at = NOW() WHERE id = ${userId}`;
    // Spuštění (balík G): i jako řádky v tabulce souhlasů (jen přidávání), ať je celá historie na jednom místě.
    await zapisSouhlasPlatformy(userId, VERZE_PODMINEK, VERZE_ZASAD, kanal);
    return true;
  } catch (e) {
    console.error('souhlas: zápis se nepovedl', userId, (e as { code?: string })?.code ?? e);
    return false;
  }
}

/** Uložené verze souhlasu; null = sloupce ještě nejsou (před migrací) nebo účet neexistuje. */
export async function nactiSouhlas(userId: number): Promise<{ terms_version: string | null; privacy_version: string | null; terms_accepted_at: string | null; role: string | null } | null> {
  try {
    const [r] = await sql`SELECT role, terms_version, privacy_version, terms_accepted_at FROM users WHERE id = ${userId}`;
    if (!r) return null;
    return {
      role: r.role == null ? null : String(r.role),
      terms_version: r.terms_version ?? null,
      privacy_version: r.privacy_version ?? null,
      terms_accepted_at: r.terms_accepted_at ? new Date(r.terms_accepted_at as string).toISOString() : null,
    };
  } catch {
    return null;
  }
}

/** Vlastní člověk aspoň jeden podnik? (Brána nové verze mu ukáže i obchodní podmínky a DPA.) Chyba = ne. */
export async function jeVlastnikPodniku(userId: number): Promise<boolean> {
  try {
    const r = await sql`SELECT 1 FROM teams WHERE owner_id = ${userId} LIMIT 1`;
    return r.length > 0;
  } catch {
    return false;
  }
}
