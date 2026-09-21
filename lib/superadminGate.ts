// Jediná odpověď na „smí tohle správce platformy?" — pro REST, stránky i MCP.
//
// Dvě cesty dovnitř: přihlášená session, jejíž uživatel je podle DATABÁZE
// správce (role vedení, id účtu v `SUPERADMIN_USER_IDS`),
// nebo Bearer token pro Clauda a skripty. Obě končí stejným `actor`, který
// se zapisuje do historie zásahů — takže je vždycky vidět, jestli podnik
// pozastavil člověk z obrazovky, nebo Claude přes MCP.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { jeSpravcePodleDb } from '@/lib/superadminDb';
import { adminTokenOk } from '@/lib/adminToken';

export type AdminActor =
  | { via: 'session'; email: string; userId: number }
  | { via: 'token'; email: 'api-token'; userId: null };

export type Gate =
  | { ok: true; actor: AdminActor }
  | { ok: false; status: 401 | 403; error: string };

export async function requireSuperadmin(request?: Request): Promise<Gate> {
  const auth = request?.headers.get('authorization') ?? null;
  if (auth && adminTokenOk(auth)) return { ok: true, actor: { via: 'token', email: 'api-token', userId: null } };

  const s = await getServerSession(authOptions);
  if (!s?.user) return { ok: false, status: 401, error: 'Nepřihlášen' };
  const userId = parseInt(String((s.user as { id?: string }).id));
  // Podle databáze, ne podle e-mailu v tokenu: role musí být vedení a e-mail
  // bez dvojníka. Viz rozhodniSpravce v lib/superadmin.ts.
  if (!(await jeSpravcePodleDb(userId))) return { ok: false, status: 403, error: 'Tohle může jen správce platformy.' };
  const email = String(s.user.email ?? '').trim().toLowerCase();
  return { ok: true, actor: { via: 'session', email, userId } };
}
