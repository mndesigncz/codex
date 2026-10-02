// Karta hosta v Google Wallet: GET /api/client/card/wallet/google?team=<adresa podniku>
// přesměruje na „Uložit do Google Wallet“ (JWT podepsané servisním účtem).
// Jen pro přihlášeného hosta a jen jeho vlastní karta; bez konfigurace 404.
import { NextRequest, NextResponse } from 'next/server';
import { customer } from '@/lib/client';
import { hit } from '@/lib/rateLimit';
import { googleKonfig } from '@/lib/walletKonfig';
import { dataKartyHosta } from '@/lib/walletDb';
import { odkazUlozitDoGoogle } from '@/lib/walletGoogle';
import { jazykPozadavku } from '@/lib/i18n/jazykPozadavku';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const cfg = googleKonfig();
  if (!cfg) return NextResponse.json({ error: 'Google Wallet není zapnutý.' }, { status: 404 });
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const limit = await hit(`wallet:${me.id}`, 20, 60 * 60);
  if (!limit.ok) return NextResponse.json({ error: 'Moc pokusů najednou — chvilku počkej.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });
  const slug = String(req.nextUrl.searchParams.get('team') ?? '').slice(0, 80);
  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || req.nextUrl.origin;
  try {
    const d = await dataKartyHosta(me, slug, origin, await jazykPozadavku());
    if (!d) return NextResponse.json({ error: 'Tuhle kartu nemáš.' }, { status: 404 });
    const url = await odkazUlozitDoGoogle(cfg, d, origin);
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('wallet google', e);
    return NextResponse.json({ error: 'Kartu se nepodařilo vytvořit.' }, { status: 500 });
  }
}
