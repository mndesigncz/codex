// QR kuponu hosta jako SVG: text „managero:coupon:ABC-DEF“. Vydá se jen majiteli
// vyzvednutého a dosud neuplatněného kuponu; obsluha ho načte v Kartičce hosta.
import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { sql, customer } from '@/lib/client';
import { kuponPayload } from '@/lib/kuponQr';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  const [cl] = await sql`SELECT code, redeemed_at FROM client_coupon_claims WHERE id = ${id} AND customer_id = ${me.id}`;
  if (!cl) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 404 });
  if (cl.redeemed_at) return NextResponse.json({ error: 'Kupon už je uplatněný' }, { status: 410 });
  const svg = await QRCode.toString(kuponPayload(String(cl.code)), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#16181A', light: '#FFFFFF' } });
  return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
