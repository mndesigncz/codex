// Správce platformy podle databáze, ne podle toho, co říká session.
//
// Volá se při přihlášení (výsledek jde do JWT, middleware ho jen čte),
// při obnovení session a v bráně admin API. Rozhodnutí samotné je čisté
// v lib/superadmin.ts; tohle jen přinese řádek — role se bere z databáze,
// ne z tokenu.

import { neon } from '@neondatabase/serverless';
import { rozhodniSpravce } from '@/lib/superadmin';

const sql = neon(process.env.DATABASE_URL!);

export async function jeSpravcePodleDb(userId: number): Promise<boolean> {
  if (!Number.isInteger(userId) || userId <= 0) return false;
  try {
    const [u] = await sql`SELECT id, role FROM users WHERE id = ${userId}`;
    if (!u) return false;
    // users.role je role v AKTIVNÍM podniku. Správce, který se přepnul do
    // podniku, kde je jen zaměstnancem, správcem zůstává — rozhoduje, jestli
    // je NĚKDE vedením. Tablet a host členství vedení nemají nikdy.
    let role = String(u.role);
    if (role === 'employee') {
      try {
        const [m] = await sql`SELECT 1 FROM team_members WHERE user_id = ${userId} AND role = 'employer' LIMIT 1`;
        if (m) role = 'employer';
      } catch { /* před migrací */ }
    }
    return rozhodniSpravce({ id: u.id, role });
  } catch {
    // Bez databáze není správce — radši zavřené dveře než otevřené.
    return false;
  }
}
