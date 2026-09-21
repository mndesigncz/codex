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
    return rozhodniSpravce({ id: u.id, role: u.role });
  } catch {
    // Bez databáze není správce — radši zavřené dveře než otevřené.
    return false;
  }
}
