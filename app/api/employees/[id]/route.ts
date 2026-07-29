import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { normalizeLevels, normalizePoints, standingForPoints, PointsConfig } from '@/lib/rewardLevels';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// GET — everything the employer needs about one employee in a single view:
// identity, level & points, shifts (upcoming + recent, with review status),
// reviews and per-item feedback, attendance hours and closings.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await getServerSession(authOptions);
  if (!s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  if (role !== 'employer') return NextResponse.json({ error: 'Jen pro vedení' }, { status: 403 });
  const [me] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const teamId = me?.team_id as number | null;
  if (!teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });

  const employeeId = parseInt(params.id);
  if (!Number.isFinite(employeeId)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  let emp: any;
  try {
    [emp] = await sql`
      SELECT id, name, avatar, email, phone, job_title, hourly_rate, team_id, role
      FROM users WHERE id = ${employeeId}`;
  } catch {
    [emp] = await sql`SELECT id, name, avatar, email, team_id, role FROM users WHERE id = ${employeeId}`;
  }
  if (!emp || emp.team_id !== teamId || emp.role === 'kiosk') {
    return NextResponse.json({ error: 'Zaměstnanec nenalezen' }, { status: 404 });
  }

  // Level & points — same signals as /api/rewards.
  let levelsRaw: any = [], pointsRaw: any = {};
  try {
    const [t] = await sql`SELECT levels_config, points_config FROM teams WHERE id = ${teamId}`;
    levelsRaw = t?.levels_config; pointsRaw = t?.points_config;
  } catch { /* not migrated */ }
  const levels = normalizeLevels(levelsRaw);
  const points: PointsConfig = normalizePoints(pointsRaw);

  let tasksDone = 0, procedures = 0, closingsTotal = 0, reviewPoints = 0, autoPoints = 0, itemPoints = 0, flagged = 0, ratedShifts = 0;
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM tasks WHERE completed_by = ${employeeId} AND status = 'done'`;
    tasksDone = r?.n ?? 0;
  } catch { /* ignore */ }
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM procedure_runs WHERE user_id = ${employeeId} AND status = 'completed'`;
    procedures = r?.n ?? 0;
  } catch { /* ignore */ }
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM cash_closings WHERE created_by = ${employeeId} AND covered_by IS NULL`;
    closingsTotal = r?.n ?? 0;
  } catch {
    try {
      const [r] = await sql`SELECT COUNT(*)::int AS n FROM cash_closings WHERE created_by = ${employeeId}`;
      closingsTotal = r?.n ?? 0;
    } catch { /* ignore */ }
  }
  try {
    const [r] = await sql`
      SELECT COALESCE(SUM(points),0)::int AS pts, COALESCE(SUM(auto_points),0)::int AS auto,
             COUNT(*)::int AS n, COUNT(*) FILTER (WHERE flagged)::int AS flg
      FROM shift_reviews WHERE employee_id = ${employeeId} AND team_id = ${teamId}`;
    reviewPoints = r?.pts ?? 0; autoPoints = r?.auto ?? 0; ratedShifts = r?.n ?? 0; flagged = r?.flg ?? 0;
  } catch {
    try {
      const [r] = await sql`SELECT COALESCE(SUM(points),0)::int AS pts, COUNT(*)::int AS n FROM shift_reviews WHERE employee_id = ${employeeId} AND team_id = ${teamId}`;
      reviewPoints = r?.pts ?? 0; ratedShifts = r?.n ?? 0;
    } catch { /* ignore */ }
  }
  try {
    const [r] = await sql`
      SELECT COALESCE(SUM(points),0)::int AS pts, COUNT(*) FILTER (WHERE flagged)::int AS flg
      FROM shift_review_items WHERE employee_id = ${employeeId} AND team_id = ${teamId}`;
    itemPoints = r?.pts ?? 0; flagged += r?.flg ?? 0;
  } catch { /* ignore */ }

  const totalPoints = tasksDone * points.task + procedures * points.procedure + closingsTotal * points.closing
    + reviewPoints + autoPoints + itemPoints;
  const st = standingForPoints(levels, totalPoints);

  const today = new Date().toISOString().split('T')[0];
  const monthKey = today.slice(0, 7);

  // Shifts with their review status (rating/flag per work date).
  let shiftRows: any[] = [];
  try {
    shiftRows = await sql`
      SELECT s.id, s.date, s.start_time, s.end_time, s.type,
             r.rating AS review_rating, r.flagged AS review_flagged, r.points AS review_points
      FROM shifts s
      LEFT JOIN shift_reviews r ON r.employee_id = s.employee_id AND r.work_date = s.date
      WHERE s.employee_id = ${employeeId}
      ORDER BY s.date DESC LIMIT 90`;
  } catch {
    try {
      shiftRows = await sql`
        SELECT id, date, start_time, end_time, type FROM shifts
        WHERE employee_id = ${employeeId} ORDER BY date DESC LIMIT 90`;
    } catch { shiftRows = []; }
  }
  const shapeShift = (r: any) => ({
    id: r.id, date: r.date, startTime: r.start_time, endTime: r.end_time, type: r.type,
    reviewed: r.review_rating !== undefined && r.review_rating !== null,
    rating: r.review_rating ?? 0,
    flagged: r.review_flagged === true,
    reviewPoints: r.review_points ?? 0,
  });
  const upcoming = shiftRows.filter((r: any) => r.date >= today).map(shapeShift).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);
  const recent = shiftRows.filter((r: any) => r.date < today).map(shapeShift).slice(0, 30);

  // Reviews + per-item feedback (reminders / things to fix included).
  let reviews: any[] = [];
  try {
    reviews = await sql`
      SELECT work_date, rating, note, points, auto_points AS "autoPoints", flagged, scope, seen_at
      FROM shift_reviews WHERE employee_id = ${employeeId} AND team_id = ${teamId}
      ORDER BY work_date DESC LIMIT 30`;
  } catch {
    try {
      reviews = await sql`
        SELECT work_date, rating, note, points FROM shift_reviews
        WHERE employee_id = ${employeeId} AND team_id = ${teamId} ORDER BY work_date DESC LIMIT 30`;
    } catch { reviews = []; }
  }
  let items: any[] = [];
  try {
    const taskItems = await sql`
      SELECT i.work_date, i.kind, i.ref_id, i.points, i.note, i.flagged, t.title AS label
      FROM shift_review_items i LEFT JOIN tasks t ON t.id = i.ref_id
      WHERE i.employee_id = ${employeeId} AND i.team_id = ${teamId} AND i.kind = 'task'
      ORDER BY i.work_date DESC LIMIT 30`;
    const procItems = await sql`
      SELECT i.work_date, i.kind, i.ref_id, i.points, i.note, i.flagged, p.name AS label
      FROM shift_review_items i
      LEFT JOIN procedure_runs r ON r.id = i.ref_id
      LEFT JOIN procedures p ON p.id = r.procedure_id
      WHERE i.employee_id = ${employeeId} AND i.team_id = ${teamId} AND i.kind = 'procedure'
      ORDER BY i.work_date DESC LIMIT 30`;
    const closingItems = await sql`
      SELECT i.work_date, i.kind, i.ref_id, i.points, i.note, i.flagged, cc.shift_label AS label
      FROM shift_review_items i LEFT JOIN cash_closings cc ON cc.id = i.ref_id
      WHERE i.employee_id = ${employeeId} AND i.team_id = ${teamId} AND i.kind = 'closing'
      ORDER BY i.work_date DESC LIMIT 30`;
    items = [...taskItems, ...procItems, ...closingItems]
      .map((r: any) => ({
        workDate: r.work_date, kind: r.kind, refId: r.ref_id,
        label: r.label ?? (r.kind === 'task' ? 'Úkol' : r.kind === 'procedure' ? 'Postup' : 'Uzávěrka'),
        points: r.points ?? 0, note: r.note ?? null, flagged: r.flagged === true,
      }))
      .sort((a, b) => String(b.workDate).localeCompare(String(a.workDate)))
      .slice(0, 40);
  } catch { items = []; }

  // Hours actually worked this month (open entry counts up to now).
  let monthMs = 0;
  try {
    const entries = await sql`
      SELECT clock_in, clock_out FROM time_entries
      WHERE employee_id = ${employeeId} AND to_char(clock_in, 'YYYY-MM') = ${monthKey}`;
    const nowMs = Date.now();
    monthMs = entries.reduce((sum: number, e: any) => {
      const inT = new Date(e.clock_in).getTime();
      if (Number.isNaN(inT)) return sum;
      const outT = e.clock_out ? new Date(e.clock_out).getTime() : nowMs;
      return sum + Math.max(0, outT - inT);
    }, 0);
  } catch { /* ignore */ }

  let closingsMonth = 0;
  try {
    const [r] = await sql`
      SELECT COUNT(*)::int AS n FROM cash_closings
      WHERE created_by = ${employeeId} AND covered_by IS NULL AND date LIKE ${monthKey + '%'}`;
    closingsMonth = r?.n ?? 0;
  } catch { /* ignore */ }

  return NextResponse.json({
    employee: {
      id: emp.id, name: emp.name, avatar: emp.avatar,
      email: emp.email ?? null, phone: emp.phone ?? null,
      jobTitle: emp.job_title ?? null, hourlyRate: emp.hourly_rate ?? null,
    },
    standing: {
      points: totalPoints,
      levelName: st.level.name, levelIndex: st.levelIndex, perks: st.level.perks,
      next: st.next, pctToNext: st.pctToNext, pointsIntoLevel: st.pointsIntoLevel, pointsForNext: st.pointsForNext,
    },
    levels,
    breakdown: { tasks: tasksDone, procedures, closings: closingsTotal, reviewPoints, autoPoints, itemPoints, ratedShifts, flagged },
    shifts: { upcoming, recent },
    reviews, items,
    month: { hoursMs: monthMs, shifts: recent.filter(sh => sh.date.startsWith(monthKey)).length + upcoming.filter(sh => sh.date.startsWith(monthKey)).length, closings: closingsMonth },
  });
}
