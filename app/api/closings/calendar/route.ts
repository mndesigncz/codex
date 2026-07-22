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

const todayStr = () => new Date().toISOString().split('T')[0];

// GET ?month=YYYY-MM&scope=me — a calendar of who was on shift and who did (or
// still owes) the closing each day. Employer sees the whole team; employees
// (and any scope=me request) see only their own days.
export async function GET(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId || c.role === 'kiosk') return NextResponse.json({ days: {} });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') ?? todayStr().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ days: {} });
  const start = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

  const selfOnly = c.role !== 'employer' || searchParams.get('scope') === 'me';

  try {
    const shifts = selfOnly
      ? await sql`
          SELECT s.date, u.id, u.name, u.avatar, s.start_time AS "startTime", s.end_time AS "endTime"
          FROM shifts s JOIN users u ON u.id = s.employee_id
          WHERE s.employee_id = ${c.meId} AND s.date >= ${start} AND s.date <= ${end}
          ORDER BY s.date ASC, s.start_time ASC`
      : await sql`
          SELECT s.date, u.id, u.name, u.avatar, s.start_time AS "startTime", s.end_time AS "endTime"
          FROM shifts s JOIN users u ON u.id = s.employee_id
          WHERE u.team_id = ${c.teamId} AND s.date >= ${start} AND s.date <= ${end}
          ORDER BY s.date ASC, s.start_time ASC`;

    const closings = selfOnly
      ? await sql`
          SELECT cc.date, cc.created_by AS "createdBy", cc.covered_by AS "coveredBy",
                 u.name, u.avatar
          FROM cash_closings cc LEFT JOIN users u ON u.id = cc.created_by
          WHERE cc.created_by = ${c.meId} AND cc.date >= ${start} AND cc.date <= ${end}`
      : await sql`
          SELECT cc.date, cc.created_by AS "createdBy", cc.covered_by AS "coveredBy",
                 u.name, u.avatar
          FROM cash_closings cc LEFT JOIN users u ON u.id = cc.created_by
          WHERE cc.team_id = ${c.teamId} AND cc.date >= ${start} AND cc.date <= ${end}`;

    // Who has ANY closing that day (author or covered), and who filed a top-level one.
    const creatorsByDate = new Map<string, Set<number>>();
    const closersByDate = new Map<string, Map<number, { id: number; name: string; avatar: string | null }>>();
    for (const r of closings as any[]) {
      (creatorsByDate.get(r.date) ?? creatorsByDate.set(r.date, new Set()).get(r.date)!).add(r.createdBy);
      if (r.coveredBy == null) {
        const map = closersByDate.get(r.date) ?? closersByDate.set(r.date, new Map()).get(r.date)!;
        map.set(r.createdBy, { id: r.createdBy, name: r.name, avatar: r.avatar });
      }
    }

    const days: Record<string, any> = {};
    const tstr = todayStr();
    // De-dupe people per day (someone could have two shift rows).
    const seen = new Map<string, Set<number>>();
    for (const s of shifts as any[]) {
      const day = (days[s.date] ??= { onShift: [], closedBy: [], hasClosing: false, missing: false });
      const seenSet = seen.get(s.date) ?? seen.set(s.date, new Set()).get(s.date)!;
      if (!seenSet.has(s.id)) {
        seenSet.add(s.id);
        const hadClosing = creatorsByDate.get(s.date)?.has(s.id) ?? false;
        day.onShift.push({ id: s.id, name: s.name, avatar: s.avatar, startTime: s.startTime, endTime: s.endTime, hadClosing });
      }
    }
    for (const [date, closers] of Array.from(closersByDate.entries())) {
      (days[date] ??= { onShift: [], closedBy: [], hasClosing: false, missing: false });
      days[date].closedBy = Array.from(closers.values());
    }
    for (const date of Object.keys(days)) {
      const d = days[date];
      d.hasClosing = (creatorsByDate.get(date)?.size ?? 0) > 0;
      d.missing = d.onShift.length > 0 && !d.hasClosing && date < tstr;
    }

    return NextResponse.json({ days, month, selfOnly });
  } catch {
    return NextResponse.json({ days: {}, month, selfOnly });
  }
}
