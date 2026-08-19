// One day's POS numbers for the team — the closing form and dashboards read
// this. Any signed-in role may look (the kiosk fills closings too).

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getConnection, daySummary } from '@/lib/storyous';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ connected: false });

  const conn = await getConnection(u.team_id);
  if (!conn) return NextResponse.json({ connected: false });

  const date = String(new URL(req.url).searchParams.get('date') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Neplatné datum' }, { status: 400 });
  try {
    const s = await daySummary(conn, date);
    return NextResponse.json({ connected: true, placeName: conn.placeName, ...s });
  } catch {
    return NextResponse.json({ connected: true, error: 'Pokladna teď neodpovídá — zkus to za chvíli.' }, { status: 502 });
  }
}
