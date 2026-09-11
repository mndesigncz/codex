// QR na stůl: vede rovnou na objednávku od tohoto stolu. Tisk z prohlížeče.
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { sql, employer, ensureProfile } from '@/lib/client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export async function GET(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const url = new URL(req.url);
  const tableId = parseInt(String(url.searchParams.get('tableId')), 10);
  const [t] = await sql`SELECT id, name, token FROM client_tables WHERE id = ${tableId} AND team_id = ${u.team_id}`;
  if (!t) return NextResponse.json({ error: 'Stůl nenalezen' }, { status: 404 });
  const p = await ensureProfile(u.team_id);
  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || url.origin;
  const target = `${origin}/client/${p.slug}?tab=order&table=${t.id}${t.token ? `&t=${t.token}` : ''}`;
  const svg = await QRCode.toString(target, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#16181A', light: '#FFFFFF' } });
  if (url.searchParams.get('format') === 'svg') return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
  const [team] = await sql`SELECT name FROM teams WHERE id = ${u.team_id}`;
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>QR · ${t.name}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;color:#16181A;display:grid;place-items:center;min-height:100vh;background:#fff}
.k{width:88mm;padding:10mm;border:1px solid #ddd;border-radius:8mm;text-align:center}.k svg{width:60mm;height:60mm}
h1{font-size:22pt;margin:4mm 0 1mm}p{margin:0;color:#555;font-size:11pt}.s{font-size:16pt;font-weight:700;margin-top:3mm}
@media print{.k{border:none}}</style></head><body><div class="k">${svg}<h1>${String(team?.name ?? '').replace(/</g, '&lt;')}</h1><p>Naskenuj a objednej od stolu</p><p class="s">Stůl ${String(t.name).replace(/</g, '&lt;')}</p></div><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
