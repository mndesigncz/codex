// Karta hosta jako .pkpass pro Apple Wallet: GET /api/client/card/wallet/apple?team=<adresa podniku>.
// Jen pro přihlášeného hosta a jen jeho vlastní karta v podniku, kde je členem.
// Bez nastavených certifikátů Apple (lib/walletKonfig) odpoví 404 a nic se nenabízí.
import { NextRequest, NextResponse } from 'next/server';
import { customer } from '@/lib/client';
import { hit } from '@/lib/rateLimit';
import { appleKonfig } from '@/lib/walletKonfig';
import { dataKartyHosta } from '@/lib/walletDb';
import { sestavPkpass } from '@/lib/walletApple';
import { jazykPozadavku } from '@/lib/i18n/jazykPozadavku';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const cfg = appleKonfig();
  if (!cfg) return NextResponse.json({ error: 'Apple Wallet není zapnutý.' }, { status: 404 });
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const limit = await hit(`wallet:${me.id}`, 20, 60 * 60);
  if (!limit.ok) return NextResponse.json({ error: 'Moc pokusů najednou — chvilku počkej.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });
  const slug = String(req.nextUrl.searchParams.get('team') ?? '').slice(0, 80);
  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || req.nextUrl.origin;
  try {
    const d = await dataKartyHosta(me, slug, origin, await jazykPozadavku());
    if (!d) return NextResponse.json({ error: 'Tuhle kartu nemáš.' }, { status: 404 });
    const pkpass = sestavPkpass(cfg, d);
    return new NextResponse(Buffer.from(pkpass), {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="karta-${d.teamId}.pkpass"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('wallet apple', e);
    return NextResponse.json({ error: 'Kartu se nepodařilo vytvořit.' }, { status: 500 });
  }
}
