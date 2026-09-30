// Měna podniku pro texty, které skládá server (rady, poznámky, ztráty).
// Čistá část — formátování a prahy — je v lib/mena.ts.

import { neon } from '@neondatabase/serverless';
import { menaZRadku, type MenaPodniku } from './mena';

export { menaZRadku, prahVMene, type MenaPodniku } from './mena';

const sql = neon(process.env.DATABASE_URL!);

/** Měna podniku; při výpadku nebo před migrací koruna jako dřív. */
export async function menaPodniku(teamId: number): Promise<MenaPodniku> {
  try {
    const [t] = await sql`SELECT currency, locale FROM teams WHERE id = ${teamId}`;
    return menaZRadku(t?.currency, t?.locale);
  } catch {
    return menaZRadku();
  }
}
