import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { parseSteps } from '@/lib/steps';
import { expectedCash, cashDifference } from '@/lib/closing';
import { computeAutoPoints, normalizePoints, PointsConfig } from '@/lib/rewardLevels';

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

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clampPts = (v: any) => Math.max(-100, Math.min(100, Math.round(Number(v) || 0)));

async function teamPoints(teamId: number): Promise<PointsConfig> {
  try {
    const [t] = await sql`SELECT points_config FROM teams WHERE id = ${teamId}`;
    return normalizePoints(t?.points_config);
  } catch {
    return normalizePoints(null);
  }
}

// Display name of a shift, resolved against the team's configured shift types
// (matched by name, then by exact times) with the legacy labels as fallback.
const LEGACY_LABEL: Record<string, string> = { morning: 'Ranní', afternoon: 'Odpolední', flexible: 'Vlastní' };
async function shiftLabeller(teamId: number) {
  let types: any[] = [];
  try {
    types = await sql`SELECT name, start_time, end_time FROM shift_types WHERE team_id = ${teamId} ORDER BY position ASC, id ASC`;
  } catch { /* table missing */ }
  return (s: any): string => {
    if (!s) return '';
    const byName = types.find((t: any) => t.name === s.type);
    if (byName) return byName.name;
    const byTime = types.find((t: any) => t.start_time === s.start_time && t.end_time === s.end_time);
    if (byTime) return byTime.name;
    return LEGACY_LABEL[s.type as string] ?? s.type ?? 'Směna';
  };
}

async function shiftsOnDay(teamId: number, date: string) {
  try {
    return await sql`
      SELECT s.id, s.employee_id, s.start_time, s.end_time, s.type
      FROM shifts s JOIN users u ON u.id = s.employee_id
      WHERE s.date = ${date} AND (s.team_id = ${teamId} OR u.team_id = ${teamId})
      ORDER BY s.start_time ASC, s.id ASC`;
  } catch {
    return [] as any[];
  }
}

// Two shifts count as "the same shift" when their times overlap. Missing times
// mean we can't tell them apart, so the whole day is treated as one shift.
function overlaps(a: any, b: any): boolean {
  if (!a?.start_time || !a?.end_time || !b?.start_time || !b?.end_time) return true;
  return a.start_time < b.end_time && b.start_time < a.end_time;
}

function coworkerIdsFor(dayRows: any[], employeeId: number): number[] {
  const mine = dayRows.filter(r => r.employee_id === employeeId);
  const others = dayRows.filter(r => r.employee_id !== employeeId);
  const pool = mine.length ? others.filter(o => mine.some(m => overlaps(m, o))) : others;
  return Array.from(new Set(pool.map(r => r.employee_id as number)));
}

interface ItemMark { points: number; note: string | null; flagged: boolean }

async function itemMarks(employeeId: number, date: string) {
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT kind, ref_id, points, note, flagged FROM shift_review_items
      WHERE employee_id = ${employeeId} AND work_date = ${date}`;
  } catch { /* table missing */ }
  return (kind: string, refId: number): ItemMark | null => {
    const r = rows.find((x: any) => x.kind === kind && x.ref_id === refId);
    return r ? { points: r.points ?? 0, note: r.note ?? null, flagged: r.flagged === true } : null;
  };
}

// Builds the full drill-in for one employee + day: what they did, what they
// skipped, what they never touched, plus the automatic points that follow.
async function buildSummary(teamId: number, emp: any, date: string, pt: PointsConfig) {
  const employeeId = emp.id as number;

  // --- Tasks: completed that day, plus everything due that day and left undone. ---
  let doneRows: any[] = [];
  try {
    doneRows = await sql`
      SELECT id, title, description, priority, checklist, review_note FROM tasks
      WHERE completed_by = ${employeeId} AND status = 'done'
        AND (to_char(completed_at, 'YYYY-MM-DD') = ${date} OR (completed_at IS NULL AND due_date = ${date}))
      ORDER BY title`;
  } catch {
    try {
      doneRows = await sql`
        SELECT id, title, priority FROM tasks
        WHERE completed_by = ${employeeId} AND status = 'done' AND due_date = ${date} ORDER BY title`;
    } catch { doneRows = []; }
  }

  let missedRows: any[] = [];
  try {
    missedRows = await sql`
      SELECT id, title, description, priority, checklist, review_note FROM tasks
      WHERE due_date = ${date} AND status <> 'done'
        AND (assigned_to = ${employeeId} OR (assigned_to IS NULL AND team_id = ${teamId}))
      ORDER BY title`;
  } catch {
    try {
      missedRows = await sql`
        SELECT id, title, priority FROM tasks
        WHERE due_date = ${date} AND status <> 'done' AND assigned_to = ${employeeId} ORDER BY title`;
    } catch { missedRows = []; }
  }

  // --- Procedure runs that day, with the step texts for the drill-in. ---
  let procRows: any[] = [];
  try {
    procRows = await sql`
      SELECT r.id, p.name AS procedure_name, p.items, r.status, r.checked_items, r.skipped_items, r.total_items, r.duration_seconds, r.review_note
      FROM procedure_runs r JOIN procedures p ON p.id = r.procedure_id
      WHERE r.user_id = ${employeeId}
        AND to_char(COALESCE(r.completed_at, r.started_at), 'YYYY-MM-DD') = ${date}
      ORDER BY r.started_at`;
  } catch {
    try {
      procRows = await sql`
        SELECT r.id, p.name AS procedure_name, p.items, r.status, r.checked_items, r.total_items, r.duration_seconds
        FROM procedure_runs r JOIN procedures p ON p.id = r.procedure_id
        WHERE r.user_id = ${employeeId}
          AND to_char(COALESCE(r.completed_at, r.started_at), 'YYYY-MM-DD') = ${date}
        ORDER BY r.started_at`;
    } catch { procRows = []; }
  }

  // --- Closing. A closing filed by a colleague on this person's behalf still
  // counts as existing (so they aren't penalised), but their own row wins. ---
  let closingRow: any = null;
  let closingHasCash = true;
  try {
    const [cl] = await sql`
      SELECT id, approved, shift_label, opening_cash, cash_revenue, card_revenue, tips, expenses,
             cash_removed, self_payout, closing_cash, customers, notes, review_note, covered_by,
             payout_from_register, tips_in_drawer
      FROM cash_closings WHERE created_by = ${employeeId} AND date = ${date}
      ORDER BY (covered_by IS NULL) DESC, id ASC LIMIT 1`;
    closingRow = cl ?? null;
  } catch {
    try {
      const [cl] = await sql`
        SELECT id, approved, shift_label, opening_cash, cash_revenue, card_revenue, tips, expenses,
               cash_removed, self_payout, closing_cash, customers, notes, covered_by
        FROM cash_closings WHERE created_by = ${employeeId} AND date = ${date} ORDER BY id ASC LIMIT 1`;
      closingRow = cl ?? null;
    } catch {
      try {
        const [cl] = await sql`SELECT id, approved, shift_label, cash_revenue, card_revenue FROM cash_closings WHERE created_by = ${employeeId} AND date = ${date} LIMIT 1`;
        closingRow = cl ?? null;
        closingHasCash = false;
      } catch { closingRow = null; }
    }
  }

  // --- Shift + coworkers on the same shift. ---
  const dayRows = await shiftsOnDay(teamId, date);
  const label = await shiftLabeller(teamId);
  const mine = dayRows.filter((r: any) => r.employee_id === employeeId);
  const hadShift = mine.length > 0;
  const shift = hadShift
    ? { startTime: mine[0].start_time ?? null, endTime: mine[0].end_time ?? null, label: label(mine[0]) }
    : null;
  const coIds = coworkerIdsFor(dayRows, employeeId);
  let coworkers: { id: number; name: string; avatar: string | null }[] = [];
  if (coIds.length) {
    const members = await sql`SELECT id, name, avatar FROM users WHERE team_id = ${teamId} AND role = 'employee' ORDER BY name ASC`;
    coworkers = members.filter((m: any) => coIds.includes(m.id))
      .map((m: any) => ({ id: m.id, name: m.name, avatar: m.avatar ?? null }));
  }

  const mark = await itemMarks(employeeId, date);

  const tasks = [
    ...doneRows.map((t: any) => ({ row: t, state: 'done' as const })),
    ...missedRows.map((t: any) => ({ row: t, state: 'missed' as const })),
  ].map(({ row, state }) => ({
    id: row.id, title: row.title, description: row.description ?? null, priority: row.priority,
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
    reviewNote: row.review_note ?? null,
    state,
    item: mark('task', row.id),
  }));

  const procedures = procRows.map((p: any) => {
    const steps = parseSteps(p.items).map((s: any) => s.text);
    const checked: number[] = Array.isArray(p.checked_items) ? p.checked_items : [];
    const skipped: number[] = Array.isArray(p.skipped_items) ? p.skipped_items : [];
    const total = Math.max(Number(p.total_items) || 0, steps.length);
    const missing: number[] = [];
    for (let i = 0; i < total; i++) if (!checked.includes(i) && !skipped.includes(i)) missing.push(i);
    return {
      id: p.id, name: p.procedure_name, status: p.status,
      steps, checked, skipped, missing,
      done: checked.length, skippedCount: skipped.length, total,
      durationSeconds: p.duration_seconds ?? null,
      reviewNote: p.review_note ?? null,
      item: mark('procedure', p.id),
    };
  });

  let closing: any = null;
  if (closingRow) {
    const calc = {
      opening_cash: num(closingRow.opening_cash), cash_revenue: num(closingRow.cash_revenue),
      expenses: num(closingRow.expenses), cash_removed: num(closingRow.cash_removed),
      self_payout: num(closingRow.self_payout), closing_cash: num(closingRow.closing_cash),
      payout_from_register: closingRow.payout_from_register ?? null,
    };
    closing = {
      id: closingRow.id, approved: closingRow.approved !== false, shiftLabel: closingRow.shift_label ?? null,
      openingCash: closingRow.opening_cash ?? null, cashRevenue: closingRow.cash_revenue ?? null,
      cardRevenue: closingRow.card_revenue ?? null, tips: closingRow.tips ?? null,
      expenses: closingRow.expenses ?? null, cashRemoved: closingRow.cash_removed ?? null,
      selfPayout: closingRow.self_payout ?? null, closingCash: closingRow.closing_cash ?? null,
      customers: closingRow.customers ?? null, notes: closingRow.notes ?? null,
      reviewNote: closingRow.review_note ?? null,
      tipsInDrawer: closingRow.tips_in_drawer ?? null,
      coveredBy: closingRow.covered_by ?? null,
      expected: closingHasCash ? expectedCash(calc) : null,
      difference: closingHasCash ? cashDifference(calc) : null,
      item: mark('closing', closingRow.id),
    };
  }

  let review: any = null;
  try {
    const [rv] = await sql`
      SELECT rating, note, points, auto_points, flagged, scope FROM shift_reviews
      WHERE employee_id = ${employeeId} AND work_date = ${date} LIMIT 1`;
    review = rv ? {
      rating: rv.rating ?? 0, note: rv.note ?? null, points: rv.points ?? 0,
      autoPoints: rv.auto_points ?? 0, flagged: rv.flagged === true, scope: rv.scope ?? 'individual',
    } : null;
  } catch {
    try {
      const [rv] = await sql`SELECT rating, note, points FROM shift_reviews WHERE employee_id = ${employeeId} AND work_date = ${date} LIMIT 1`;
      review = rv ? { rating: rv.rating ?? 0, note: rv.note ?? null, points: rv.points ?? 0, autoPoints: 0, flagged: false, scope: 'individual' } : null;
    } catch { review = null; }
  }

  const autoPoints = computeAutoPoints({ hadShift, tasks, procedures, closing }, pt);

  return {
    employee: { id: emp.id, name: emp.name, avatar: emp.avatar },
    date, hadShift, shift, coworkers,
    tasks, procedures, closing, review, autoPoints,
  };
}

// GET ?date=YYYY-MM-DD               → roster + review status for the team that day (dashboard)
//     ?month=YYYY-MM                 → per-day roster + review status (review calendar)
//     ?employeeId=&date=YYYY-MM-DD   → full drill-in of what the employee did + existing review
export async function GET(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });
  if (c.role !== 'employer' && c.role !== 'kiosk') return NextResponse.json({ error: 'Jen pro vedení' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const employeeIdRaw = searchParams.get('employeeId');
  const month = searchParams.get('month') ?? '';
  const date = searchParams.get('date') ?? '';

  // ---- Month mode: who worked each day and whether they're rated. ----
  if (!employeeIdRaw && month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
    const from = `${month}-01`, to = `${month}-31`;
    const members = await sql`SELECT id, name, avatar FROM users WHERE team_id = ${c.teamId} AND role = 'employee' ORDER BY name ASC`;
    const memberById = new Map(members.map((m: any) => [m.id, m]));

    let shiftRows: any[] = [], closingRows: any[] = [], reviewRows: any[] = [];
    try {
      shiftRows = await sql`
        SELECT s.date, s.employee_id FROM shifts s JOIN users u ON u.id = s.employee_id
        WHERE (s.team_id = ${c.teamId} OR u.team_id = ${c.teamId}) AND s.date >= ${from} AND s.date <= ${to}`;
    } catch { /* ignore */ }
    try {
      closingRows = await sql`SELECT date, created_by FROM cash_closings WHERE team_id = ${c.teamId} AND date >= ${from} AND date <= ${to}`;
    } catch { /* ignore */ }
    try {
      reviewRows = await sql`
        SELECT employee_id, work_date, rating, flagged FROM shift_reviews
        WHERE team_id = ${c.teamId} AND work_date >= ${from} AND work_date <= ${to}`;
    } catch {
      try {
        reviewRows = await sql`
          SELECT employee_id, work_date, rating FROM shift_reviews
          WHERE team_id = ${c.teamId} AND work_date >= ${from} AND work_date <= ${to}`;
      } catch { reviewRows = []; }
    }

    const byDay = new Map<string, Set<number>>();
    const add = (d: string, id: number) => {
      if (!d || !memberById.has(id)) return;
      if (!byDay.has(d)) byDay.set(d, new Set());
      byDay.get(d)!.add(id);
    };
    shiftRows.forEach((r: any) => add(r.date, r.employee_id));
    closingRows.forEach((r: any) => add(r.date, r.created_by));
    // A rated day always shows up, even without a planned shift.
    reviewRows.forEach((r: any) => add(r.work_date, r.employee_id));

    const reviewBy = new Map(reviewRows.map((r: any) => [`${r.employee_id}|${r.work_date}`, r]));
    const days = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, ids]) => {
        const staff = Array.from(ids)
          .map(id => {
            const m: any = memberById.get(id);
            const rv: any = reviewBy.get(`${id}|${d}`);
            return {
              id, name: m.name, avatar: m.avatar ?? null,
              reviewed: !!rv, rating: rv?.rating ?? 0, flagged: rv?.flagged === true,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        return { date: d, staff, pending: staff.filter(s => !s.reviewed).length };
      });
    return NextResponse.json({ month, days });
  }

  if (!isDate(date)) return NextResponse.json({ error: 'Chybí datum' }, { status: 400 });

  // ---- Roster mode (no employeeId): who worked that day and who's been rated. ----
  if (!employeeIdRaw) {
    const members = await sql`SELECT id, name, avatar FROM users WHERE team_id = ${c.teamId} AND role = 'employee' ORDER BY name`;
    let reviews: any[] = [];
    try {
      reviews = await sql`SELECT employee_id, rating, points, flagged FROM shift_reviews WHERE team_id = ${c.teamId} AND work_date = ${date}`;
    } catch {
      try { reviews = await sql`SELECT employee_id, rating, points FROM shift_reviews WHERE team_id = ${c.teamId} AND work_date = ${date}`; } catch { /* table missing */ }
    }
    const reviewBy = new Map(reviews.map((r: any) => [r.employee_id, r]));
    // Anyone with a scheduled shift, a filed closing, a completed task, or a run that day counts as "worked".
    const dayRows = await shiftsOnDay(c.teamId, date);
    let closingIds: number[] = [];
    try { closingIds = (await sql`SELECT DISTINCT created_by FROM cash_closings WHERE team_id = ${c.teamId} AND date = ${date}`).map((r: any) => r.created_by); } catch { /* ignore */ }
    const worked = new Set<number>([...dayRows.map((r: any) => r.employee_id as number), ...closingIds]);
    const label = await shiftLabeller(c.teamId);
    const list = members.map((m: any) => {
      const rv = reviewBy.get(m.id);
      const sh = dayRows.find((r: any) => r.employee_id === m.id);
      return {
        id: m.id, name: m.name, avatar: m.avatar,
        worked: worked.has(m.id),
        reviewed: !!rv,
        rating: rv?.rating ?? 0,
        points: rv?.points ?? 0,
        flagged: rv?.flagged === true,
        shiftLabel: sh ? label(sh) : null,
        startTime: sh?.start_time ?? null,
        endTime: sh?.end_time ?? null,
        coworkerIds: coworkerIdsFor(dayRows, m.id),
      };
    }).sort((a, b) => Number(b.worked) - Number(a.worked) || a.name.localeCompare(b.name));
    return NextResponse.json({ date, list });
  }

  // ---- Detail mode. ----
  const employeeId = parseInt(employeeIdRaw);
  if (!Number.isFinite(employeeId)) return NextResponse.json({ error: 'Neplatný zaměstnanec' }, { status: 400 });
  const [emp] = await sql`SELECT id, name, avatar, team_id FROM users WHERE id = ${employeeId}`;
  if (!emp || emp.team_id !== c.teamId) return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 404 });

  const pt = await teamPoints(c.teamId);
  return NextResponse.json(await buildSummary(c.teamId, emp, date, pt));
}

// POST { employeeId, date, rating, note, points, flagged, applyToShift?, employeeIds? }
// → upsert the shift review; with applyToShift/employeeIds the same verdict is
//   written for everyone on that shift (scope = 'shift').
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Hodnotit může jen vedení' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const employeeId = parseInt(b.employeeId);
  const date = String(b.date ?? '');
  if (!Number.isFinite(employeeId) || !isDate(date)) {
    return NextResponse.json({ error: 'Chybí zaměstnanec nebo datum' }, { status: 400 });
  }
  const [emp] = await sql`SELECT id, name, avatar, team_id FROM users WHERE id = ${employeeId}`;
  if (!emp || emp.team_id !== c.teamId) return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 404 });

  const rating = Math.max(0, Math.min(5, Math.round(Number(b.rating) || 0)));
  const note = b.note ? String(b.note).slice(0, 1000) : null;
  const pointsAwarded = Math.max(-500, Math.min(500, Math.round(Number(b.points) || 0)));
  const flagged = b.flagged === true;

  // Resolve who the verdict applies to.
  const explicitIds = Array.isArray(b.employeeIds)
    ? b.employeeIds.map((n: any) => parseInt(n)).filter((n: number) => Number.isFinite(n))
    : [];
  const wholeShift = b.applyToShift === true || explicitIds.length > 0;
  let targetIds = [employeeId];
  if (wholeShift) {
    const extra = explicitIds.length ? explicitIds : coworkerIdsFor(await shiftsOnDay(c.teamId, date), employeeId);
    targetIds = Array.from(new Set([employeeId, ...extra]));
  }
  let targets: any[] = [{ id: emp.id, name: emp.name, avatar: emp.avatar }];
  if (targetIds.length > 1) {
    const members = await sql`SELECT id, name, avatar FROM users WHERE team_id = ${c.teamId} AND role = 'employee' ORDER BY name ASC`;
    targets = members.filter((m: any) => targetIds.includes(m.id));
  }
  if (!targets.length) return NextResponse.json({ error: 'Žádný zaměstnanec k hodnocení' }, { status: 400 });

  const scope = wholeShift ? 'shift' : 'individual';
  const pt = await teamPoints(c.teamId);
  let legacyOnly = false;

  for (const t of targets) {
    // Automatic points are recomputed per person — the same shift can look
    // very different for two people (different tasks, runs, closing).
    let auto = 0;
    try { auto = (await buildSummary(c.teamId!, t, date, pt)).autoPoints.total; } catch { auto = 0; }
    try {
      await sql`
        INSERT INTO shift_reviews (team_id, employee_id, work_date, rating, note, points, auto_points, flagged, scope, reviewed_by, updated_at)
        VALUES (${c.teamId}, ${t.id}, ${date}, ${rating}, ${note}, ${pointsAwarded}, ${auto}, ${flagged}, ${scope}, ${c.meId}, NOW())
        ON CONFLICT (employee_id, work_date)
        DO UPDATE SET rating = ${rating}, note = ${note}, points = ${pointsAwarded}, auto_points = ${auto},
                      flagged = ${flagged}, scope = ${scope}, reviewed_by = ${c.meId}, seen_at = NULL, updated_at = NOW()`;
    } catch {
      try {
        await sql`
          INSERT INTO shift_reviews (team_id, employee_id, work_date, rating, note, points, reviewed_by, updated_at)
          VALUES (${c.teamId}, ${t.id}, ${date}, ${rating}, ${note}, ${pointsAwarded}, ${c.meId}, NOW())
          ON CONFLICT (employee_id, work_date)
          DO UPDATE SET rating = ${rating}, note = ${note}, points = ${pointsAwarded}, reviewed_by = ${c.meId}, updated_at = NOW()`;
        legacyOnly = true;
      } catch {
        return NextResponse.json({ error: 'Hodnocení se nepodařilo uložit. Spusť /api/init.' }, { status: 500 });
      }
    }

    // Let the employee know they were rated.
    try {
      const dLabel = new Date(date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });
      await notifyUser(t.id, {
        title: flagged ? 'Hodnocení směny — něco k nápravě' : 'Hodnocení směny',
        body: `Vedení ohodnotilo tvou směnu ${dLabel}${rating ? ` — ${rating}★` : ''}${pointsAwarded ? `, ${pointsAwarded > 0 ? '+' : ''}${pointsAwarded} bodů` : ''}`,
        type: 'info',
      });
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true, scope, employeeIds: targets.map((t: any) => t.id), legacyOnly });
}

// PATCH — employer edits a single item on the shift: fix checklist / procedure
// steps and attach points, a note and a flag to it.
// Body: { kind, id, employeeId?, date?, points?, note?, flagged?, checklist?, checkedItems?, skippedItems? }
export async function PATCH(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Upravovat může jen vedení' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const kind = String(b.kind ?? '');
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  if (kind !== 'task' && kind !== 'procedure' && kind !== 'closing') {
    return NextResponse.json({ error: 'Neznámý typ' }, { status: 400 });
  }
  const noteProvided = b.note !== undefined;
  const note = noteProvided ? (b.note ? String(b.note).slice(0, 1000) : null) : undefined;

  const cleanIndices = (arr: any): number[] =>
    Array.isArray(arr) ? Array.from(new Set(arr.map((n: any) => parseInt(n)).filter((n: number) => !isNaN(n)))) : [];

  // Per-item points / note / flag live in shift_review_items and need the
  // employee + day the item is being reviewed for.
  const itemEmployeeId = parseInt(b.employeeId);
  const itemDate = String(b.date ?? '');
  const wantsItem = b.points !== undefined || b.flagged !== undefined || noteProvided;
  let itemSaved = false;
  const saveItem = async () => {
    if (!wantsItem || !Number.isFinite(itemEmployeeId) || !isDate(itemDate)) return;
    const [target] = await sql`SELECT id, team_id FROM users WHERE id = ${itemEmployeeId}`;
    if (!target || target.team_id !== c.teamId) return;
    let existing: any = null;
    try {
      const [r] = await sql`
        SELECT points, note, flagged FROM shift_review_items
        WHERE employee_id = ${itemEmployeeId} AND work_date = ${itemDate} AND kind = ${kind} AND ref_id = ${id}`;
      existing = r ?? null;
    } catch { return; /* table missing — legacy columns below still apply */ }
    const points = b.points !== undefined ? clampPts(b.points) : (existing?.points ?? 0);
    const nextNote = noteProvided ? note ?? null : (existing?.note ?? null);
    const flagged = b.flagged !== undefined ? b.flagged === true : existing?.flagged === true;
    try {
      await sql`
        INSERT INTO shift_review_items (team_id, employee_id, work_date, kind, ref_id, points, note, flagged, created_by, updated_at)
        VALUES (${c.teamId}, ${itemEmployeeId}, ${itemDate}, ${kind}, ${id}, ${points}, ${nextNote}, ${flagged}, ${c.meId}, NOW())
        ON CONFLICT (employee_id, work_date, kind, ref_id)
        DO UPDATE SET points = ${points}, note = ${nextNote}, flagged = ${flagged}, updated_at = NOW()`;
      itemSaved = true;
    } catch { /* not migrated */ }
  };

  if (kind === 'task') {
    const [t] = await sql`
      SELECT t.id, t.team_id, u.team_id AS assignee_team FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to WHERE t.id = ${id}`;
    const taskTeam = t?.team_id ?? t?.assignee_team;
    if (!t || taskTeam !== c.teamId) return NextResponse.json({ error: 'Úkol nenalezen' }, { status: 404 });
    if (Array.isArray(b.checklist)) {
      const cl = b.checklist.map((i: any) => ({ text: String(i?.text ?? '').slice(0, 300), done: !!i?.done }))
        .filter((i: any) => i.text).slice(0, 50);
      try { await sql`UPDATE tasks SET checklist = ${JSON.stringify(cl)}::jsonb WHERE id = ${id}`; } catch { /* not migrated */ }
    }
    await saveItem();
    if (noteProvided) {
      // Legacy column kept in sync so older views keep showing the note.
      try { await sql`UPDATE tasks SET review_note = ${note} WHERE id = ${id}`; } catch {
        if (!itemSaved) return NextResponse.json({ error: 'Chybí migrace — spusť /api/init.' }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (kind === 'procedure') {
    const [r] = await sql`SELECT id, team_id, total_items FROM procedure_runs WHERE id = ${id}`;
    if (!r || r.team_id !== c.teamId) return NextResponse.json({ error: 'Průběh nenalezen' }, { status: 404 });
    if (Array.isArray(b.checkedItems) || Array.isArray(b.skippedItems)) {
      const checked = cleanIndices(b.checkedItems);
      const skipped = cleanIndices(b.skippedItems).filter((i: number) => !checked.includes(i));
      try {
        await sql`UPDATE procedure_runs SET checked_items = ${JSON.stringify(checked)}::jsonb, skipped_items = ${JSON.stringify(skipped)}::jsonb WHERE id = ${id}`;
      } catch {
        try { await sql`UPDATE procedure_runs SET checked_items = ${JSON.stringify(checked)}::jsonb WHERE id = ${id}`; } catch { /* ignore */ }
      }
    }
    await saveItem();
    if (noteProvided) {
      try { await sql`UPDATE procedure_runs SET review_note = ${note} WHERE id = ${id}`; } catch {
        if (!itemSaved) return NextResponse.json({ error: 'Chybí migrace — spusť /api/init.' }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  const [cl] = await sql`SELECT id, team_id FROM cash_closings WHERE id = ${id}`;
  if (!cl || cl.team_id !== c.teamId) return NextResponse.json({ error: 'Uzávěrka nenalezena' }, { status: 404 });
  await saveItem();
  if (noteProvided) {
    try { await sql`UPDATE cash_closings SET review_note = ${note} WHERE id = ${id}`; } catch {
      if (!itemSaved) return NextResponse.json({ error: 'Chybí migrace — spusť /api/init.' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
