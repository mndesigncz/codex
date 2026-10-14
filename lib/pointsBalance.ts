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
  awards: number;        // body z pochval mimo hodnocení směny (point_awards, kind <> 'navic')
  awardCount: number;    // kolik pochval
  navicPoints: number;   // body za uznané zápisy navíc (point_awards kind = 'navic')
  navicCount: number;    // kolik uznaných zápisů navíc
  trestPoints: number;   // body z trestů (point_awards kind = 'trest', záporné číslo)
  trestCount: number;    // kolik trestů s body
}

/** Prázdný rozpad — jeden tvar pro „člen bez bodů" všude (route i dávka). */
export const PRAZDNY_ROZPAD: PointsBreakdown = {
  tasks: 0, procedures: 0, closings: 0, reviewPoints: 0, ratedShifts: 0, autoPoints: 0, itemPoints: 0, flagged: 0, awards: 0, awardCount: 0, navicPoints: 0, navicCount: 0, trestPoints: 0, trestCount: 0,
};

// Count the point-earning signals for one user (each guarded so a missing
// column degrades to zero instead of failing the whole request).
// Úkoly, postupy a uzávěrky jen z TOHOHLE podniku, stejně jako breakdownForTeam
// (k89: dřív se sem počítaly i z jiných podniků, takže kontrola bodů na odměnu
// viděla jiný zůstatek než žebříček).
export async function breakdownFor(teamId: number, userId: number): Promise<PointsBreakdown> {
  let tasks = 0, procedures = 0, closings = 0, reviewPoints = 0, ratedShifts = 0;
  let autoPoints = 0, itemPoints = 0, flagged = 0;
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM tasks WHERE completed_by = ${userId} AND status = 'done' AND (team_id = ${teamId} OR team_id IS NULL)`;
    tasks = r?.n ?? 0;
  } catch { /* column missing */ }
  try {
    // Prázdné dokončení (ani jeden odškrtnutý krok) základ nedostane (k89) — stejně jako breakdownForTeam.
    const [r] = await sql`
      SELECT COUNT(*)::int AS n FROM procedure_runs
      WHERE user_id = ${userId} AND status = 'completed' AND (team_id = ${teamId} OR team_id IS NULL)
        AND (COALESCE(total_items, 0) = 0 OR (jsonb_typeof(checked_items) = 'array' AND checked_items <> '[]'::jsonb))`;
    procedures = r?.n ?? 0;
  } catch { /* ignore */ }
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM cash_closings WHERE created_by = ${userId} AND (covered_by IS NULL) AND (team_id = ${teamId} OR team_id IS NULL)`;
    closings = r?.n ?? 0;
  } catch {
    try {
      const [r] = await sql`SELECT COUNT(*)::int AS n FROM cash_closings WHERE created_by = ${userId} AND (team_id = ${teamId} OR team_id IS NULL)`;
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
  let awards = 0, awardCount = 0, navicPoints = 0, navicCount = 0, trestPoints = 0, trestCount = 0;
  try {
    // Pochvaly a uznané zápisy navíc zvlášť (sloupec kind přibyl s kolem 9; bez něj je všechno pochvala).
    const [r] = await sql`
      SELECT COALESCE(SUM(points) FILTER (WHERE COALESCE(kind, 'vedeni') NOT IN ('navic', 'trest')),0)::int AS pts,
             COUNT(*) FILTER (WHERE COALESCE(kind, 'vedeni') NOT IN ('navic', 'trest'))::int AS n,
             COALESCE(SUM(points) FILTER (WHERE kind = 'navic'),0)::int AS npts,
             COUNT(*) FILTER (WHERE kind = 'navic')::int AS nn,
             COALESCE(SUM(points) FILTER (WHERE kind = 'trest'),0)::int AS tpts,
             COUNT(*) FILTER (WHERE kind = 'trest')::int AS tn
      FROM point_awards WHERE user_id = ${userId} AND team_id = ${teamId}`;
    awards = r?.pts ?? 0; awardCount = r?.n ?? 0; navicPoints = r?.npts ?? 0; navicCount = r?.nn ?? 0;
    trestPoints = r?.tpts ?? 0; trestCount = r?.tn ?? 0;
  } catch {
    try {
      const [r] = await sql`
        SELECT COALESCE(SUM(points),0)::int AS pts, COUNT(*)::int AS n
        FROM point_awards WHERE user_id = ${userId} AND team_id = ${teamId}`;
      awards = r?.pts ?? 0; awardCount = r?.n ?? 0;
    } catch { /* table missing */ }
  }
  return { tasks, procedures, closings, reviewPoints, ratedShifts, autoPoints, itemPoints, flagged, awards, awardCount, navicPoints, navicCount, trestPoints, trestCount };
}

// Batched varianta breakdownFor pro celý tým naráz: místo 5 dotazů na každého
// člena (N+1, u týmu 20 lidí 100+ round-tripů a riziko timeoutu na žebříčku)
// pět agregací GROUP BY. Aritmetika je stejná jako v breakdownFor — jen se
// spočítá hromadně. Chybějící člen v mapě = samé nuly.
//
// `od` (YYYY-MM-DD) omezí počítání na období: žebříček „tento měsíc" (kolo 5).
// Odečty za odměny (kind = redemption) se v období nepočítají — pořadí za měsíc
// říká, kdo si body vydělal, ne kdo si za ně koupil kávu. Bez `od` je to
// celkový zůstatek jako dřív, včetně odečtů.
export async function breakdownForTeam(teamId: number, userIds: number[], od: string | null = null): Promise<Map<number, PointsBreakdown>> {
  const map = new Map<number, PointsBreakdown>();
  for (const id of userIds) map.set(id, { ...PRAZDNY_ROZPAD });
  if (userIds.length === 0) return map;
  // Časové sloupce jsou TIMESTAMP bez zóny (NOW() serveru), dny jsou TEXT YYYY-MM-DD.
  const odCas = od ? `${od}T00:00:00` : null;

  // Jen řádky TOHOHLE podniku (kolo 62): člen dvou podniků má v žebříčku A
  // jen úkoly, postupy a uzávěrky z A. NULL jsou řádky z doby před sloupcem.
  try {
    const rows = await sql`
      SELECT completed_by AS uid, COUNT(*)::int AS n FROM tasks
      WHERE completed_by = ANY(${userIds}) AND status = 'done' AND (team_id = ${teamId} OR team_id IS NULL)
        AND (${odCas}::text IS NULL OR completed_at >= ${odCas}::timestamp)
      GROUP BY completed_by`;
    for (const r of rows as any[]) { const b = map.get(r.uid); if (b) b.tasks = r.n; }
  } catch { /* column missing */ }

  try {
    const rows = await sql`
      SELECT user_id AS uid, COUNT(*)::int AS n FROM procedure_runs
      WHERE user_id = ANY(${userIds}) AND status = 'completed' AND (team_id = ${teamId} OR team_id IS NULL)
        AND (COALESCE(total_items, 0) = 0 OR (jsonb_typeof(checked_items) = 'array' AND checked_items <> '[]'::jsonb))
        AND (${odCas}::text IS NULL OR completed_at >= ${odCas}::timestamp)
      GROUP BY user_id`;
    for (const r of rows as any[]) { const b = map.get(r.uid); if (b) b.procedures = r.n; }
  } catch { /* ignore */ }

  try {
    const rows = await sql`
      SELECT created_by AS uid, COUNT(*)::int AS n FROM cash_closings
      WHERE created_by = ANY(${userIds}) AND covered_by IS NULL AND (team_id = ${teamId} OR team_id IS NULL)
        AND (${od}::text IS NULL OR date >= ${od})
      GROUP BY created_by`;
    for (const r of rows as any[]) { const b = map.get(r.uid); if (b) b.closings = r.n; }
  } catch {
    try {
      const rows = await sql`
        SELECT created_by AS uid, COUNT(*)::int AS n FROM cash_closings
        WHERE created_by = ANY(${userIds}) AND (team_id = ${teamId} OR team_id IS NULL)
          AND (${od}::text IS NULL OR date >= ${od})
        GROUP BY created_by`;
      for (const r of rows as any[]) { const b = map.get(r.uid); if (b) b.closings = r.n; }
    } catch { /* ignore */ }
  }

  try {
    const rows = await sql`
      SELECT employee_id AS uid, COALESCE(SUM(points),0)::int AS pts, COALESCE(SUM(auto_points),0)::int AS auto,
             COUNT(*)::int AS n, COUNT(*) FILTER (WHERE flagged)::int AS flg
      FROM shift_reviews WHERE employee_id = ANY(${userIds}) AND team_id = ${teamId}
        AND (${od}::text IS NULL OR work_date >= ${od}) GROUP BY employee_id`;
    for (const r of rows as any[]) { const b = map.get(r.uid); if (b) { b.reviewPoints = r.pts; b.autoPoints = r.auto; b.ratedShifts = r.n; b.flagged += r.flg; } }
  } catch {
    try {
      const rows = await sql`SELECT employee_id AS uid, COALESCE(SUM(points),0)::int AS pts, COUNT(*)::int AS n FROM shift_reviews WHERE employee_id = ANY(${userIds}) AND team_id = ${teamId} AND (${od}::text IS NULL OR work_date >= ${od}) GROUP BY employee_id`;
      for (const r of rows as any[]) { const b = map.get(r.uid); if (b) { b.reviewPoints = r.pts; b.ratedShifts = r.n; } }
    } catch { /* table missing */ }
  }

  try {
    const rows = await sql`
      SELECT employee_id AS uid, COALESCE(SUM(points),0)::int AS pts, COUNT(*) FILTER (WHERE flagged)::int AS flg
      FROM shift_review_items WHERE employee_id = ANY(${userIds}) AND team_id = ${teamId}
        AND (${od}::text IS NULL OR (work_date >= ${od} AND kind <> 'redemption')) GROUP BY employee_id`;
    for (const r of rows as any[]) { const b = map.get(r.uid); if (b) { b.itemPoints = r.pts; b.flagged += r.flg; } }
  } catch { /* table missing */ }

  try {
    const rows = await sql`
      SELECT user_id AS uid,
             COALESCE(SUM(points) FILTER (WHERE COALESCE(kind, 'vedeni') NOT IN ('navic', 'trest')),0)::int AS pts,
             COUNT(*) FILTER (WHERE COALESCE(kind, 'vedeni') NOT IN ('navic', 'trest'))::int AS n,
             COALESCE(SUM(points) FILTER (WHERE kind = 'navic'),0)::int AS npts,
             COUNT(*) FILTER (WHERE kind = 'navic')::int AS nn,
             COALESCE(SUM(points) FILTER (WHERE kind = 'trest'),0)::int AS tpts,
             COUNT(*) FILTER (WHERE kind = 'trest')::int AS tn
      FROM point_awards WHERE user_id = ANY(${userIds}) AND team_id = ${teamId}
        AND (${odCas}::text IS NULL OR created_at >= ${odCas}::timestamp) GROUP BY user_id`;
    for (const r of rows as any[]) { const b = map.get(r.uid); if (b) { b.awards = r.pts; b.awardCount = r.n; b.navicPoints = r.npts; b.navicCount = r.nn; b.trestPoints = r.tpts; b.trestCount = r.tn; } }
  } catch {
    try {
      const rows = await sql`
        SELECT user_id AS uid, COALESCE(SUM(points),0)::int AS pts, COUNT(*)::int AS n
        FROM point_awards WHERE user_id = ANY(${userIds}) AND team_id = ${teamId}
          AND (${odCas}::text IS NULL OR created_at >= ${odCas}::timestamp) GROUP BY user_id`;
      for (const r of rows as any[]) { const b = map.get(r.uid); if (b) { b.awards = r.pts; b.awardCount = r.n; } }
    } catch { /* table missing */ }
  }

  return map;
}

export function totalPoints(b: PointsBreakdown, pt: PointsConfig): number {
  return b.tasks * pt.task + b.procedures * pt.procedure + b.closings * pt.closing
    + b.reviewPoints + b.autoPoints + b.itemPoints + (b.awards ?? 0) + (b.navicPoints ?? 0) + (b.trestPoints ?? 0);
}

/**
 * Body do VEŘEJNÉHO žebříčku týmu (i na tabletu): jen získané body, bez trestů
 * (spuštění, balík P). Žebříček visí před celým týmem — záporné body za trest by tam
 * byly veřejným pranýřem; pořadí má říkat, kdo si body vydělal. Zůstatek člověka
 * (totalPoints, Můj výdělek, odměny) se nemění, tresty v něm zůstávají.
 */
export function bodyZebricku(b: PointsBreakdown, pt: PointsConfig): number {
  return totalPoints({ ...b, trestPoints: 0 }, pt);
}

/** Rozpad do žebříčku: bez trestů (počet i body), ať se z něj nedají dopočítat. */
export function rozpadZebricku(b: PointsBreakdown): PointsBreakdown {
  return { ...b, trestPoints: 0, trestCount: 0 };
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
