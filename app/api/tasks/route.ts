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
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | null };
}

const shape = (r: any) => ({
  id: r.id, title: r.title, description: r.description,
  assignedTo: r.assigned_to ?? null, createdBy: r.created_by,
  teamTask: r.assigned_to == null,
  priority: r.priority, status: r.status, dueDate: r.due_date,
  recurrence: r.recurrence ?? null,
  seriesId: r.series_id ?? null,
  checklist: Array.isArray(r.checklist) ? r.checklist : [],
  assigneeName: r.assignee_name ?? null, assigneeAvatar: r.assignee_avatar ?? null,
  completedBy: r.completed_by ?? null,
  completedByName: r.completed_by_name ?? null, completedByAvatar: r.completed_by_avatar ?? null,
});

const RECURRENCES = ['daily', 'weekdays', 'weekly'];
const TARGET_UPCOMING = 5;   // keep this many future, undone occurrences per series
const HORIZON_DAYS = 120;    // never generate further than this ahead

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => new Date().toISOString().split('T')[0];

// Next occurrence after a 'YYYY-MM-DD' date for the given recurrence.
function nextDueDate(due: string | null, recurrence: string): string {
  const base = due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(due + 'T00:00:00') : new Date();
  const d = new Date(base);
  if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
  else if (recurrence === 'weekdays') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); }
  else d.setDate(d.getDate() + 1); // daily
  return ymd(d);
}

function resetChecklist(cl: any): any[] {
  return Array.isArray(cl) ? cl.map((i: any) => ({ text: String(i?.text ?? ''), done: false })).filter(i => i.text) : [];
}

function genSeriesId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Make sure every recurring series in the team has TARGET_UPCOMING future,
// undone occurrences generated ahead — so people see upcoming tasks instead of
// one that respawns the instant it's completed. Past dates are never created.
async function topUpSeries(teamId: number) {
  let rows: any[];
  try {
    rows = await sql`
      SELECT id, title, description, assigned_to, created_by, priority, due_date, recurrence, checklist, series_id
      FROM tasks WHERE team_id = ${teamId} AND series_id IS NOT NULL`;
  } catch { return; } // columns not migrated yet

  const groups = new Map<string, any[]>();
  for (const r of rows) (groups.get(r.series_id) ?? groups.set(r.series_id, []).get(r.series_id)!).push(r);

  const today = todayStr();
  const horizon = ymd(new Date(Date.now() + HORIZON_DAYS * 86400000));

  for (const [seriesId, occ] of Array.from(groups.entries())) {
    if (!occ.length) continue;
    occ.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    const tmpl = occ[occ.length - 1]; // latest occurrence carries the template
    if (!tmpl.recurrence || !RECURRENCES.includes(tmpl.recurrence)) continue;
    let futureUndone = occ.filter(r => r.due_date && r.due_date >= today && r.status !== 'done').length;
    // Some occurrences fetched above omit status; recount defensively via all rows.
    let cursor = tmpl.due_date || today;
    let guard = 0;
    const inserts: string[] = [];
    while (futureUndone < TARGET_UPCOMING && guard < 400) {
      guard++;
      cursor = nextDueDate(cursor, tmpl.recurrence);
      if (cursor > horizon) break;
      if (cursor < today) continue;             // don't create overdue occurrences retroactively
      inserts.push(cursor);
      futureUndone++;
    }
    for (const date of inserts) {
      try {
        await sql`
          INSERT INTO tasks (title, description, assigned_to, created_by, team_id, priority, status, due_date, recurrence, checklist, series_id)
          VALUES (${tmpl.title}, ${tmpl.description}, ${tmpl.assigned_to}, ${tmpl.created_by}, ${teamId},
                  ${tmpl.priority}, 'pending', ${date}, ${tmpl.recurrence},
                  ${JSON.stringify(resetChecklist(tmpl.checklist))}::jsonb, ${seriesId})`;
      } catch { /* best-effort */ }
    }
  }
}

// GET — employee: their own + team/day tasks; employer/kiosk: the whole team.
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  if (c.teamId) { try { await topUpSeries(c.teamId); } catch { /* ignore */ } }

  const teamWide = (c.role === 'employer' || c.role === 'kiosk') && c.teamId;
  const order = `ORDER BY (t.status = 'done'), t.due_date ASC NULLS LAST, t.created_at DESC`;
  try {
    const rows = teamWide
      ? await sql`
          SELECT t.*, u.name AS assignee_name, u.avatar AS assignee_avatar,
                 cu.name AS completed_by_name, cu.avatar AS completed_by_avatar
          FROM tasks t
          LEFT JOIN users u ON u.id = t.assigned_to
          LEFT JOIN users cu ON cu.id = t.completed_by
          WHERE t.team_id = ${c.teamId}
             OR t.assigned_to IN (SELECT id FROM users WHERE team_id = ${c.teamId})
             OR t.created_by = ${c.meId}
          ORDER BY (t.status = 'done'), t.due_date ASC NULLS LAST, t.created_at DESC`
      : await sql`
          SELECT t.*, u.name AS assignee_name, u.avatar AS assignee_avatar,
                 cu.name AS completed_by_name, cu.avatar AS completed_by_avatar
          FROM tasks t
          LEFT JOIN users u ON u.id = t.assigned_to
          LEFT JOIN users cu ON cu.id = t.completed_by
          WHERE t.assigned_to = ${c.meId}
             OR (t.assigned_to IS NULL AND t.team_id = ${c.teamId})
          ORDER BY (t.status = 'done'), t.due_date ASC NULLS LAST, t.created_at DESC`;
    return NextResponse.json(rows.map(shape));
  } catch {
    // Pre-migration fallback (no team_id / completed_by columns yet).
    const rows = teamWide
      ? await sql`
          SELECT t.*, u.name AS assignee_name, u.avatar AS assignee_avatar FROM tasks t
          JOIN users u ON u.id = t.assigned_to
          WHERE u.team_id = ${c.teamId} OR t.created_by = ${c.meId}
          ORDER BY t.created_at DESC`
      : await sql`SELECT * FROM tasks WHERE assigned_to = ${c.meId} ORDER BY created_at DESC`;
    return NextResponse.json(rows.map(shape));
  }
}

// POST — create a task. assignedTo omitted/null ⇒ a day task anyone can do
// (employer only). A recurrence generates the upcoming occurrences up front.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Chybí název úkolu' }, { status: 400 });

  // Resolve the assignee: a real id, or null for a team/day task.
  const rawAssignee = b.assignedTo;
  let assignedTo: number | null;
  if (rawAssignee === null || rawAssignee === undefined || rawAssignee === '' || rawAssignee === 0) {
    if (c.role !== 'employer') return NextResponse.json({ error: 'Úkol pro kohokoliv může zadat jen vedení.' }, { status: 403 });
    assignedTo = null; // team/day task
  } else {
    assignedTo = parseInt(rawAssignee);
    if (!Number.isFinite(assignedTo)) return NextResponse.json({ error: 'Neplatný zaměstnanec' }, { status: 400 });
    if (assignedTo !== c.meId) {
      if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
      const [target] = await sql`SELECT team_id FROM users WHERE id = ${assignedTo}`;
      if (!target || target.team_id !== c.teamId) {
        return NextResponse.json({ error: 'Uživatel není ve vašem týmu' }, { status: 400 });
      }
    }
  }

  const recurrence = RECURRENCES.includes(b.recurrence) ? b.recurrence : null;
  const checklist = Array.isArray(b.checklist)
    ? b.checklist.map((i: any) => ({ text: String(i?.text ?? '').slice(0, 300), done: false })).filter((i: any) => i.text).slice(0, 50)
    : [];
  const priority = b.priority ?? 'medium';
  const dueDate = b.dueDate || null;

  // Build the list of dates to create: one for a single task, or the first
  // TARGET_UPCOMING occurrences for a recurring one.
  const seriesId = recurrence ? genSeriesId() : null;
  const dates: (string | null)[] = [dueDate ?? todayStr()];
  if (recurrence) {
    let cursor = dates[0] as string;
    while (dates.length < TARGET_UPCOMING) { cursor = nextDueDate(cursor, recurrence); dates.push(cursor); }
  }
  if (!recurrence && !dueDate) dates[0] = null; // a plain task may have no date

  let first: any = null;
  try {
    for (const date of dates) {
      const [row] = await sql`
        INSERT INTO tasks (title, description, assigned_to, created_by, team_id, priority, status, due_date, recurrence, checklist, series_id)
        VALUES (${title}, ${b.description ?? null}, ${assignedTo}, ${c.meId}, ${c.teamId},
                ${priority}, 'pending', ${date}, ${recurrence},
                ${JSON.stringify(checklist)}::jsonb, ${seriesId})
        RETURNING *`;
      if (!first) first = row;
    }
  } catch {
    // Pre-migration fallback — a single core row (needs a non-null assignee).
    const [row] = await sql`
      INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, due_date)
      VALUES (${title}, ${b.description ?? null}, ${assignedTo ?? c.meId}, ${c.meId}, ${priority}, 'pending', ${dueDate})
      RETURNING *`;
    first = row;
  }

  // Notify the assignee (specific person) when it isn't self-assigned.
  if (assignedTo && assignedTo !== c.meId) {
    try {
      await notifyUser(assignedTo, { title: 'Nový úkol', body: title, type: priority === 'high' ? 'warning' : 'info' });
    } catch { /* best-effort */ }
  }

  return NextResponse.json(shape(first));
}

// DELETE — remove a task, or the whole recurring series (?series=1).
export async function DELETE(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  let task: any;
  try {
    [task] = await sql`
      SELECT t.created_by, t.series_id, t.team_id, u.team_id AS assignee_team FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to WHERE t.id = ${id}`;
  } catch {
    [task] = await sql`
      SELECT t.created_by, u.team_id AS assignee_team FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to WHERE t.id = ${id}`;
  }
  if (!task) return NextResponse.json({ error: 'Úkol nenalezen' }, { status: 404 });

  const taskTeam = task.team_id ?? task.assignee_team;
  const allowed = task.created_by === c.meId || (c.role === 'employer' && taskTeam === c.teamId);
  if (!allowed) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  // Deleting a recurring occurrence cancels the whole series (stops top-up).
  if (task.series_id && searchParams.get('series') !== '0') {
    await sql`DELETE FROM tasks WHERE series_id = ${task.series_id}`;
  } else {
    await sql`DELETE FROM tasks WHERE id = ${id}`;
  }
  return NextResponse.json({ ok: true });
}

// PATCH — update status or checklist. A day task can be completed by anyone on
// the team; completing no longer respawns — upcoming occurrences already exist.
export async function PATCH(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [task] = await sql`
    SELECT t.*, u.team_id AS assignee_team FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.id = ${id}`;
  if (!task) return NextResponse.json({ error: 'Úkol nenalezen' }, { status: 404 });

  const taskTeam = task.team_id ?? task.assignee_team;
  const allowed = task.assigned_to === c.meId || task.created_by === c.meId
    || ((c.role === 'employer' || c.role === 'kiosk') && taskTeam === c.teamId)
    || (task.assigned_to == null && taskTeam === c.teamId); // day task — anyone on the team
  if (!allowed) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  // Edit task fields — creator or a team employer only. For a recurring series
  // the shared fields (title/desc/priority) apply to every occurrence.
  if (b.edit) {
    const canEdit = task.created_by === c.meId || (c.role === 'employer' && taskTeam === c.teamId);
    if (!canEdit) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
    const title = b.title !== undefined ? String(b.title).trim() || task.title : task.title;
    const description = b.description !== undefined ? (b.description || null) : task.description;
    const priority = b.priority !== undefined ? b.priority : task.priority;
    if (task.series_id) {
      await sql`UPDATE tasks SET title = ${title}, description = ${description}, priority = ${priority} WHERE series_id = ${task.series_id}`;
    } else {
      let assignedTo = task.assigned_to;
      if (b.assignedTo !== undefined) {
        if (b.assignedTo === null || b.assignedTo === '' || b.assignedTo === 0) assignedTo = null;
        else {
          const a = parseInt(b.assignedTo);
          if (Number.isFinite(a)) {
            const [t] = await sql`SELECT team_id FROM users WHERE id = ${a}`;
            if (t && t.team_id === c.teamId) assignedTo = a;
          }
        }
      }
      const dueDate = b.dueDate !== undefined ? (b.dueDate || null) : task.due_date;
      await sql`UPDATE tasks SET title = ${title}, description = ${description}, priority = ${priority}, assigned_to = ${assignedTo}, due_date = ${dueDate} WHERE id = ${id}`;
    }
    const [row] = await sql`
      SELECT t.*, u.name AS assignee_name, u.avatar AS assignee_avatar,
             cu.name AS completed_by_name, cu.avatar AS completed_by_avatar
      FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN users cu ON cu.id = t.completed_by
      WHERE t.id = ${id}`;
    return NextResponse.json(shape(row));
  }

  // Checklist edit (tick items) — independent of status.
  if (Array.isArray(b.checklist)) {
    const cl = b.checklist
      .map((i: any) => ({ text: String(i?.text ?? '').slice(0, 300), done: !!i?.done }))
      .filter((i: any) => i.text).slice(0, 50);
    try {
      const [row] = await sql`
        UPDATE tasks SET checklist = ${JSON.stringify(cl)}::jsonb WHERE id = ${id}
        RETURNING *, (SELECT name FROM users WHERE id = tasks.completed_by) AS completed_by_name`;
      return NextResponse.json(shape(row));
    } catch {
      return NextResponse.json(shape(task));
    }
  }

  if (b.status === undefined) return NextResponse.json(shape(task));

  // Record who completed it (cleared when re-opened). Falls back if the column
  // isn't there yet.
  let row: any;
  try {
    [row] = await sql`
      UPDATE tasks SET status = ${b.status}, completed_by = ${b.status === 'done' ? c.meId : null}
      WHERE id = ${id} RETURNING *`;
  } catch {
    [row] = await sql`UPDATE tasks SET status = ${b.status} WHERE id = ${id} RETURNING *`;
  }
  return NextResponse.json(shape(row));
}
