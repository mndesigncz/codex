// Shift requests (day off, swap…).
//
// SECURITY: shift_requests has no team column, so every query has to reach the
// team through `users`. Without that join the endpoint returns other businesses'
// requests — and a POST could be filed under somebody else's name.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function caller() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id ?? null };
}

export async function GET(req: NextRequest) {
  const me = await caller();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const asked = parseInt(searchParams.get('employeeId') ?? '');

    // An employee only ever sees their own requests, whatever they ask for.
    if (me.role !== 'employer') {
      const rows = await sql`
        SELECT * FROM shift_requests WHERE employee_id = ${me.meId} ORDER BY created_at DESC`;
      return NextResponse.json(rows);
    }

    if (!me.teamId) return NextResponse.json([]);

    // An employer sees their own team, optionally narrowed to one person.
    const rows = Number.isFinite(asked)
      ? await sql`
          SELECT r.* FROM shift_requests r
          JOIN users u ON u.id = r.employee_id
          WHERE u.team_id = ${me.teamId} AND r.employee_id = ${asked}
          ORDER BY r.created_at DESC`
      : await sql`
          SELECT r.* FROM shift_requests r
          JOIN users u ON u.id = r.employee_id
          WHERE u.team_id = ${me.teamId}
          ORDER BY r.created_at DESC`;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Žádosti se nepodařilo načíst' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await caller();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  try {
    const body = await req.json();
    const requestType = String(body.requestType ?? '').slice(0, 40);
    const date = String(body.date ?? '').slice(0, 20);
    if (!requestType || !date) {
      return NextResponse.json({ error: 'Chybí typ nebo datum' }, { status: 400 });
    }
    const note = body.note ? String(body.note).trim().slice(0, 500) || null : null;

    // The request belongs to the person making it. An employer may file one for
    // a member of their own team; nobody may file one for a stranger.
    let employeeId = me.meId;
    const asked = parseInt(body.employeeId);
    if (Number.isFinite(asked) && asked !== me.meId) {
      if (me.role !== 'employer' || !me.teamId) {
        return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
      }
      const [member] = await sql`
        SELECT id FROM users WHERE id = ${asked} AND team_id = ${me.teamId}`;
      if (!member) return NextResponse.json({ error: 'Zaměstnanec nenalezen' }, { status: 404 });
      employeeId = asked;
    }

    const [row] = await sql`
      INSERT INTO shift_requests (employee_id, request_type, date, note, status)
      VALUES (${employeeId}, ${requestType}, ${date}, ${note}, 'pending')
      RETURNING *`;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Žádost se nepodařilo vytvořit' }, { status: 500 });
  }
}
