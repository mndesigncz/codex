import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';

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

// GET ?employeeId=&date=YYYY-MM-DD → what the employee did that day + any existing review.
export async function GET(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });
  if (c.role !== 'employer' && c.role !== 'kiosk') return NextResponse.json({ error: 'Jen pro vedení' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const employeeId = parseInt(searchParams.get('employeeId') ?? '');
  const date = searchParams.get('date') ?? '';
  if (!Number.isFinite(employeeId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Chybí zaměstnanec nebo datum' }, { status: 400 });
  }
  // Ensure the employee is on this team.
  const [emp] = await sql`SELECT id, name, avatar, team_id FROM users WHERE id = ${employeeId}`;
  if (!emp || emp.team_id !== c.teamId) return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 404 });

  // Tasks completed that day (by completion timestamp, falling back to due date).
  let tasks: any[] = [];
  try {
    tasks = await sql`
      SELECT id, title, priority FROM tasks
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

  // Procedure runs that day.
  let procedures: any[] = [];
  try {
    procedures = await sql`
      SELECT r.id, p.name AS procedure_name, r.status, r.checked_items, r.skipped_items, r.total_items, r.duration_seconds
      FROM procedure_runs r JOIN procedures p ON p.id = r.procedure_id
      WHERE r.user_id = ${employeeId}
        AND to_char(COALESCE(r.completed_at, r.started_at), 'YYYY-MM-DD') = ${date}
      ORDER BY r.started_at`;
  } catch {
    try {
      procedures = await sql`
        SELECT r.id, p.name AS procedure_name, r.status, r.checked_items, r.total_items, r.duration_seconds
        FROM procedure_runs r JOIN procedures p ON p.id = r.procedure_id
        WHERE r.user_id = ${employeeId}
          AND to_char(COALESCE(r.completed_at, r.started_at), 'YYYY-MM-DD') = ${date}
        ORDER BY r.started_at`;
    } catch { procedures = []; }
  }

  // Closing filed that day.
  let closing: any = null;
  try {
    const [cl] = await sql`
      SELECT id, approved, shift_label, cash_revenue, card_revenue, covered_by
      FROM cash_closings WHERE created_by = ${employeeId} AND date = ${date} AND covered_by IS NULL LIMIT 1`;
    closing = cl ?? null;
  } catch {
    try {
      const [cl] = await sql`SELECT id FROM cash_closings WHERE created_by = ${employeeId} AND date = ${date} LIMIT 1`;
      closing = cl ?? null;
    } catch { closing = null; }
  }

  // Did they have a shift scheduled that day?
  let hadShift = false;
  try {
    const [sh] = await sql`SELECT id FROM shifts WHERE employee_id = ${employeeId} AND date = ${date} LIMIT 1`;
    hadShift = !!sh;
  } catch { /* ignore */ }

  // Existing review.
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
    tasks,
    procedures: procedures.map((p: any) => ({
      id: p.id, name: p.procedure_name, status: p.status,
      done: Array.isArray(p.checked_items) ? p.checked_items.length : 0,
      skipped: Array.isArray(p.skipped_items) ? p.skipped_items.length : 0,
      total: p.total_items ?? 0,
      durationSeconds: p.duration_seconds ?? null,
    })),
    closing: closing ? { id: closing.id, approved: closing.approved !== false, shiftLabel: closing.shift_label ?? null } : null,
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
