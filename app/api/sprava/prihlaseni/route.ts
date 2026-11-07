// Přihlášení do správy platformy, krok 1: e-mail a heslo účtu Managero.
//
// Heslo ověřuje stejná funkce jako přihlášení aplikace (najdiUcetHeslem
// v lib/auth.ts). Projde jen účet, který je podle databáze správce
// (jeSpravcePodleDb). Výsledek je krátká cookie „krok" (5 min) a pokyn,
// co dál: opsat kód z aplikace, nebo si ji nejdřív nastavit (QR + klíč).
import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { najdiUcetHeslem } from '@/lib/auth';
import { normalizujEmail } from '@/lib/emailAdresa';
import { klientIp } from '@/lib/klientIp';
import { hit, clear } from '@/lib/rateLimit';
import { jeSpravcePodleDb } from '@/lib/superadminDb';
import { COOKIE_KROK, PLATNOST_KROKU_S, setCookie, tajemstviSpravy, vydej } from '@/lib/spravaRelace';
import { nactiTotp, ulozCekajiciTotp } from '@/lib/spravaDb';
import { novyKlic, otpauthUri, klicProOpis } from '@/lib/totp';
import { chyba, naHostuSpravy, teloJson, HLASKA_NEPOVEDLO, HLASKA_LIMIT } from '../_spolecne';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!naHostuSpravy(request)) return chyba('Nenalezeno.', 404);
  const tajemstvi = tajemstviSpravy();
  if (!tajemstvi) return chyba(HLASKA_NEPOVEDLO, 503);
  const b = await teloJson(request);
  const zadany = String(b.email ?? '').slice(0, 320);
  const heslo = String(b.heslo ?? '');
  const email = normalizujEmail(zadany);
  if (!email || !heslo || heslo.length > 200) return chyba(HLASKA_NEPOVEDLO, 401);

  // Přísnější než přihlášení aplikace: správu používá jeden člověk.
  const ip = await hit(`sprava-ip:${klientIp(request.headers)}`, 20, 15 * 60, { failClosed: true });
  const ucet = await hit(`sprava-login:${email}`, 5, 15 * 60, { failClosed: true });
  if (!ip.ok || !ucet.ok) return chyba(HLASKA_LIMIT, 429);

  const nalez = await najdiUcetHeslem(email, zadany, heslo, 'podnik').catch(() => null);
  if (!nalez || !(await jeSpravcePodleDb(nalez.user.id))) return chyba(HLASKA_NEPOVEDLO, 401);
  const userId = nalez.user.id;
  await clear(`sprava-login:${email}`);

  const odpoved = (body: unknown) => {
    const r = NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
    r.headers.append('Set-Cookie', setCookie(COOKIE_KROK, vydej('krok', userId, tajemstvi), PLATNOST_KROKU_S));
    return r;
  };

  const totp = await nactiTotp(userId);
  if (totp?.potvrzeno) return odpoved({ krok: 'kod' });

  // První přihlášení (nebo po resetu): nový klíč čeká, až ho správce potvrdí kódem.
  const klic = novyKlic();
  if (!(await ulozCekajiciTotp(userId, klic))) return odpoved({ krok: 'kod' });
  const uri = otpauthUri({ klic, ucet: String(nalez.user.email ?? email) });
  const svg = await QRCode.toString(uri, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#16181A', light: '#FFFFFF' } });
  return odpoved({ krok: 'nastaveni', klic: klicProOpis(klic), uri, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` });
}
