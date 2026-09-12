// Půdorys podniku: uložení nakresleného plánku a nahrání podkladu.
// Podklad se ukládá rovnou do plánku (očištěné SVG textem, rastr jako
// data URI) — host totiž nemá tým, takže na chráněné /api/upload nedosáhne.
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer, ensureProfile } from '@/lib/client';
import { normalizePlan, EMPTY_PLAN } from '@/lib/floorplan';
import { sanitizeSvg } from '@/lib/svgSanitize';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Rastr se překlápí do data URI, tak se drží malý — vektor je lepší. */
const MAX_IMG = 500 * 1024;
const MAX_SVG = 400 * 1024;

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const p = await ensureProfile(u.team_id);
  const tables = await sql`SELECT id, name, seats, active, map_x, map_y, map_w, map_h, map_shape, map_rot FROM client_tables WHERE team_id = ${u.team_id} ORDER BY position, id`;
  return NextResponse.json({ plan: p.floorplan ? normalizePlan(p.floorplan) : EMPTY_PLAN, tables });
}

export async function PUT(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  await ensureProfile(u.team_id);
  const b = await req.json().catch(() => ({}));
  const plan = normalizePlan(b.plan);
  const [row] = await sql`UPDATE client_profiles SET floorplan = ${JSON.stringify(plan)}, updated_at = NOW() WHERE team_id = ${u.team_id} RETURNING floorplan`;

  // Stoly se ukládají v jednom kole s plánkem — jinak by se po tažení
  // posílalo tolik požadavků, kolik je stolů.
  const tables = Array.isArray(b.tables) ? b.tables.slice(0, 200) : [];
  let saved = 0;
  for (const t of tables) {
    const id = parseInt(String(t?.id), 10);
    if (!id) continue;
    const num = (v: any, lo: number, hi: number) => { if (v === null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 100) / 100)) : null; };
    const shape = t?.map_shape === 'rect' || t?.map_shape === 'circle' ? t.map_shape : null;
    const rot = t?.map_rot == null ? null : Math.max(0, Math.min(359, Math.round(Number(t.map_rot) || 0)));
    await sql`
      UPDATE client_tables SET
        map_x = ${num(t.map_x, -20, 120)}, map_y = ${num(t.map_y, -20, 120)},
        map_w = ${num(t.map_w, 0.5, 120)}, map_h = ${num(t.map_h, 0.5, 120)},
        map_shape = ${shape}, map_rot = ${rot}
      WHERE id = ${id} AND team_id = ${u.team_id}`;
    saved++;
  }
  audit(u.team_id, u.id, 'client.floorplan', 'client', null, `plánek uložen · ${plan.shapes.length} tvarů, ${saved} stolů`);
  return NextResponse.json({ ok: true, plan: row?.floorplan ?? plan, tables: saved });
}

/** Nahrání podkladu: SVG se očistí, obrázek překlopí do data URI. */
export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Chybí soubor.' }, { status: 400 });
  const f = file as File;
  const mime = (f.type || '').toLowerCase();
  const isSvg = mime.includes('svg') || /\.svg$/i.test(f.name || '');

  try {
    if (isSvg) {
      if (f.size > MAX_SVG) return NextResponse.json({ error: `SVG je moc velké (max ${Math.round(MAX_SVG / 1024)} kB).` }, { status: 413 });
      const { svg, ratio } = sanitizeSvg(await f.text(), MAX_SVG);
      return NextResponse.json({ ok: true, bg: { svg }, ratio });
    }
    if (!/^image\/(png|jpeg|webp)$/.test(mime)) return NextResponse.json({ error: 'Vezmu SVG, PNG, JPG nebo WebP.' }, { status: 415 });
    if (f.size > MAX_IMG) return NextResponse.json({ error: `Obrázek je moc velký (max ${Math.round(MAX_IMG / 1024)} kB). Vektor (SVG) unese víc detailů v menším souboru.` }, { status: 413 });
    const src = `data:${mime};base64,${Buffer.from(await f.arrayBuffer()).toString('base64')}`;
    return NextResponse.json({ ok: true, bg: { src } });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? 'Soubor se nepovedlo načíst.').slice(0, 160) }, { status: 400 });
  }
}
