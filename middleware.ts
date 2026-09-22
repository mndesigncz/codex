// Pozastavený podnik nedostane dál ani jeden požadavek.
//
// Běží před každou API routou i stránkou aplikace. Rozhodnutí samotné je
// v `lib/blokace.ts` (čisté, testované); tady se jen přečte token, stáhne
// seznam pozastavených podniků a výsledek se přeloží na odpověď.
//
// Seznam se drží 30 s v paměti isolátu. Dotaz na každý požadavek by stál
// desítky milisekund na 99 routách; půl minuty zpoždění blokace je cena,
// kterou za to podnik zaplatí rád. Když databáze nejde, seznam se NEMĚNÍ:
// výpadek nesmí ani pustit pozastavené, ani zablokovat všechny.

import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { neon } from '@neondatabase/serverless';
import { rozhodni, ZPRAVA_423 } from '@/lib/blokace';
import { ciziPuvod } from '@/lib/puvod';

export const config = {
  matcher: ['/api/:path*', '/employer/:path*', '/employee/:path*', '/kiosk/:path*', '/client/:path*'],
};

const TTL_MS = 30_000;
let cache: { at: number; ids: Set<number> } = { at: 0, ids: new Set() };

async function blokovane(): Promise<Set<number>> {
  if (Date.now() - cache.at < TTL_MS) return cache.ids;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT id FROM teams WHERE blocked_at IS NOT NULL`;
    cache = { at: Date.now(), ids: new Set((rows as { id: number }[]).map(r => Number(r.id))) };
  } catch {
    // Před migrací sloupec neexistuje; při výpadku databáze zůstane, co bylo.
    cache = { at: Date.now(), ids: cache.ids };
  }
  return cache.ids;
}

// Aktivní podnik podle databáze. Token nese tým z posledního přihlášení
// nebo obnovy relace; kdo se přepnul a obnovu vynechal, měl by v tokenu
// jiný podnik než routy (ty čtou databázi). Blokace proto kontroluje OBA.
const tymCache = new Map<number, { at: number; teamId: number | null }>();
async function aktivniTym(userId: number): Promise<number | null | undefined> {
  const c = tymCache.get(userId);
  if (c && Date.now() - c.at < TTL_MS) return c.teamId;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const [u] = await sql`SELECT team_id FROM users WHERE id = ${userId}`;
    const teamId = u?.team_id == null ? null : Number(u.team_id);
    if (tymCache.size > 5000) tymCache.clear();
    tymCache.set(userId, { at: Date.now(), teamId });
    return teamId;
  } catch {
    return undefined;
  }
}

export async function middleware(req: NextRequest) {
  // CSRF: mutace z cizí stránky se zamítne dřív, než se čte relace.
  if (req.nextUrl.pathname.startsWith('/api/')
    && ciziPuvod(req.method, req.headers.get('origin'), req.headers.get('x-forwarded-host') ?? req.headers.get('host'))) {
    return NextResponse.json({ error: 'Požadavek z cizí stránky byl zamítnut.' }, { status: 403 });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.next();
  const raw = (token as { teamId?: unknown }).teamId;
  const tokenTeam = raw == null ? null : Number(raw);
  const blok = await blokovane();
  // Rozhoduje tým z databáze; když je nedostupná, tým z tokenu. A když je
  // pozastavený kterýkoli z nich, platí blokace.
  const dbTeam = blok.size && token.sub ? await aktivniTym(Number(token.sub)) : undefined;
  const teamId = dbTeam != null && blok.has(dbTeam) ? dbTeam : tokenTeam;
  const r = rozhodni({
    pathname: req.nextUrl.pathname,
    teamId,
    blokovane: blok,
    // Rozhodnuto při přihlášení podle databáze (lib/superadminDb), ne podle e-mailu v tokenu.
    superadmin: (token as { superadmin?: unknown }).superadmin === true,
  });
  if (r.akce === 'pustit') return NextResponse.next();
  if (r.akce === 'api') return NextResponse.json({ error: ZPRAVA_423 }, { status: r.status });
  const url = req.nextUrl.clone();
  url.pathname = r.kam;
  url.search = '';
  return NextResponse.redirect(url);
}
