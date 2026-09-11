// Stoly podniku. Ručně, nebo naimportované z pokladny (Deskview API), aby
// rezervace a objednávky seděly na stejná čísla, jaká má obsluha na kase.
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer } from '@/lib/client';
import { getConnection, listDesks } from '@/lib/storyous';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const tables = await sql`SELECT * FROM client_tables WHERE team_id = ${u.team_id} ORDER BY position, id`;
  const conn = await getConnection(u.team_id);
  return NextResponse.json({ tables, posConnected: !!conn });
}

export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (b.action === 'import') {
    const conn = await getConnection(u.team_id);
    if (!conn) return NextResponse.json({ error: 'Pokladna není připojená.' }, { status: 400 });
    let desks;
    try { desks = await listDesks(conn); } catch (e: any) { return NextResponse.json({ error: String(e?.message ?? 'Pokladna neodpovídá.').slice(0, 160) }, { status: 502 }); }
    let added = 0;
    for (let i = 0; i < desks.length; i++) {
      const d = desks[i];
      const [exists] = await sql`SELECT id FROM client_tables WHERE team_id = ${u.team_id} AND storyous_desk_id = ${d.deskId}`;
      if (exists) { await sql`UPDATE client_tables SET name = ${d.name} WHERE id = ${exists.id}`; continue; }
      await sql`INSERT INTO client_tables (team_id, name, seats, storyous_desk_id, position) VALUES (${u.team_id}, ${d.name}, 2, ${d.deskId}, ${i})`;
      added++;
    }
    const tables = await sql`SELECT * FROM client_tables WHERE team_id = ${u.team_id} ORDER BY position, id`;
    return NextResponse.json({ ok: true, added, total: desks.length, tables });
  }
  const name = String(b.name ?? '').trim().slice(0, 40);
  if (!name) return NextResponse.json({ error: 'Stůl potřebuje jméno.' }, { status: 400 });
  const seats = Math.max(1, Math.min(40, parseInt(String(b.seats ?? '2'), 10) || 2));
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM client_tables WHERE team_id = ${u.team_id}` as any[];
  const [t] = await sql`INSERT INTO client_tables (team_id, name, seats, position) VALUES (${u.team_id}, ${name}, ${seats}, ${Number(n)}) RETURNING *`;
  return NextResponse.json({ ok: true, table: t });
}

export async function PATCH(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  const [cur] = await sql`SELECT * FROM client_tables WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!cur) return NextResponse.json({ error: 'Stůl nenalezen' }, { status: 404 });
  const [t] = await sql`
    UPDATE client_tables SET
      name = ${b.name != null ? String(b.name).trim().slice(0, 40) || cur.name : cur.name},
      seats = ${b.seats != null ? Math.max(1, Math.min(40, parseInt(String(b.seats), 10) || cur.seats)) : cur.seats},
      active = ${b.active != null ? !!b.active : cur.active},
      storyous_desk_id = ${b.storyous_desk_id !== undefined ? (b.storyous_desk_id ? String(b.storyous_desk_id) : null) : cur.storyous_desk_id}
    WHERE id = ${id} RETURNING *`;
  return NextResponse.json({ ok: true, table: t });
}

export async function DELETE(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(String(new URL(req.url).searchParams.get('id')), 10);
  await sql`DELETE FROM client_tables WHERE id = ${id} AND team_id = ${u.team_id}`;
  return NextResponse.json({ ok: true });
}
