import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { validujDruh } from '@/lib/tresty';
import { menaPodniku } from '@/lib/menaPodniku';
import { predMigraci, tvarDruhu } from '../_spolecne';

// Sazebník trestů (kolo 10): typické prohřešky s body a (volitelně) krácením prémie.
//
// GET    → { types } — správce sazebníku (tresty.sazebnik) vidí i vypnuté, kdo uděluje jen aktivní.
// POST   { title, description?, points, bonusCut?, active? } (tresty.sazebnik)
// PATCH  { id, ...totéž } (tresty.sazebnik)
// DELETE ?id= → archivace (tresty s položkou si nechají její název)

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const chyba = (text: string, status: number) => NextResponse.json({ error: text }, { status });

export async function GET() {
  const c = await pozaduj(['tresty.udelit', 'tresty.sazebnik']);
  if (jeOdpoved(c)) return c;
  const spravce = c.role.opravneni.has('tresty.sazebnik');
  try {
    const rows = await sql`
      SELECT id, title, description, points, bonus_cut, active, created_at
      FROM penalty_types WHERE team_id = ${c.teamId} AND archived_at IS NULL
      ORDER BY active DESC, points DESC, title ASC`;
    const vse = rows.map(tvarDruhu);
    return NextResponse.json({ types: spravce ? vse : vse.filter(d => d.active), smi: { sazebnik: spravce } });
  } catch (e) {
    if (predMigraci(e)) return NextResponse.json({ types: [], smi: { sazebnik: spravce } });
    console.error('tresty/types GET', e);
    return chyba('Sazebník se nenačetl.', 500);
  }
}

export async function POST(req: NextRequest) {
  const c = await pozaduj('tresty.sazebnik');
  if (jeOdpoved(c)) return c;
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatný požadavek.', 400); }
  const v = validujDruh(b ?? {});
  if (!v.ok) return chyba(v.chyba, 400);
  const d = v.druh;
  try {
    const [row] = await sql`
      INSERT INTO penalty_types (team_id, title, description, points, bonus_cut, active, created_by)
      VALUES (${c.teamId}, ${d.title}, ${d.description}, ${d.points}, ${d.bonusCut}, ${d.active}, ${c.meId})
      RETURNING id, title, description, points, bonus_cut, active, created_at`;
    const mena = await menaPodniku(c.teamId);
    audit(c.teamId, c.meId, 'tresty.sazebnik.pridat', 'penalty_type', Number(row.id), `${d.title} · −${d.points} b${d.bonusCut ? ` · krácení ${mena.money(d.bonusCut)}` : ''}`);
    return NextResponse.json({ ok: true, type: tvarDruhu(row) }, { status: 201 });
  } catch (e) {
    if (predMigraci(e)) return chyba('Sazebník ještě není připravený — spusť /api/init.', 503);
    console.error('tresty/types POST', e);
    return chyba('Položka se neuložila.', 500);
  }
}

export async function PATCH(req: NextRequest) {
  const c = await pozaduj('tresty.sazebnik');
  if (jeOdpoved(c)) return c;
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatný požadavek.', 400); }
  const id = Number(b?.id);
  if (!Number.isInteger(id) || id <= 0) return chyba('Neplatné číslo položky.', 400);
  try {
    const [stara] = await sql`SELECT id, title, description, points, bonus_cut, active, created_at
      FROM penalty_types WHERE id = ${id} AND team_id = ${c.teamId} AND archived_at IS NULL`;
    if (!stara) return chyba('Položka nenalezena.', 404);
    const p = tvarDruhu(stara);
    const v = validujDruh({
      title: b.title ?? p.title, description: b.description === undefined ? p.description : b.description,
      points: b.points ?? p.points, bonusCut: b.bonusCut === undefined ? p.bonusCut : b.bonusCut, active: b.active ?? p.active,
    });
    if (!v.ok) return chyba(v.chyba, 400);
    const d = v.druh;
    const [row] = await sql`
      UPDATE penalty_types SET title = ${d.title}, description = ${d.description}, points = ${d.points}, bonus_cut = ${d.bonusCut}, active = ${d.active}
      WHERE id = ${id} AND team_id = ${c.teamId}
      RETURNING id, title, description, points, bonus_cut, active, created_at`;
    audit(c.teamId, c.meId, 'tresty.sazebnik.upravit', 'penalty_type', id, `${d.title} · −${d.points} b${d.active ? '' : ' · vypnuto'}`);
    return NextResponse.json({ ok: true, type: tvarDruhu(row) });
  } catch (e) {
    if (predMigraci(e)) return chyba('Položka nenalezena.', 404);
    console.error('tresty/types PATCH', e);
    return chyba('Položka se neuložila.', 500);
  }
}

export async function DELETE(req: NextRequest) {
  const c = await pozaduj('tresty.sazebnik');
  if (jeOdpoved(c)) return c;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return chyba('Neplatné číslo položky.', 400);
  try {
    const done = await sql`UPDATE penalty_types SET archived_at = NOW(), active = FALSE WHERE id = ${id} AND team_id = ${c.teamId} AND archived_at IS NULL RETURNING title`;
    if (!done.length) return chyba('Položka nenalezena.', 404);
    audit(c.teamId, c.meId, 'tresty.sazebnik.smazat', 'penalty_type', id, String(done[0].title ?? ''));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (predMigraci(e)) return chyba('Položka nenalezena.', 404);
    console.error('tresty/types DELETE', e);
    return chyba('Položku se nepodařilo smazat.', 500);
  }
}
