// Je podnik pozastavený? Pro veřejné cesty bez přihlášení.
//
// Middleware zastaví lidi podniku (mají token). Sdílený odkaz na nabídku,
// veřejné menu z QR a adresář podniků ale nikdo nemá přihlášený — a
// pozastavený podnik nesmí mít ani veřejnou tvář. Před migrací sloupec
// není: pak podnik pozastavený není, ne že by veřejné stránky spadly.

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function podnikJePozastaveny(teamId: number | null | undefined): Promise<boolean> {
  if (teamId == null || !Number.isFinite(Number(teamId))) return false;
  try {
    const [t] = await sql`SELECT blocked_at FROM teams WHERE id = ${Number(teamId)}`;
    return !!t?.blocked_at;
  } catch { return false; }
}
