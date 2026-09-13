// One source of truth for "kolik bodů člověk má" — the same arithmetic the
// standings screen shows, importable by any route that needs to check it
// (reward redemptions must not drive the ledger negative).

import { neon } from '@neondatabase/serverless';
import { normalizePoints, PointsConfig } from '@/lib/rewardLevels';

const sql = neon(process.env.DATABASE_URL!);

export interface PointsBreakdown {
  tasks: number; procedures: number; closings: number;
  reviewPoints: number; ratedShifts: number;
  autoPoints: number;    // points the system derived from the shift itself
  itemPoints: number;    // points attached to individual tasks/runs/closings
  flagged: number;       // reviews or items marked "něco je špatně"
}

// Count the point-earning signals for one user (each guarded so a missing
// column degrades to zero instead of failing the whole request).
export async function breakdownFor(teamId: number, userId: number): Promise<PointsBreakdown> {
  let tasks = 0, procedures = 0, closings = 0, reviewPoints = 0, ratedShifts = 0;
  let autoPoints = 0, itemPoints = 0, flagged = 0;
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
    const [r] = await sql`
      SELECT COALESCE(SUM(points),0)::int AS pts, COALESCE(SUM(auto_points),0)::int AS auto,
             COUNT(*)::int AS n, COUNT(*) FILTER (WHERE flagged)::int AS flg
      FROM shift_reviews WHERE employee_id = ${userId} AND team_id = ${teamId}`;
    reviewPoints = r?.pts ?? 0; autoPoints = r?.auto ?? 0; ratedShifts = r?.n ?? 0; flagged = r?.flg ?? 0;
  } catch {
    try {
      const [r] = await sql`SELECT COALESCE(SUM(points),0)::int AS pts, COUNT(*)::int AS n FROM shift_reviews WHERE employee_id = ${userId} AND team_id = ${teamId}`;
      reviewPoints = r?.pts ?? 0; ratedShifts = r?.n ?? 0;
    } catch { /* table missing */ }
  }
  try {
    const [r] = await sql`
      SELECT COALESCE(SUM(points),0)::int AS pts, COUNT(*) FILTER (WHERE flagged)::int AS flg
      FROM shift_review_items WHERE employee_id = ${userId} AND team_id = ${teamId}`;
    itemPoints = r?.pts ?? 0; flagged += r?.flg ?? 0;
  } catch { /* table missing */ }
  return { tasks, procedures, closings, reviewPoints, ratedShifts, autoPoints, itemPoints, flagged };
}

// Batched varianta breakdownFor pro celý tým naráz: místo 5 dotazů na každého
// člena (N+1, u týmu 20 lidí 100+ round-tripů a riziko timeoutu na žebříčku)
// pět agregací GROUP BY. Aritmetika je stejná jako v breakdownFor — jen se
// spočítá hromadně. Chybějící člen v mapě = samé nuly.
export async function breakdownForTeam(teamId: number, userIds: number[]): Promise<Map<number, PointsBreakdown>> {
  const map = new Map<number, PointsBreakdown>();
  for (const id of userIds) {
    map.set(id, { tasks: 0, procedures: 0, closings: 0, reviewPoints: 0, ratedShifts: 0, autoPoints: 0, itemPoints: 0, flagged: 0 });
  }
  if (userIds.length === 0) return map;

  try {
    const rows = await sql`SELECT completed_by AS uid, COUNT(*)::int AS n FROM tasks WHERE completed_by = ANY(${userIds}) AND status = 'done' GROUP BY completed_by`;
    for (const r of rows as any[]) { const b = map.get(r.uid); if (b) b.tasks = r.n; }
  } catch { /* column missing */ }

  try {
    const rows = await sql`SELECT user_id AS uid, COUNT(*)::int AS n FROM procedure_runs WHERE user_id = ANY(${userIds}) AND status = 'completed' GROUP BY user_id`;
    for (const r of rows as any[]) { const b = map.get(r.uid); if (b) b.procedures = r.n; }
  } catch { /* ignore */ }

  try {
    const rows = await sql`SELECT created_by AS uid, COUNT(*)::int AS n FROM cash_closings WHERE created_by = ANY(${userIds}) AND covered_by IS NULL GROUP BY created_by`;
    for (const r of rows as any[]) { const b = map.get(r.uid); if (b) b.closings = r.n; }
  } catch {
    try {
      const rows = await sql`SELECT created_by AS uid, COUNT(*)::int AS n FROM cash_closings WHERE created_by = ANY(${userIds}) GROUP BY created_by`;
      for (const r of rows as any[]) { const b = map.get(r.uid); if (b) b.closings = r.n; }
    } catch { /* ignore */ }
  }

  try {
    const rows = await sql`
      SELECT employee_id AS uid, COALESCE(SUM(points),0)::int AS pts, COALESCE(SUM(auto_points),0)::int AS auto,
             COUNT(*)::int AS n, COUNT(*) FILTER (WHERE flagged)::int AS flg
      FROM shift_reviews WHERE employee_id = ANY(${userIds}) AND team_id = ${teamId} GROUP BY employee_id`;
    for (const r of rows as any[]) { const b = map.get(r.uid); if (b) { b.reviewPoints = r.pts; b.autoPoints = r.auto; b.ratedShifts = r.n; b.flagged += r.flg; } }
  } catch {
    try {
      const rows = await sql`SELECT employee_id AS uid, COALESCE(SUM(points),0)::int AS pts, COUNT(*)::int AS n FROM shift_reviews WHERE employee_id = ANY(${userIds}) AND team_id = ${teamId} GROUP BY employee_id`;
      for (const r of rows as any[]) { const b = map.get(r.uid); if (b) { b.reviewPoints = r.pts; b.ratedShifts = r.n; } }
    } catch { /* table missing */ }
  }

  try {
    const rows = await sql`
      SELECT employee_id AS uid, COALESCE(SUM(points),0)::int AS pts, COUNT(*) FILTER (WHERE flagged)::int AS flg
      FROM shift_review_items WHERE employee_id = ANY(${userIds}) AND team_id = ${teamId} GROUP BY employee_id`;
    for (const r of rows as any[]) { const b = map.get(r.uid); if (b) { b.itemPoints = r.pts; b.flagged += r.flg; } }
  } catch { /* table missing */ }

  return map;
}

export function totalPoints(b: PointsBreakdown, pt: PointsConfig): number {
  return b.tasks * pt.task + b.procedures * pt.procedure + b.closings * pt.closing
    + b.reviewPoints + b.autoPoints + b.itemPoints;
}

/** Current spendable balance: earned total minus reward requests still waiting
 *  for approval (their deduction lands only on approve, but the points are
 *  already spoken for). */
export async function pointsAvailableFor(teamId: number, userId: number): Promise<number> {
  let pointsRaw: any = {};
  try {
    const [t] = await sql`SELECT points_config FROM teams WHERE id = ${teamId}`;
    pointsRaw = t?.points_config;
  } catch { /* not migrated */ }
  const total = totalPoints(await breakdownFor(teamId, userId), normalizePoints(pointsRaw));
  let pending = 0;
  try {
    const [r] = await sql`
      SELECT COALESCE(SUM(cost),0)::int AS c FROM reward_redemptions
      WHERE team_id = ${teamId} AND employee_id = ${userId} AND status = 'pending'`;
    pending = r?.c ?? 0;
  } catch { /* not migrated */ }
  return total - pending;
}
