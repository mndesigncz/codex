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

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.next();
  const raw = (token as { teamId?: unknown }).teamId;
  const teamId = raw == null ? null : Number(raw);
  const r = rozhodni({
    pathname: req.nextUrl.pathname,
    teamId,
    blokovane: await blokovane(),
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
