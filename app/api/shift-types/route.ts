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

// GET — team shift types ordered by position
export async function GET() {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!ctx.teamId) return NextResponse.json({ shiftTypes: [] });

  const rows = await sql`
    SELECT id, team_id, name, start_time, end_time, color, position
    FROM shift_types
    WHERE team_id = ${ctx.teamId}
    ORDER BY position ASC, id ASC`;
  return NextResponse.json({ shiftTypes: rows.map(mapRow) });
}

// POST (employer) — { name, startTime, endTime, color? }
export async function POST(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const body = await req.json();
  const name: string = (body.name ?? '').trim();
  const startTime: string = body.startTime;
  const endTime: string = body.endTime;
  const color: string = body.color ?? '#C8F542';

  if (!name) return NextResponse.json({ error: 'Chybí název směny' }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json({ error: 'Neplatný čas' }, { status: 400 });
  }

  const [{ max }] = await sql`SELECT COALESCE(MAX(position), -1) AS max FROM shift_types WHERE team_id = ${ctx.teamId}`;
  const position = Number(max) + 1;

  const [row] = await sql`
    INSERT INTO shift_types (team_id, name, start_time, end_time, color, position)
    VALUES (${ctx.teamId}, ${name}, ${startTime}, ${endTime}, ${color}, ${position})
    RETURNING id, team_id, name, start_time, end_time, color, position`;
  return NextResponse.json({ shiftType: mapRow(row) });
}
