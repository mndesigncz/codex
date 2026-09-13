// QR na stůl: vede rovnou na objednávku od tohoto stolu. Tisk z prohlížeče.
//
// Vzhled si podnik nastaví (barvy, text, logo, formát archu) — uloženo je
// v profilu, ale dá se poslat i v adrese, aby náhled v administraci ukazoval
// právě rozpracované nastavení bez ukládání.
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { get } from '@vercel/blob';
import { sql, employer, ensureProfile } from '@/lib/client';
import { normalizeQrDesign, QR_SHEETS, esc, type QrDesign } from '@/lib/qrDesign';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Logo do středu kódu. Musí být vloženo přímo, tisk se na naši adresu nedostane. */
async function logoDataUri(teamId: number, logoUrl: string | null): Promise<string | null> {
  const m = /^\/api\/client\/img\/(\d+)$/.exec(String(logoUrl ?? ''));
  if (!m) return null;
  try {
    const [row] = await sql`SELECT mime, data, blob_path FROM uploads WHERE id = ${parseInt(m[1], 10)} AND team_id = ${teamId}`;
    if (!row) return null;
    const mime = String(row.mime || '').toLowerCase().split(';')[0].trim();
    if (!/^image\/(png|jpeg|webp|gif)$/.test(mime)) return null;
    if (row.data) return `data:${mime};base64,${row.data}`;
    if (row.blob_path && process.env.BLOB_READ_WRITE_TOKEN) {
      const r = await get(row.blob_path, { access: 'private' });
      if (r) {
        const buf = Buffer.from(await new Response(r.stream as any).arrayBuffer());
        return `data:${mime};base64,${buf.toString('base64')}`;
      }
    }
  } catch { /* bez loga se kartička vytiskne taky */ }
  return null;
}

/** SVG kódu i s logem uprostřed. Logo ubírá plochu, proto vyšší korekce chyb. */
async function qrSvg(target: string, d: QrDesign, logo: string | null) {
  const svg = await QRCode.toString(target, {
    type: 'svg', margin: 1, errorCorrectionLevel: logo ? 'H' : 'M',
    color: { dark: d.dark, light: d.light },
  });
  if (!logo) return svg;
  // Rozměry bere z viewBoxu, který qrcode vždy vypíše v modulech.
  const vb = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
  const w = vb ? Number(vb[1]) : 33;
  const side = w * 0.22, x = (w - side) / 2, pad = side * 0.12;
  const patch =
    `<rect x="${(x - pad).toFixed(2)}" y="${(x - pad).toFixed(2)}" width="${(side + pad * 2).toFixed(2)}" height="${(side + pad * 2).toFixed(2)}" rx="${(side * 0.18).toFixed(2)}" fill="${d.light}"/>` +
    `<image href="${logo}" x="${x.toFixed(2)}" y="${x.toFixed(2)}" width="${side.toFixed(2)}" height="${side.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`;
  return svg.replace('</svg>', `${patch}</svg>`);
}

export async function GET(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const url = new URL(req.url);
  const q = url.searchParams;
  const p = await ensureProfile(u.team_id);

  // Náhled posílá rozpracované nastavení v adrese; tisk bere uložené.
  const raw = q.get('design');
  let design = normalizeQrDesign(p.qr_design);
  if (raw) { try { design = normalizeQrDesign(JSON.parse(raw)); } catch { /* zůstane uložené */ } }

  const tableId = parseInt(String(q.get('tableId')), 10);
  const all = q.get('all') === '1';
  const tables = all
    ? await sql`SELECT id, name, token FROM client_tables WHERE team_id = ${u.team_id} AND active = TRUE ORDER BY id`
    : await sql`SELECT id, name, token FROM client_tables WHERE id = ${tableId} AND team_id = ${u.team_id}`;
  if (!tables.length) return NextResponse.json({ error: all ? 'Žádné aktivní stoly' : 'Stůl nenalezen' }, { status: 404 });

  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || url.origin;
  const link = (t: any) => `${origin}/client/${p.slug}?tab=order&table=${t.id}${t.token ? `&t=${t.token}` : ''}`;

  if (q.get('format') === 'svg') {
    const logo = design.logo ? await logoDataUri(u.team_id, p.logo_url) : null;
    const svg = await qrSvg(link(tables[0]), design, logo);
    return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
  }

  const [team] = await sql`SELECT name FROM teams WHERE id = ${u.team_id}`;
  const logo = design.logo ? await logoDataUri(u.team_id, p.logo_url) : null;
  const headline = design.headline || String(team?.name ?? '');
  const sheet = QR_SHEETS.find(s => s.id === design.sheet) ?? QR_SHEETS[0];
  const dark = design.style === 'dark';
  const ink = dark ? design.light : '#16181A';
  const paper = dark ? design.dark : design.light;
  // V tmavém provedení se prohodí i samotný kód, jinak by na tmavém papíru zmizel.
  const codeDesign: QrDesign = dark ? { ...design, dark: design.light, light: design.dark } : design;

  const cards: string[] = [];
  for (const t of tables as any[]) {
    const svg = await qrSvg(link(t), codeDesign, logo);
    cards.push(
      `<div class="k"><div class="q">${svg}</div>` +
      `<h1>${esc(headline)}</h1>` +
      (design.sub ? `<p>${esc(design.sub)}</p>` : '') +
      (design.showTable ? `<p class="s">Stůl ${esc(t.name)}</p>` : '') +
      `</div>`);
  }

  const page = sheet.id === 'card'
    ? `body{display:grid;place-items:center;min-height:100vh}.k{width:88mm;padding:10mm}`
    : `@page{size:A4;margin:8mm}body{display:grid;grid-template-columns:repeat(${sheet.cols},1fr);gap:6mm}` +
      `.k{padding:6mm;break-inside:avoid}`;

  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>QR na stůl${all ? '' : ` · ${esc(tables[0].name)}`}</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:${ink};background:${paper}}
${page}
.k{text-align:center;background:${paper};border-radius:8mm;${design.style === 'framed' ? `border:0.4mm solid ${ink}33;` : ''}}
.q{display:grid;place-items:center}
.q svg{width:${design.size}mm;height:${design.size}mm;display:block}
h1{font-size:${sheet.id === 'a4-8' ? 13 : 20}pt;line-height:1.15;letter-spacing:-0.01em;margin:4mm 0 1mm;word-break:break-word}
p{margin:0;font-size:${sheet.id === 'a4-8' ? 8 : 10.5}pt;opacity:0.65;line-height:1.35}
.s{font-size:${sheet.id === 'a4-8' ? 11 : 15}pt;font-weight:700;opacity:1;margin-top:2.5mm}
@media print{body{background:${paper};-webkit-print-color-adjust:exact;print-color-adjust:exact}.k{border-radius:0}}
</style></head><body>${cards.join('')}
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
