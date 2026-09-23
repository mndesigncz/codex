import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { normalizeLevels, normalizePoints, standingForPoints } from '@/lib/rewardLevels';
import { breakdownFor, breakdownForTeam, totalPoints, PointsBreakdown } from '@/lib/pointsBalance';
import { pragueToday } from '@/lib/pragueTime';
import { clenovePodniku } from '@/lib/tenant';

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

// Worked days in the recent past that still have no review — the employer's
// "to rate" backlog. Older shifts are ignored so the number stays actionable.
// Nehodnocené směnodny za posledních 60 dní, per zaměstnanec — jeden dotaz
// pro celý tým (dřív jeden na člena).
async function pendingForTeam(userIds: number[]): Promise<Map<number, { n: number; oldest: string | null }>> {
  const map = new Map<number, { n: number; oldest: string | null }>();
  for (const id of userIds) map.set(id, { n: 0, oldest: null });
  if (userIds.length === 0) return map;
  const from = pragueToday(-60);
  const to = pragueToday();
  try {
    const rows = await sql`
      SELECT uid, COUNT(*)::int AS n, MIN(d) AS oldest FROM (
        SELECT DISTINCT s.employee_id AS uid, s.date AS d FROM shifts s
        WHERE s.employee_id = ANY(${userIds}) AND s.date >= ${from} AND s.date <= ${to}
          AND NOT EXISTS (SELECT 1 FROM shift_reviews r WHERE r.employee_id = s.employee_id AND r.work_date = s.date)
      ) x GROUP BY uid`;
    for (const r of rows as any[]) map.set(r.uid, { n: r.n ?? 0, oldest: r.oldest ?? null });
  } catch { /* table missing — leave zeros */ }
  return map;
}

// Per-item feedback with a human label, one query per kind (neon has no
// dynamic SQL, so each join is written out in full).
async function itemsFor(teamId: number, userId: number) {
  const out: { work_date: string; kind: string; refId: number; label: string; points: number; note: string | null; flagged: boolean }[] = [];
  const push = (rows: any[], kind: string, fallback: string, decorate?: (l: string) => string) => {
    rows.forEach((r: any) => out.push({
      work_date: r.work_date, kind, refId: r.ref_id,
      label: r.label ? (decorate ? decorate(String(r.label)) : String(r.label)) : fallback,
      points: r.points ?? 0, note: r.note ?? null, flagged: r.flagged === true,
    }));
  };
  try {
    const rows = await sql`
      SELECT i.work_date, i.ref_id, i.points, i.note, i.flagged, t.title AS label
      FROM shift_review_items i LEFT JOIN tasks t ON t.id = i.ref_id
      WHERE i.employee_id = ${userId} AND i.team_id = ${teamId} AND i.kind = 'task'
      ORDER BY i.work_date DESC LIMIT 50`;
    push(rows, 'task', 'Úkol');
  } catch { return out; /* table missing */ }
  try {
    const rows = await sql`
      SELECT i.work_date, i.ref_id, i.points, i.note, i.flagged, p.name AS label
      FROM shift_review_items i
      LEFT JOIN procedure_runs r ON r.id = i.ref_id
      LEFT JOIN procedures p ON p.id = r.procedure_id
      WHERE i.employee_id = ${userId} AND i.team_id = ${teamId} AND i.kind = 'procedure'
      ORDER BY i.work_date DESC LIMIT 50`;
    push(rows, 'procedure', 'Postup');
  } catch { /* ignore */ }
  try {
    const rows = await sql`
      SELECT i.work_date, i.ref_id, i.points, i.note, i.flagged, cc.shift_label AS label
      FROM shift_review_items i LEFT JOIN cash_closings cc ON cc.id = i.ref_id
      WHERE i.employee_id = ${userId} AND i.team_id = ${teamId} AND i.kind = 'closing'
      ORDER BY i.work_date DESC LIMIT 50`;
    push(rows, 'closing', 'Uzávěrka', l => `Uzávěrka — ${l}`);
  } catch { /* ignore */ }
  out.sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)));
  return out.slice(0, 60);
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
    // Kolo 62: žebříček podle členství — zaměstnanec přepnutý jinam má v tomhle
    // podniku body, tak v něm musí zůstat i v pořadí.
    const members = await clenovePodniku(c.teamId, { role: 'employee' });
    // Dřív 6 dotazů na každého člena (N+1). Teď dvě dávkové sady GROUP BY.
    const memberIds = members.map(m => m.id);
    const breakdowns = await breakdownForTeam(c.teamId, memberIds);
    const pendings = await pendingForTeam(memberIds);
    const standings = members.map(m => {
      const b = breakdowns.get(m.id) ?? { tasks: 0, procedures: 0, closings: 0, reviewPoints: 0, ratedShifts: 0, autoPoints: 0, itemPoints: 0, flagged: 0 };
      const total = totalPoints(b, points);
      const st = standingForPoints(levels, total);
      const p = pendings.get(m.id) ?? { n: 0, oldest: null };
      return {
        id: m.id, name: m.name, avatar: m.avatar,
        points: total, breakdown: b,
        flagged: b.flagged, pending: p.n, oldestPending: p.oldest,
        levelName: st.level.name, levelIndex: st.levelIndex,
        next: st.next, pctToNext: st.pctToNext, pointsIntoLevel: st.pointsIntoLevel, pointsForNext: st.pointsForNext,
      };
    });
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
      SELECT work_date, rating, note, points, auto_points, flagged, scope, seen_at, created_at
      FROM shift_reviews WHERE employee_id = ${c.meId} AND team_id = ${c.teamId}
      ORDER BY work_date DESC LIMIT 20`;
  } catch {
    try {
      reviews = await sql`
        SELECT work_date, rating, note, points, created_at
        FROM shift_reviews WHERE employee_id = ${c.meId} AND team_id = ${c.teamId}
        ORDER BY work_date DESC LIMIT 20`;
    } catch { /* table missing */ }
  }
  const items = await itemsFor(c.teamId, c.meId);
  // Counted over all history, not just the 20 rows above.
  let unseenFlagged = reviews.filter((r: any) => r.flagged === true && !r.seen_at).length;
  try {
    const [r] = await sql`
      SELECT COUNT(*)::int AS n FROM shift_reviews
      WHERE employee_id = ${c.meId} AND team_id = ${c.teamId} AND flagged = TRUE AND seen_at IS NULL`;
    unseenFlagged = r?.n ?? unseenFlagged;
  } catch { /* columns not migrated */ }

  return NextResponse.json({
    role: 'employee', levels, points,
    me: {
      points: total, breakdown: b,
      levelName: st.level.name, levelIndex: st.levelIndex, perks: st.level.perks,
      next: st.next, pctToNext: st.pctToNext, pointsIntoLevel: st.pointsIntoLevel, pointsForNext: st.pointsForNext,
    },
    reviews: reviews.map((r: any) => ({
      work_date: r.work_date, rating: r.rating ?? 0, note: r.note ?? null,
      points: r.points ?? 0, autoPoints: r.auto_points ?? 0,
      flagged: r.flagged === true, scope: r.scope ?? 'individual',
      seen_at: r.seen_at ?? null, created_at: r.created_at ?? null,
    })),
    items,
    unseenFlagged,
  });
}

// POST { markSeen: true } — the employee acknowledged their new feedback.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  if (b?.markSeen !== true) return NextResponse.json({ error: 'Neznámá akce' }, { status: 400 });

  try {
    await sql`UPDATE shift_reviews SET seen_at = NOW() WHERE employee_id = ${c.meId} AND team_id = ${c.teamId} AND seen_at IS NULL`;
  } catch { /* column not migrated — nothing to acknowledge */ }
  return NextResponse.json({ ok: true });
}
