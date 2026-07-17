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
});

// GET — employee: own tasks; employer: every task in the team.
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const rows = c.role === 'employer' && c.teamId
    ? await sql`
        SELECT t.* FROM tasks t
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

  const [row] = await sql`
    INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, due_date)
    VALUES (${title}, ${b.description ?? null}, ${assignedTo}, ${c.meId},
            ${b.priority ?? 'medium'}, ${b.status ?? 'pending'}, ${b.dueDate ?? null})
    RETURNING *`;

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
    || (c.role === 'employer' && task.assignee_team === c.teamId);
  if (!allowed) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const [row] = await sql`UPDATE tasks SET status = ${b.status} WHERE id = ${id} RETURNING *`;
  return NextResponse.json(shape(row));
}
