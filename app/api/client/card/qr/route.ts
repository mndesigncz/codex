// QR kartičky jako SVG — nese jen kód, nic osobního.
import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { customer, ensureCard } from '@/lib/client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export async function GET() {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const code = await ensureCard(me.id);
  const svg = await QRCode.toString(code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#16181A', light: '#00000000' } });
  return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, no-store' } });
}
