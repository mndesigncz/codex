import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// GET ?date=YYYY-MM-DD&exclude=ID — team members who don't yet have their own
// closing that day, so one person can close for them. Each is flagged whether
// they actually had a shift; someone without one can still be added manually.
export async function GET(req: NextRequest) {
  const s = await getServerSession(authOptions);
  if (!s?.user) return NextResponse.json({ coworkers: [] });
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const teamId = u?.team_id;
  if (!teamId) return NextResponse.json({ coworkers: [] });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ coworkers: [] });
  const exclude = parseInt(searchParams.get('exclude') ?? '') || meId;

  try {
    const rows = await sql`
      SELECT u.id, u.name, u.avatar,
             sh.start_time AS "startTime", sh.end_time AS "endTime",
             (sh.id IS NOT NULL) AS "hadShift"
      FROM users u
      LEFT JOIN LATERAL (
        SELECT id, start_time, end_time FROM shifts
        WHERE employee_id = u.id AND date = ${date}
        ORDER BY start_time ASC LIMIT 1
      ) sh ON TRUE
      WHERE u.team_id = ${teamId}
        AND u.role IN ('employee','employer')
        AND u.id <> ${exclude}
        AND NOT EXISTS (
          SELECT 1 FROM cash_closings cc
          WHERE cc.created_by = u.id AND cc.date = ${date}
        )
      ORDER BY (sh.id IS NULL), u.name ASC`;
    return NextResponse.json({ coworkers: rows });
  } catch {
    return NextResponse.json({ coworkers: [] });
  }
}
