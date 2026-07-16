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

// GET — team fixed assignments joined with employee name + shift type info
export async function GET() {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!ctx.teamId) return NextResponse.json({ assignments: [] });

  const rows = await sql`
    SELECT f.id, f.employee_id, f.weekday, f.shift_type_id,
           u.name AS employee_name, u.avatar AS employee_avatar,
           st.name AS shift_type_name, st.start_time, st.end_time, st.color
    FROM fixed_assignments f
    JOIN users u ON u.id = f.employee_id
    LEFT JOIN shift_types st ON st.id = f.shift_type_id
    WHERE f.team_id = ${ctx.teamId}
    ORDER BY f.weekday ASC, u.name ASC`;

  const assignments = rows.map((r: any) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    employeeAvatar: r.employee_avatar ?? '👤',
    weekday: r.weekday,
    shiftTypeId: r.shift_type_id,
    shiftTypeName: r.shift_type_name ?? null,
    startTime: r.start_time ?? null,
    endTime: r.end_time ?? null,
    color: r.color ?? null,
  }));
  return NextResponse.json({ assignments });
}

// POST (employer) — { employeeId, weekday, shiftTypeId? }
export async function POST(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const body = await req.json();
  const employeeId = parseInt(body.employeeId);
  const weekday = parseInt(body.weekday);
  const shiftTypeId =
    body.shiftTypeId === null || body.shiftTypeId === undefined || body.shiftTypeId === ''
      ? null
      : parseInt(body.shiftTypeId);

  if (!employeeId || Number.isNaN(weekday) || weekday < 0 || weekday > 6) {
    return NextResponse.json({ error: 'Neplatná data' }, { status: 400 });
  }

  const [emp] = await sql`SELECT id FROM users WHERE id = ${employeeId} AND team_id = ${ctx.teamId}`;
  if (!emp) return NextResponse.json({ error: 'Zaměstnanec není v týmu' }, { status: 400 });

  if (shiftTypeId != null) {
    const [st] = await sql`SELECT id FROM shift_types WHERE id = ${shiftTypeId} AND team_id = ${ctx.teamId}`;
    if (!st) return NextResponse.json({ error: 'Typ směny nenalezen' }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO fixed_assignments (team_id, employee_id, weekday, shift_type_id)
    VALUES (${ctx.teamId}, ${employeeId}, ${weekday}, ${shiftTypeId})
    RETURNING id`;
  return NextResponse.json({ id: row.id, ok: true });
}

// DELETE ?id= (employer)
export async function DELETE(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });

  await sql`DELETE FROM fixed_assignments WHERE id = ${parseInt(id)} AND team_id = ${ctx.teamId}`;
  return NextResponse.json({ ok: true });
}
