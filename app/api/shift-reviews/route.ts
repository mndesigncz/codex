import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { parseSteps } from '@/lib/steps';

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

// GET ?date=YYYY-MM-DD               → roster + review status for the team that day (dashboard)
//     ?employeeId=&date=YYYY-MM-DD   → full drill-in of what the employee did + existing review
export async function GET(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });
  if (c.role !== 'employer' && c.role !== 'kiosk') return NextResponse.json({ error: 'Jen pro vedení' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const employeeIdRaw = searchParams.get('employeeId');
  const date = searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Chybí datum' }, { status: 400 });

  // ---- Roster mode (no employeeId): who worked that day and who's been rated. ----
  if (!employeeIdRaw) {
    const members = await sql`SELECT id, name, avatar FROM users WHERE team_id = ${c.teamId} AND role = 'employee' ORDER BY name`;
    let reviews: any[] = [];
    try { reviews = await sql`SELECT employee_id, rating, points FROM shift_reviews WHERE team_id = ${c.teamId} AND work_date = ${date}`; } catch { /* table missing */ }
    const reviewBy = new Map(reviews.map((r: any) => [r.employee_id, r]));
    // Anyone with a scheduled shift, a filed closing, a completed task, or a run that day counts as "worked".
    let shiftIds: number[] = [], closingIds: number[] = [];
    try { shiftIds = (await sql`SELECT DISTINCT employee_id FROM shifts WHERE team_id = ${c.teamId} AND date = ${date}`).map((r: any) => r.employee_id); } catch {}
    try { closingIds = (await sql`SELECT DISTINCT created_by FROM cash_closings WHERE team_id = ${c.teamId} AND date = ${date}`).map((r: any) => r.created_by); } catch {}
    const worked = new Set<number>([...shiftIds, ...closingIds]);
    const list = members.map((m: any) => {
      const rv = reviewBy.get(m.id);
      return {
        id: m.id, name: m.name, avatar: m.avatar,
        worked: worked.has(m.id),
        reviewed: !!rv,
        rating: rv?.rating ?? 0,
        points: rv?.points ?? 0,
      };
    }).sort((a, b) => Number(b.worked) - Number(a.worked) || a.name.localeCompare(b.name));
    return NextResponse.json({ date, list });
  }

  // ---- Detail mode. ----
  const employeeId = parseInt(employeeIdRaw);
  if (!Number.isFinite(employeeId)) return NextResponse.json({ error: 'Neplatný zaměstnanec' }, { status: 400 });
  const [emp] = await sql`SELECT id, name, avatar, team_id FROM users WHERE id = ${employeeId}`;
  if (!emp || emp.team_id !== c.teamId) return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 404 });

  // Tasks completed that day (by completion timestamp, falling back to due date).
  let tasks: any[] = [];
  try {
    tasks = await sql`
      SELECT id, title, description, priority, checklist, review_note FROM tasks
      WHERE completed_by = ${employeeId} AND status = 'done'
        AND (to_char(completed_at, 'YYYY-MM-DD') = ${date} OR (completed_at IS NULL AND due_date = ${date}))
      ORDER BY title`;
  } catch {
    try {
      tasks = await sql`
        SELECT id, title, priority FROM tasks
        WHERE completed_by = ${employeeId} AND status = 'done' AND due_date = ${date} ORDER BY title`;
    } catch { tasks = []; }
  }

  // Procedure runs that day (with step definitions for drill-in).
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

  // Closing filed that day (full detail for review).
  let closing: any = null;
  try {
    const [cl] = await sql`
      SELECT id, approved, shift_label, opening_cash, cash_revenue, card_revenue, tips, expenses,
             cash_removed, self_payout, closing_cash, customers, notes, review_note, covered_by
      FROM cash_closings WHERE created_by = ${employeeId} AND date = ${date} AND covered_by IS NULL LIMIT 1`;
    closing = cl ?? null;
  } catch {
    try {
      const [cl] = await sql`SELECT id, approved, shift_label, cash_revenue, card_revenue FROM cash_closings WHERE created_by = ${employeeId} AND date = ${date} LIMIT 1`;
      closing = cl ?? null;
    } catch { closing = null; }
  }

  let hadShift = false;
  try {
    const [sh] = await sql`SELECT id FROM shifts WHERE employee_id = ${employeeId} AND date = ${date} LIMIT 1`;
    hadShift = !!sh;
  } catch { /* ignore */ }

  let review: any = null;
  try {
    const [rv] = await sql`
      SELECT rating, note, points FROM shift_reviews
      WHERE employee_id = ${employeeId} AND work_date = ${date} LIMIT 1`;
    review = rv ?? null;
  } catch { /* table missing */ }

  return NextResponse.json({
    employee: { id: emp.id, name: emp.name, avatar: emp.avatar },
    date, hadShift,
    tasks: tasks.map((t: any) => ({
      id: t.id, title: t.title, description: t.description ?? null, priority: t.priority,
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
      reviewNote: t.review_note ?? null,
    })),
    procedures: procRows.map((p: any) => {
      const steps = parseSteps(p.items).map((s: any) => s.text);
      const checked = Array.isArray(p.checked_items) ? p.checked_items : [];
      const skipped = Array.isArray(p.skipped_items) ? p.skipped_items : [];
      return {
        id: p.id, name: p.procedure_name, status: p.status,
        steps, checked, skipped,
        done: checked.length, skippedCount: skipped.length, total: p.total_items ?? steps.length,
        durationSeconds: p.duration_seconds ?? null,
        reviewNote: p.review_note ?? null,
      };
    }),
    closing: closing ? {
      id: closing.id, approved: closing.approved !== false, shiftLabel: closing.shift_label ?? null,
      openingCash: closing.opening_cash ?? null, cashRevenue: closing.cash_revenue ?? null, cardRevenue: closing.card_revenue ?? null,
      tips: closing.tips ?? null, expenses: closing.expenses ?? null, cashRemoved: closing.cash_removed ?? null,
      selfPayout: closing.self_payout ?? null, closingCash: closing.closing_cash ?? null, customers: closing.customers ?? null,
      notes: closing.notes ?? null, reviewNote: closing.review_note ?? null,
    } : null,
    review,
  });
}

// POST { employeeId, date, rating, note, points } → upsert a shift review.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Hodnotit může jen vedení' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const employeeId = parseInt(b.employeeId);
  const date = String(b.date ?? '');
  if (!Number.isFinite(employeeId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Chybí zaměstnanec nebo datum' }, { status: 400 });
  }
  const [emp] = await sql`SELECT id, name, team_id FROM users WHERE id = ${employeeId}`;
  if (!emp || emp.team_id !== c.teamId) return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 404 });

  const rating = Math.max(0, Math.min(5, Math.round(Number(b.rating) || 0)));
  const note = b.note ? String(b.note).slice(0, 1000) : null;
  const pointsAwarded = Math.max(-500, Math.min(500, Math.round(Number(b.points) || 0)));

  try {
    await sql`
      INSERT INTO shift_reviews (team_id, employee_id, work_date, rating, note, points, reviewed_by, updated_at)
      VALUES (${c.teamId}, ${employeeId}, ${date}, ${rating}, ${note}, ${pointsAwarded}, ${c.meId}, NOW())
      ON CONFLICT (employee_id, work_date)
      DO UPDATE SET rating = ${rating}, note = ${note}, points = ${pointsAwarded}, reviewed_by = ${c.meId}, updated_at = NOW()`;
  } catch {
    return NextResponse.json({ error: 'Hodnocení se nepodařilo uložit. Spusť /api/init.' }, { status: 500 });
  }

  // Let the employee know they were rated.
  try {
    const dLabel = new Date(date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });
    await notifyUser(employeeId, {
      title: 'Hodnocení směny',
      body: `Vedení ohodnotilo tvou směnu ${dLabel}${rating ? ` — ${rating}★` : ''}${pointsAwarded ? `, +${pointsAwarded} bodů` : ''}`,
      type: 'info',
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true });
}

// PATCH — employer edits a single item on the shift: toggle checklist points /
// procedure steps, or attach a review note. Body: { kind, id, ... }.
export async function PATCH(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Upravovat může jen vedení' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const kind = String(b.kind ?? '');
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  const noteProvided = b.note !== undefined;
  const note = noteProvided ? (b.note ? String(b.note).slice(0, 1000) : null) : undefined;

  const cleanIndices = (arr: any): number[] =>
    Array.isArray(arr) ? Array.from(new Set(arr.map((n: any) => parseInt(n)).filter((n: number) => !isNaN(n)))) : [];

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
    if (noteProvided) {
      try { await sql`UPDATE tasks SET review_note = ${note} WHERE id = ${id}`; } catch { return NextResponse.json({ error: 'Chybí migrace — spusť /api/init.' }, { status: 500 }); }
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
    if (noteProvided) {
      try { await sql`UPDATE procedure_runs SET review_note = ${note} WHERE id = ${id}`; } catch { return NextResponse.json({ error: 'Chybí migrace — spusť /api/init.' }, { status: 500 }); }
    }
    return NextResponse.json({ ok: true });
  }

  if (kind === 'closing') {
    const [cl] = await sql`SELECT id, team_id FROM cash_closings WHERE id = ${id}`;
    if (!cl || cl.team_id !== c.teamId) return NextResponse.json({ error: 'Uzávěrka nenalezena' }, { status: 404 });
    if (noteProvided) {
      try { await sql`UPDATE cash_closings SET review_note = ${note} WHERE id = ${id}`; } catch { return NextResponse.json({ error: 'Chybí migrace — spusť /api/init.' }, { status: 500 }); }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Neznámý typ' }, { status: 400 });
}
