import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function currentUser() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const id = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const name = (s.user as any).name as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${id}`;
  return { id, role, name, teamId: u?.team_id as number | null };
}

// Shape a "running" run so the client has everything to render the checklist.
function shapeActive(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    procedureId: row.procedure_id,
    name: row.name,
    icon: row.icon ?? 'check',
    color: row.color ?? 'lime',
    items: Array.isArray(row.items) ? row.items : [],
    checkedItems: Array.isArray(row.checked_items) ? row.checked_items : [],
    totalItems: row.total_items ?? 0,
    startedAt: row.started_at,
    status: row.status,
  };
}

// GET: ?active=1 → caller's running run; else employer=team feed, employee=own runs
export async function GET(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!me.teamId) return NextResponse.json({ active: null, runs: [] });

  const { searchParams } = new URL(request.url);

  if (searchParams.get('active')) {
    const [row] = await sql`
      SELECT r.id, r.procedure_id, r.checked_items, r.total_items, r.status, r.started_at,
             p.name, p.icon, p.color, p.items
      FROM procedure_runs r
      JOIN procedures p ON p.id = r.procedure_id
      WHERE r.user_id = ${me.id} AND r.status = 'running'
      ORDER BY r.started_at DESC
      LIMIT 1`;
    return NextResponse.json({ active: shapeActive(row) });
  }

  if (me.role === 'employer') {
    const runs = await sql`
      SELECT r.id, r.procedure_id, r.user_id, r.checked_items, r.total_items, r.status,
             r.started_at, r.completed_at, r.duration_seconds,
             p.name AS procedure_name, p.icon AS procedure_icon, p.color AS procedure_color,
             u.name AS user_name, u.avatar AS user_avatar
      FROM procedure_runs r
      JOIN procedures p ON p.id = r.procedure_id
      JOIN users u ON u.id = r.user_id
      WHERE r.team_id = ${me.teamId}
      ORDER BY COALESCE(r.completed_at, r.started_at) DESC
      LIMIT 50`;
    return NextResponse.json({ runs });
  }

  const runs = await sql`
    SELECT r.id, r.procedure_id, r.user_id, r.checked_items, r.total_items, r.status,
           r.started_at, r.completed_at, r.duration_seconds,
           p.name AS procedure_name, p.icon AS procedure_icon, p.color AS procedure_color,
           u.name AS user_name, u.avatar AS user_avatar
    FROM procedure_runs r
    JOIN procedures p ON p.id = r.procedure_id
    JOIN users u ON u.id = r.user_id
    WHERE r.user_id = ${me.id}
    ORDER BY COALESCE(r.completed_at, r.started_at) DESC
    LIMIT 50`;
  return NextResponse.json({ runs });
}

// POST: { procedureId } → start a run (closes any previous running run first)
export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!me.teamId) return NextResponse.json({ error: 'Nejste členem žádného týmu' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const procedureId = parseInt(body.procedureId);
  if (!procedureId) return NextResponse.json({ error: 'Chybí ID postupu' }, { status: 400 });

  const [proc] = await sql`
    SELECT id, team_id, name, icon, color, items
    FROM procedures WHERE id = ${procedureId}`;
  if (!proc || proc.team_id !== me.teamId) {
    return NextResponse.json({ error: 'Postup nenalezen' }, { status: 404 });
  }

  // Close any previous still-running run for this user.
  await sql`
    UPDATE procedure_runs
    SET status = 'completed', completed_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int
    WHERE user_id = ${me.id} AND status = 'running'`;

  const total = Array.isArray(proc.items) ? proc.items.length : 0;
  const [run] = await sql`
    INSERT INTO procedure_runs (procedure_id, team_id, user_id, checked_items, total_items, status)
    VALUES (${procedureId}, ${me.teamId}, ${me.id}, '[]', ${total}, 'running')
    RETURNING id, procedure_id, checked_items, total_items, status, started_at`;

  return NextResponse.json({
    active: shapeActive({
      ...run,
      name: proc.name,
      icon: proc.icon,
      color: proc.color,
      items: proc.items,
    }),
  });
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// PATCH: { runId, checkedItems, complete? } → update progress / finish
export async function PATCH(request: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const runId = parseInt(body.runId);
  if (!runId) return NextResponse.json({ error: 'Chybí ID průběhu' }, { status: 400 });

  const [run] = await sql`
    SELECT r.id, r.user_id, r.team_id, r.procedure_id, r.status, r.started_at, r.total_items,
           p.name AS procedure_name
    FROM procedure_runs r JOIN procedures p ON p.id = r.procedure_id
    WHERE r.id = ${runId}`;
  if (!run || run.user_id !== me.id) {
    return NextResponse.json({ error: 'Průběh nenalezen' }, { status: 404 });
  }

  // Cancel: drop the running run so it doesn't linger or re-hydrate.
  if (body.cancel) {
    await sql`DELETE FROM procedure_runs WHERE id = ${runId} AND status = 'running'`;
    return NextResponse.json({ ok: true });
  }

  const checked: number[] = Array.isArray(body.checkedItems)
    ? Array.from(new Set(body.checkedItems.map((n: any) => parseInt(n)).filter((n: number) => !isNaN(n))))
    : [];

  if (body.complete) {
    const [updated] = await sql`
      UPDATE procedure_runs
      SET checked_items = ${JSON.stringify(checked)}, status = 'completed', completed_at = NOW(),
          duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int
      WHERE id = ${runId}
      RETURNING id, procedure_id, checked_items, total_items, status, started_at, completed_at, duration_seconds`;

    // Notify the team owner (employer).
    const [team] = await sql`SELECT owner_id FROM teams WHERE id = ${run.team_id}`;
    if (team?.owner_id) {
      const dur = fmtDuration(updated.duration_seconds ?? 0);
      notifyUser(team.owner_id, {
        title: 'Postup dokončen',
        body: `${me.name} dokončil/a ${run.procedure_name} za ${dur}`,
        type: 'shift',
      });
    }

    return NextResponse.json({ run: updated });
  }

  const [updated] = await sql`
    UPDATE procedure_runs
    SET checked_items = ${JSON.stringify(checked)}
    WHERE id = ${runId} AND status = 'running'
    RETURNING id, procedure_id, checked_items, total_items, status, started_at`;

  return NextResponse.json({ run: updated ?? run });
}
