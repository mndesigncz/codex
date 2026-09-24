// The latest shift handover for the team — what the previous shift left for
// whoever opens next. Kolo 67: s oprávněním uzaverky.predavka (Vedení,
// Barista i Kiosk ho mají, takže se pro ně nic nemění).
import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { normalizeHandover } from '@/lib/closing';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const c = await pozaduj('uzaverky.predavka');
  if (jeOdpoved(c)) return c;
  const u = { team_id: c.teamId };

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
