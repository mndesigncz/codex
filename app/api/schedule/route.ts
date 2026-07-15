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

// GET ?month=YYYY-MM — all shifts in month for the team, joined with employee name+avatar
export async function GET(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!ctx.teamId) return NextResponse.json({ shifts: [] });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
  }

  const rows = await sql`
    SELECT s.id, s.employee_id, s.date, s.start_time, s.end_time, s.type,
           u.name AS employee_name, u.avatar AS employee_avatar
    FROM shifts s
    JOIN users u ON u.id = s.employee_id
    WHERE s.team_id = ${ctx.teamId} AND to_char(s.date::date, 'YYYY-MM') = ${month}
    ORDER BY s.date ASC, s.start_time ASC`;

  const shifts = rows.map((r: any) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    employeeAvatar: r.employee_avatar ?? '👤',
    date: typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().split('T')[0],
    startTime: r.start_time,
    endTime: r.end_time,
    type: r.type,
  }));
  return NextResponse.json({ shifts });
}

// POST (employer) — { shifts: [{employeeId, date, startTime, endTime, type}] } bulk append
export async function POST(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const body = await req.json();
  const list: any[] = Array.isArray(body.shifts) ? body.shifts : [];
  if (list.length === 0) return NextResponse.json({ inserted: 0 });

  let inserted = 0;
  for (const s of list) {
    const employeeId = parseInt(s.employeeId);
    if (!employeeId || !s.date || !s.startTime || !s.endTime) continue;
    await sql`
      INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type)
      VALUES (${ctx.teamId}, ${employeeId}, ${s.date}, ${s.startTime}, ${s.endTime}, ${s.type ?? 'flexible'})`;
    inserted++;
  }
  return NextResponse.json({ inserted });
}

// DELETE ?id= (single) or ?month= (clear month) — employer
export async function DELETE(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const month = searchParams.get('month');

  if (id) {
    await sql`DELETE FROM shifts WHERE id = ${parseInt(id)} AND team_id = ${ctx.teamId}`;
    return NextResponse.json({ ok: true });
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    await sql`
      DELETE FROM shifts
      WHERE team_id = ${ctx.teamId} AND to_char(date::date, 'YYYY-MM') = ${month}`;
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Chybí id nebo měsíc' }, { status: 400 });
}
