import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { pragueToday } from '@/lib/pragueTime';

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

const todayStr = () => pragueToday();

// GET ?month=YYYY-MM&scope=me — a calendar of who was on shift and who did (or
// still owes) the closing each day. Employer sees the whole team (including the
// day's revenue); employees (and any scope=me request) see only their own days
// and no money figures.
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

    // A closing covers the whole shift, so scope=me must also pick up the days
    // a colleague closed for me (my id sits in their shift_employees).
    let closings: any[];
    try {
      closings = selfOnly
        ? await sql`
            SELECT cc.date, cc.created_by AS "createdBy", cc.covered_by AS "coveredBy",
                   cc.shift_employees AS "shiftEmployees",
                   cc.cash_revenue AS "cashRevenue", cc.card_revenue AS "cardRevenue",
                   u.name, u.avatar
            FROM cash_closings cc LEFT JOIN users u ON u.id = cc.created_by
            WHERE cc.team_id = ${c.teamId} AND cc.date >= ${start} AND cc.date <= ${end}
              AND (cc.created_by = ${c.meId} OR cc.shift_employees @> to_jsonb(${c.meId}::int))`
        : await sql`
            SELECT cc.date, cc.created_by AS "createdBy", cc.covered_by AS "coveredBy",
                   cc.shift_employees AS "shiftEmployees",
                   cc.cash_revenue AS "cashRevenue", cc.card_revenue AS "cardRevenue",
                   u.name, u.avatar
            FROM cash_closings cc LEFT JOIN users u ON u.id = cc.created_by
            WHERE cc.team_id = ${c.teamId} AND cc.date >= ${start} AND cc.date <= ${end}`;
    } catch {
      // shift_employees not migrated yet — per-author attribution only.
      closings = selfOnly
        ? await sql`
            SELECT cc.date, cc.created_by AS "createdBy", cc.covered_by AS "coveredBy",
                   cc.cash_revenue AS "cashRevenue", cc.card_revenue AS "cardRevenue",
                   u.name, u.avatar
            FROM cash_closings cc LEFT JOIN users u ON u.id = cc.created_by
            WHERE cc.created_by = ${c.meId} AND cc.date >= ${start} AND cc.date <= ${end}`
        : await sql`
            SELECT cc.date, cc.created_by AS "createdBy", cc.covered_by AS "coveredBy",
                   cc.cash_revenue AS "cashRevenue", cc.card_revenue AS "cardRevenue",
                   u.name, u.avatar
            FROM cash_closings cc LEFT JOIN users u ON u.id = cc.created_by
            WHERE cc.team_id = ${c.teamId} AND cc.date >= ${start} AND cc.date <= ${end}`;
    }

    // Who is covered by ANY closing that day (author or shift crew), who filed a
    // top-level one, and how much the day took.
    const coveredByDate = new Map<string, Set<number>>();
    const closersByDate = new Map<string, Map<number, { id: number; name: string; avatar: string | null }>>();
    const revenueByDate = new Map<string, number>();
    for (const r of closings) {
      const set = coveredByDate.get(r.date) ?? coveredByDate.set(r.date, new Set()).get(r.date)!;
      set.add(r.createdBy);
      if (Array.isArray(r.shiftEmployees)) {
        for (const raw of r.shiftEmployees) {
          const id = Number(raw);
          if (Number.isFinite(id)) set.add(id);
        }
      }
      if (r.coveredBy == null) {
        const map = closersByDate.get(r.date) ?? closersByDate.set(r.date, new Map()).get(r.date)!;
        map.set(r.createdBy, { id: r.createdBy, name: r.name, avatar: r.avatar });
      }
      revenueByDate.set(r.date, (revenueByDate.get(r.date) ?? 0) + Number(r.cashRevenue ?? 0) + Number(r.cardRevenue ?? 0));
    }

    const days: Record<string, any> = {};
    const ensure = (date: string) => (days[date] ??= { onShift: [], closedBy: [], hasClosing: false, missing: false });
    const tstr = todayStr();
    // De-dupe people per day (someone could have two shift rows).
    const seen = new Map<string, Set<number>>();
    for (const s of shifts as any[]) {
      const day = ensure(s.date);
      const seenSet = seen.get(s.date) ?? seen.set(s.date, new Set()).get(s.date)!;
      if (!seenSet.has(s.id)) {
        seenSet.add(s.id);
        const hadClosing = coveredByDate.get(s.date)?.has(s.id) ?? false;
        day.onShift.push({ id: s.id, name: s.name, avatar: s.avatar, startTime: s.startTime, endTime: s.endTime, hadClosing });
      }
    }
    for (const [date, closers] of Array.from(closersByDate.entries())) {
      ensure(date).closedBy = Array.from(closers.values());
    }
    for (const date of Array.from(coveredByDate.keys())) ensure(date);
    for (const date of Object.keys(days)) {
      const d = days[date];
      d.hasClosing = (coveredByDate.get(date)?.size ?? 0) > 0;
      d.missing = d.onShift.length > 0 && !d.hasClosing && date < tstr;
      // Money stays out of the employee-scoped payload.
      if (!selfOnly) d.revenue = revenueByDate.get(date) ?? 0;
    }

    return NextResponse.json({ days, month, selfOnly });
  } catch {
    return NextResponse.json({ days: {}, month, selfOnly });
  }
}
