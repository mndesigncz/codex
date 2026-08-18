// The latest shift handover for the team — what the previous shift left for
// whoever opens next. Readable by every role including the kiosk.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { normalizeHandover } from '@/lib/closing';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ handover: null });

  try {
    const [row] = await sql`
      SELECT cc.handover, cc.date, cc.created_at, us.name AS author_name, us.avatar AS author_avatar
      FROM cash_closings cc
      LEFT JOIN users us ON us.id = cc.created_by
      WHERE cc.team_id = ${u.team_id} AND cc.handover IS NOT NULL
        AND cc.created_at > NOW() - INTERVAL '48 hours'
      ORDER BY cc.created_at DESC LIMIT 1`;
    if (!row) return NextResponse.json({ handover: null });
    const handover = normalizeHandover(row.handover);
    if (!handover) return NextResponse.json({ handover: null });
    return NextResponse.json({
      handover,
      date: row.date,
      authorName: row.author_name ?? null,
      authorAvatar: row.author_avatar ?? null,
    });
  } catch {
    return NextResponse.json({ handover: null });
  }
}
