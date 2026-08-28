// What the previous shift left in the drawer — the number "Kasa na začátku"
// should start from. Deliberately tiny: one amount + who left it, no history,
// so even the kiosk and employees can prefill from the TEAM's last closing
// (their own list only contains their own rows and misses alternating shifts).

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { cashLeft } from '@/lib/closing';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ error: 'Nejsi v žádném týmu.' }, { status: 400 });

  let row: any = null;
  try {
    [row] = await sql`
      SELECT cc.date, cc.shift_label, cc.closing_cash, cc.final_removal, us.name AS author_name
      FROM cash_closings cc LEFT JOIN users us ON us.id = cc.created_by
      WHERE cc.team_id = ${u.team_id} AND cc.covered_by IS NULL AND cc.event_id IS NULL
      ORDER BY cc.date DESC, cc.created_at DESC LIMIT 1`;
  } catch {
    try {
      [row] = await sql`
        SELECT cc.date, cc.shift_label, cc.closing_cash, us.name AS author_name
        FROM cash_closings cc LEFT JOIN users us ON us.id = cc.created_by
        WHERE cc.team_id = ${u.team_id}
        ORDER BY cc.date DESC, cc.created_at DESC LIMIT 1`;
    } catch { /* table missing */ }
  }
  if (!row) return NextResponse.json({ drawer: null });
  return NextResponse.json({
    drawer: {
      date: row.date,
      shiftLabel: row.shift_label ?? null,
      authorName: row.author_name ?? null,
      amount: cashLeft({ closing_cash: Number(row.closing_cash) || 0, final_removal: row.final_removal ?? null }),
      finalRemoval: Number(row.final_removal) || 0,
    },
  });
}
