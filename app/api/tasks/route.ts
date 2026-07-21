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
  assignedTo: r.assigned_to, createdBy: r.created_by,
  priority: r.priority, status: r.status, dueDate: r.due_date,
  recurrence: r.recurrence ?? null,
  checklist: Array.isArray(r.checklist) ? r.checklist : [],
  assigneeName: r.assignee_name ?? null, assigneeAvatar: r.assignee_avatar ?? null,
});

const RECURRENCES = ['daily', 'weekdays', 'weekly'];

// Advance a 'YYYY-MM-DD' date to the next occurrence for the given recurrence.
function nextDueDate(due: string | null, recurrence: string): string | null {
  const base = due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(due + 'T00:00:00') : new Date();
  const d = new Date(base);
  if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
  else if (recurrence === 'weekdays') {
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
  } else d.setDate(d.getDate() + 1); // daily
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Strip the `done` flags so a respawned recurring task starts fresh.
function resetChecklist(cl: any): any[] {
  return Array.isArray(cl) ? cl.map((i: any) => ({ text: String(i?.text ?? ''), done: false })).filter(i => i.text) : [];
}

// GET — employee: own tasks; employer: every task in the team.
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  // Employers and the shared kiosk see the whole team's tasks.
  const teamWide = (c.role === 'employer' || c.role === 'kiosk') && c.teamId;
  const rows = teamWide
    ? await sql`
        SELECT t.*, u.name AS assignee_name, u.avatar AS assignee_avatar FROM tasks t
        JOIN users u ON u.id = t.assigned_to
        WHERE u.team_id = ${c.teamId} OR t.created_by = ${c.meId}
        ORDER BY t.created_at DESC`
    : await sql`SELECT * FROM tasks WHERE assigned_to = ${c.meId} ORDER BY created_at DESC`;

  return NextResponse.json(rows.map(shape));
}

// POST — create a task; assignee must be self or (for employers) a team member.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Chybí název úkolu' }, { status: 400 });

  const assignedTo = parseInt(b.assignedTo) || c.meId;
  if (assignedTo !== c.meId) {
    if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
    const [target] = await sql`SELECT team_id FROM users WHERE id = ${assignedTo}`;
    if (!target || target.team_id !== c.teamId) {
      return NextResponse.json({ error: 'Uživatel není ve vašem týmu' }, { status: 400 });
    }
  }

  const recurrence = RECURRENCES.includes(b.recurrence) ? b.recurrence : null;
  const checklist = Array.isArray(b.checklist)
    ? b.checklist.map((i: any) => ({ text: String(i?.text ?? '').slice(0, 300), done: !!i?.done })).filter((i: any) => i.text).slice(0, 50)
    : [];

  let row: any;
  try {
    [row] = await sql`
      INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, due_date, recurrence, checklist)
      VALUES (${title}, ${b.description ?? null}, ${assignedTo}, ${c.meId},
              ${b.priority ?? 'medium'}, ${b.status ?? 'pending'}, ${b.dueDate ?? null},
              ${recurrence}, ${JSON.stringify(checklist)}::jsonb)
      RETURNING *`;
  } catch {
    // recurrence/checklist columns not migrated yet — insert the core row.
    [row] = await sql`
      INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, due_date)
      VALUES (${title}, ${b.description ?? null}, ${assignedTo}, ${c.meId},
              ${b.priority ?? 'medium'}, ${b.status ?? 'pending'}, ${b.dueDate ?? null})
      RETURNING *`;
  }

  // Let the assignee know when someone else assigned them a task.
  if (assignedTo !== c.meId) {
    try {
      await notifyUser(assignedTo, {
        title: 'Nový úkol',
        body: title,
        type: b.priority === 'high' ? 'warning' : 'info',
      });
    } catch { /* best-effort */ }
  }

  return NextResponse.json(shape(row));
}

// DELETE — remove a task (creator or a team employer).
export async function DELETE(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [task] = await sql`
    SELECT t.created_by, u.team_id AS assignee_team FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to WHERE t.id = ${id}`;
  if (!task) return NextResponse.json({ error: 'Úkol nenalezen' }, { status: 404 });

  const allowed = task.created_by === c.meId || (c.role === 'employer' && task.assignee_team === c.teamId);
  if (!allowed) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  await sql`DELETE FROM tasks WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

// PATCH — update status; only the assignee, the creator, or a team employer.
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

  const allowed = task.assigned_to === c.meId || task.created_by === c.meId
    || ((c.role === 'employer' || c.role === 'kiosk') && task.assignee_team === c.teamId);
  if (!allowed) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  // Checklist edit (tick items / replace the list) — independent of status.
  if (Array.isArray(b.checklist)) {
    const cl = b.checklist
      .map((i: any) => ({ text: String(i?.text ?? '').slice(0, 300), done: !!i?.done }))
      .filter((i: any) => i.text).slice(0, 50);
    try {
      const [row] = await sql`UPDATE tasks SET checklist = ${JSON.stringify(cl)}::jsonb WHERE id = ${id} RETURNING *`;
      return NextResponse.json(shape(row));
    } catch {
      return NextResponse.json(shape(task)); // column not migrated yet
    }
  }

  if (b.status === undefined) return NextResponse.json(shape(task));
  const [row] = await sql`UPDATE tasks SET status = ${b.status} WHERE id = ${id} RETURNING *`;

  // Completing a recurring task spawns the next occurrence with a fresh checklist.
  if (b.status === 'done' && task.recurrence && RECURRENCES.includes(task.recurrence)) {
    try {
      const nextDue = nextDueDate(task.due_date, task.recurrence);
      await sql`
        INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, due_date, recurrence, checklist)
        VALUES (${task.title}, ${task.description}, ${task.assigned_to}, ${task.created_by},
                ${task.priority}, 'pending', ${nextDue}, ${task.recurrence},
                ${JSON.stringify(resetChecklist(task.checklist))}::jsonb)`;
    } catch { /* columns missing or insert failed — the done task still stands */ }
  }

  return NextResponse.json(shape(row));
}
