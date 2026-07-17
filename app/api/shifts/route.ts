import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | null };
}

const shape = (r: any) => ({
  id: r.id, teamId: r.team_id, employeeId: r.employee_id, date: r.date,
  startTime: r.start_time, endTime: r.end_time, type: r.type,
  start_time: r.start_time, end_time: r.end_time,
});

// GET — employee: own shifts; employer: the whole team's shifts.
export async function GET(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const employeeIdParam = searchParams.get('employeeId');

  if (employeeIdParam) {
    // Employees may only read their own; employers anyone in their team.
    const employeeId = parseInt(employeeIdParam);
    if (c.role !== 'employer' && employeeId !== c.meId) {
      return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
    }
    if (c.role === 'employer') {
      const [target] = await sql`SELECT team_id FROM users WHERE id = ${employeeId}`;
      if (!target || target.team_id !== c.teamId) return NextResponse.json([]);
    }
    const rows = await sql`SELECT * FROM shifts WHERE employee_id = ${employeeId} ORDER BY date ASC`;
    return NextResponse.json(rows.map(shape));
  }

  if (c.role === 'employer' && c.teamId) {
    const rows = await sql`
      SELECT s.* FROM shifts s
      JOIN users u ON u.id = s.employee_id
      WHERE u.team_id = ${c.teamId} OR s.team_id = ${c.teamId}
      ORDER BY s.date ASC`;
    return NextResponse.json({ shifts: rows.map(shape), requests: [] });
  }

  const rows = await sql`SELECT * FROM shifts WHERE employee_id = ${c.meId} ORDER BY date ASC`;
  return NextResponse.json({ shifts: rows.map(shape), requests: [] });
}

// POST (employer) — create a shift for a team member.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const employeeId = parseInt(b.employeeId);
  if (!Number.isFinite(employeeId)) return NextResponse.json({ error: 'Chybí zaměstnanec' }, { status: 400 });

  const [target] = await sql`SELECT team_id FROM users WHERE id = ${employeeId}`;
  if (!target || target.team_id !== c.teamId) {
    return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type)
    VALUES (${c.teamId}, ${employeeId}, ${b.date}, ${b.startTime}, ${b.endTime}, ${b.type ?? 'custom'})
    RETURNING *`;
  return NextResponse.json(shape(row));
}
