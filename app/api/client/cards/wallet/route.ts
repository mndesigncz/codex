// Karta do peněženky z aplikace z obchodu (obal): prohlížeč systému nemá přihlášení z aplikace.
//   POST { team, druh: 'apple' | 'google' }  (přihlášený host) → { url } podepsaný odkaz na 10 minut
//   GET  ?t=<odkaz>                           .pkpass (Apple), nebo přesměrování na „Uložit do Google Wallet“
// Na webu se dál otevírá přímo /api/client/card/wallet/… (prohlížeč přihlášení má). Viz lib/kartyWalletOdkaz.ts.

import { NextRequest, NextResponse } from 'next/server';
import { customer, sql } from '@/lib/client';
import { hit } from '@/lib/rateLimit';
import { appleKonfig, googleKonfig } from '@/lib/walletKonfig';
import { dataKartyHosta } from '@/lib/walletDb';
import { sestavPkpass } from '@/lib/walletApple';
import { odkazUlozitDoGoogle } from '@/lib/walletGoogle';
import { jazykPozadavku } from '@/lib/i18n/jazykPozadavku';
import { podepisOdkaz, overOdkaz } from '@/lib/kartyWalletOdkaz';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const tajemstvi = () => process.env.NEXTAUTH_SECRET ?? '';

export async function POST(req: NextRequest) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const druh = b.druh === 'google' ? 'google' : b.druh === 'apple' ? 'apple' : null;
  const slug = String(b.team ?? '').slice(0, 80);
  if (!druh || !slug || !tajemstvi()) return NextResponse.json({ error: 'Kartu se nepodařilo vytvořit.' }, { status: 400 });
  if (druh === 'apple' ? !appleKonfig() : !googleKonfig()) return NextResponse.json({ error: 'Kartu se nepodařilo vytvořit.' }, { status: 404 });
  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || req.nextUrl.origin;
  return NextResponse.json({ url: `${origin}/api/client/cards/wallet?t=${encodeURIComponent(podepisOdkaz({ customerId: me.id, slug, druh }, tajemstvi()))}` });
}

export async function GET(req: NextRequest) {
  const o = overOdkaz(req.nextUrl.searchParams.get('t'), tajemstvi());
  if (!o) return NextResponse.json({ error: 'Odkaz na kartu vypršel. Otevři ho v aplikaci znovu.' }, { status: 410 });
  const limit = await hit(`wallet:${o.u}`, 20, 60 * 60);
  if (!limit.ok) return NextResponse.json({ error: 'Moc pokusů najednou — chvilku počkej.' }, { status: 429 });
  let u: any;
  try { [u] = await sql`SELECT id, name FROM users WHERE id = ${o.u} AND role = 'customer' AND deleted_at IS NULL`; }
  catch { [u] = await sql`SELECT id, name FROM users WHERE id = ${o.u} AND role = 'customer'`; }
  if (!u) return NextResponse.json({ error: 'Tuhle kartu nemáš.' }, { status: 404 });
  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || req.nextUrl.origin;
  try {
    const d = await dataKartyHosta({ id: Number(u.id), name: String(u.name) }, o.s, origin, await jazykPozadavku());
    if (!d) return NextResponse.json({ error: 'Tuhle kartu nemáš.' }, { status: 404 });
    if (o.d === 'apple') {
      const cfg = appleKonfig();
      if (!cfg) return NextResponse.json({ error: 'Apple Wallet není zapnutý.' }, { status: 404 });
      return new NextResponse(Buffer.from(sestavPkpass(cfg, d)), {
        headers: { 'Content-Type': 'application/vnd.apple.pkpass', 'Content-Disposition': `attachment; filename="karta-${d.teamId}.pkpass"`, 'Cache-Control': 'private, no-store' },
      });
    }
    const cfg = googleKonfig();
    if (!cfg) return NextResponse.json({ error: 'Google Wallet není zapnutý.' }, { status: 404 });
    return NextResponse.redirect(await odkazUlozitDoGoogle(cfg, d, origin), { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('wallet odkaz', e);
    return NextResponse.json({ error: 'Kartu se nepodařilo vytvořit.' }, { status: 500 });
  }
}
