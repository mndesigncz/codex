// Kartička hosta: jeden kód pro všechny podniky. Ukáže ji u kasy, obsluha
// načte nebo opíše a dá razítko či body za nákup — i bez rezervace.
import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { customer, ensureCard } from '@/lib/client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export async function GET() {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const code = await ensureCard(me.id);
  // QR jde rovnou s kódem jako SVG, ať se kartička vykreslí najednou a bez druhého požadavku.
  const svg = await QRCode.toString(code, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#16181A', light: '#00000000' } });
  return NextResponse.json({ code, name: me.name, svg });
}
