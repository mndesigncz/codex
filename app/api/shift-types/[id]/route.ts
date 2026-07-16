import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function context() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | undefined };
}

function mapRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    startTime: r.start_time,
    endTime: r.end_time,
    color: r.color,
    position: r.position,
  };
}

// PATCH (employer) — { name?, startTime?, endTime?, color? }
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const id = parseInt(params.id);
  if (!id) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [existing] = await sql`SELECT * FROM shift_types WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  if (!existing) return NextResponse.json({ error: 'Směna nenalezena' }, { status: 404 });

  const body = await req.json();
  const name: string = body.name != null ? String(body.name).trim() : existing.name;
  const startTime: string = body.startTime ?? existing.start_time;
  const endTime: string = body.endTime ?? existing.end_time;
  const color: string = body.color ?? existing.color;

  if (!name) return NextResponse.json({ error: 'Chybí název směny' }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json({ error: 'Neplatný čas' }, { status: 400 });
  }

  const [row] = await sql`
    UPDATE shift_types
    SET name = ${name}, start_time = ${startTime}, end_time = ${endTime}, color = ${color}
    WHERE id = ${id} AND team_id = ${ctx.teamId}
    RETURNING id, team_id, name, start_time, end_time, color, position`;
  return NextResponse.json({ shiftType: mapRow(row) });
}

// DELETE (employer)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const id = parseInt(params.id);
  if (!id) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  // Remove any fixed assignments referencing this shift type first
  await sql`DELETE FROM fixed_assignments WHERE shift_type_id = ${id} AND team_id = ${ctx.teamId}`;
  await sql`DELETE FROM shift_types WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  return NextResponse.json({ ok: true });
}
