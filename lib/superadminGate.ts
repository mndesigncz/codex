// Jediná odpověď na „smí tohle správce platformy?" — pro REST, stránky i MCP.
//
// Dvě cesty dovnitř:
//  - Bearer token (`ADMIN_API_TOKEN`) pro Clauda, MCP a skripty — odkudkoli;
//  - relace správy: cookie z přihlášení na admin.managero.app (heslo + kód
//    z autentizační aplikace, app/api/sprava/*), jen na hostu správy, a účet
//    musí být podle DATABÁZE správce (role vedení, id účtu v
//    `SUPERADMIN_USER_IDS`) — ověřuje se při každém požadavku.
// Relace aplikace (NextAuth) sem už nevede: kdo je přihlášený na www, do
// správy se tím nedostane.
//
// Obě cesty končí stejným `actor`, který se zapisuje do historie zásahů — takže
// je vždycky vidět, jestli podnik pozastavil člověk z obrazovky, nebo Claude přes MCP.

import { adminTokenOk } from '@/lib/adminToken';
import { spravceZPozadavku, hostPozadavku } from '@/lib/spravaServer';

export type AdminActor =
  | { via: 'session'; email: string; userId: number }
  | { via: 'token'; email: 'api-token'; userId: null };

export type Gate =
  | { ok: true; actor: AdminActor }
  | { ok: false; status: 401 | 403; error: string };

export async function requireSuperadmin(request?: Request): Promise<Gate> {
  const auth = request?.headers.get('authorization') ?? null;
  if (auth && adminTokenOk(auth)) return { ok: true, actor: { via: 'token', email: 'api-token', userId: null } };
  if (!request) return { ok: false, status: 401, error: 'Nepřihlášen' };

  // Cookie relace správy + host správy + znovu podle databáze (jeSpravcePodleDb
  // uvnitř spravceZPozadavku). Kdo nemá relaci, je nepřihlášený — neříká se,
  // jestli by správcem byl.
  const s = await spravceZPozadavku({ cookie: request.headers.get('cookie'), host: hostPozadavku(request.headers) });
  if (!s) return { ok: false, status: 401, error: 'Nepřihlášen' };
  return { ok: true, actor: { via: 'session', email: s.email || `ucet-${s.userId}`, userId: s.userId } };
}
