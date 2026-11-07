// Přihlášení do správy platformy, krok 2: šestimístný kód z autentizační aplikace.
//
// Platí jen s cookie „krok" z kroku 1 (heslo sedělo, před méně než 5 minutami).
// Kód se ověří proti klíči správce (okno ±30 s) a jeho krok se zapíše — stejný
// kód podruhé neprojde. Při prvním přihlášení tím zároveň potvrdí nový klíč.
// Úspěch = cookie relace správy na 12 hodin.
import { NextResponse } from 'next/server';
import { klientIp } from '@/lib/klientIp';
import { hit, clear } from '@/lib/rateLimit';
import { jeSpravcePodleDb } from '@/lib/superadminDb';
import { COOKIE_KROK, COOKIE_RELACE, PLATNOST_RELACE_S, cookieZHlavicky, over, setCookie, tajemstviSpravy, vydej } from '@/lib/spravaRelace';
import { nactiTotp, pouzijKrok } from '@/lib/spravaDb';
import { overTotp } from '@/lib/totp';
import { chyba, naHostuSpravy, teloJson, HLASKA_NEPOVEDLO, HLASKA_LIMIT, HLASKA_VYPRSELO } from '../_spolecne';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!naHostuSpravy(request)) return chyba('Nenalezeno.', 404);
  const tajemstvi = tajemstviSpravy();
  const userId = over('krok', cookieZHlavicky(request.headers.get('cookie'), COOKIE_KROK), tajemstvi);
  if (!userId || !tajemstvi) return chyba(HLASKA_VYPRSELO, 401);

  const ip = await hit(`sprava-ip:${klientIp(request.headers)}`, 20, 15 * 60, { failClosed: true });
  const ucet = await hit(`sprava-kod:${userId}`, 5, 15 * 60, { failClosed: true });
  if (!ip.ok || !ucet.ok) return chyba(HLASKA_LIMIT, 429);

  const b = await teloJson(request);
  if (!(await jeSpravcePodleDb(userId))) return chyba(HLASKA_NEPOVEDLO, 401);
  const totp = await nactiTotp(userId);
  const krok = totp ? overTotp(totp.klic, b.kod, Date.now()) : null;
  if (krok === null || !(await pouzijKrok(userId, krok))) return chyba('Kód nesedí. Opiš aktuální kód z aplikace.', 401);

  await clear(`sprava-kod:${userId}`);
  const r = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  r.headers.append('Set-Cookie', setCookie(COOKIE_KROK, null, 0));
  r.headers.append('Set-Cookie', setCookie(COOKIE_RELACE, vydej('relace', userId, tajemstvi), PLATNOST_RELACE_S));
  return r;
}
