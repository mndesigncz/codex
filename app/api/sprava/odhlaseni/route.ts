// Odhlášení ze správy platformy: smaže cookie relace (i rozpracovaný krok přihlášení).
import { NextResponse } from 'next/server';
import { COOKIE_KROK, COOKIE_RELACE, setCookie } from '@/lib/spravaRelace';
import { chyba, naHostuSpravy } from '../_spolecne';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!naHostuSpravy(request)) return chyba('Nenalezeno.', 404);
  const r = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  r.headers.append('Set-Cookie', setCookie(COOKIE_RELACE, null, 0));
  r.headers.append('Set-Cookie', setCookie(COOKIE_KROK, null, 0));
  return r;
}
