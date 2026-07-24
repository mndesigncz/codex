import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { normalizeLevels, normalizePoints, standingForPoints, PointsConfig } from '@/lib/rewardLevels';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const name = (s.user as any).name as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, name, teamId: u?.team_id as number | null };
}

interface Breakdown { tasks: number; procedures: number; closings: number; reviewPoints: number; ratedShifts: number; }

// Count the point-earning signals for one user (each guarded so a missing
// column degrades to zero instead of failing the whole request).
async function breakdownFor(teamId: number, userId: number): Promise<Breakdown> {
  let tasks = 0, procedures = 0, closings = 0, reviewPoints = 0, ratedShifts = 0;
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM tasks WHERE completed_by = ${userId} AND status = 'done'`;
    tasks = r?.n ?? 0;
  } catch { /* column missing */ }
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM procedure_runs WHERE user_id = ${userId} AND status = 'completed'`;
    procedures = r?.n ?? 0;
  } catch { /* ignore */ }
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM cash_closings WHERE created_by = ${userId} AND (covered_by IS NULL)`;
    closings = r?.n ?? 0;
  } catch {
    try {
      const [r] = await sql`SELECT COUNT(*)::int AS n FROM cash_closings WHERE created_by = ${userId}`;
      closings = r?.n ?? 0;
    } catch { /* ignore */ }
  }
  try {
    const [r] = await sql`SELECT COALESCE(SUM(points),0)::int AS pts, COUNT(*)::int AS n FROM shift_reviews WHERE employee_id = ${userId} AND team_id = ${teamId}`;
    reviewPoints = r?.pts ?? 0;
    ratedShifts = r?.n ?? 0;
  } catch { /* table missing */ }
  return { tasks, procedures, closings, reviewPoints, ratedShifts };
}

function totalPoints(b: Breakdown, pt: PointsConfig): number {
  return b.tasks * pt.task + b.procedures * pt.procedure + b.closings * pt.closing + b.reviewPoints;
}

export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });

  // Team config.
  let levelsRaw: any = [], pointsRaw: any = {};
  try {
    const [t] = await sql`SELECT levels_config, points_config FROM teams WHERE id = ${c.teamId}`;
    levelsRaw = t?.levels_config; pointsRaw = t?.points_config;
  } catch { /* not migrated */ }
  const levels = normalizeLevels(levelsRaw);
  const points = normalizePoints(pointsRaw);

  if (c.role === 'employer' || c.role === 'kiosk') {
    const members = await sql`
      SELECT id, name, avatar FROM users WHERE team_id = ${c.teamId} AND role = 'employee' ORDER BY name ASC`;
    const standings = [];
    for (const m of members) {
      const b = await breakdownFor(c.teamId, m.id);
      const total = totalPoints(b, points);
      const st = standingForPoints(levels, total);
      standings.push({
        id: m.id, name: m.name, avatar: m.avatar,
        points: total, breakdown: b,
        levelName: st.level.name, levelIndex: st.levelIndex,
        next: st.next, pctToNext: st.pctToNext, pointsIntoLevel: st.pointsIntoLevel, pointsForNext: st.pointsForNext,
      });
    }
    standings.sort((a, b) => b.points - a.points);
    return NextResponse.json({ role: 'employer', levels, points, standings });
  }

  // Employee — own standing + recent feedback.
  const b = await breakdownFor(c.teamId, c.meId);
  const total = totalPoints(b, points);
  const st = standingForPoints(levels, total);
  let reviews: any[] = [];
  try {
    reviews = await sql`
      SELECT work_date, rating, note, points, created_at
      FROM shift_reviews WHERE employee_id = ${c.meId} AND team_id = ${c.teamId}
      ORDER BY work_date DESC LIMIT 20`;
  } catch { /* table missing */ }
  return NextResponse.json({
    role: 'employee', levels, points,
    me: {
      points: total, breakdown: b,
      levelName: st.level.name, levelIndex: st.levelIndex, perks: st.level.perks,
      next: st.next, pctToNext: st.pctToNext, pointsIntoLevel: st.pointsIntoLevel, pointsForNext: st.pointsForNext,
    },
    reviews,
  });
}
