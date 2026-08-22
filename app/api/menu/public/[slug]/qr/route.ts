// QR kód konkrétního menu jako SVG.
//
// Stránka menu má jeden QR zapečený v sobě (kvůli offline), ale ten míří na
// výchozí akční menu. Jakmile má podnik menu víc, potřebuje každé svůj —
// a generovat ho tady je jednodušší než po každé změně adresy sahat do
// statického souboru.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import QRCode from 'qrcode';
import { cleanSlug } from '@/lib/menu';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/** Adresa, na kterou má QR vést — počítá s tím, že aplikace běží za proxy. */
function verejnaAdresa(request: Request, slug: string): string {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  // Výchozí menu má čistou adresu, aby zůstaly platné QR kódy vytištěné dřív.
  const cesta = slug === 'akce' ? '/menu-akce.html' : `/menu-akce.html?menu=${encodeURIComponent(slug)}`;
  return `${proto}://${host}${cesta}`;
}

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const slug = cleanSlug(params.slug);
  if (!slug) return NextResponse.json({ error: 'Neplatná adresa menu' }, { status: 400 });

  // QR se vydá jen pro menu, které existuje a je zapnuté — ať se z toho
  // nestane generátor QR na libovolný text.
  try {
    const [board] = await sql`
      SELECT id FROM menu_boards WHERE slug = ${slug} AND enabled IS NOT FALSE ORDER BY id LIMIT 1`;
    if (!board) return NextResponse.json({ error: 'Menu nenalezeno' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Menu zatím není nastavené' }, { status: 404 });
  }

  const svg = await QRCode.toString(verejnaAdresa(request, slug), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: '#1C1C1C', light: '#0000' },
  });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Adresa menu se mění výjimečně, ale ne nikdy — hodina je rozumný kompromis.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
