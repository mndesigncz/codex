import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id, name FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | null, name: u?.name as string };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const shape = (r: any) => ({
  id: r.id, employeeId: r.employee_id, fromDate: r.from_date, toDate: r.to_date,
  type: r.type, note: r.note, status: r.status, createdAt: r.created_at,
  employeeName: r.employee_name ?? null, employeeAvatar: r.employee_avatar ?? null,
});

// GET — employee: own requests; employer: whole team's.
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ requests: [] });
  try {
    const rows = c.role === 'employer'
      ? await sql`
          SELECT t.*, u.name AS employee_name, u.avatar AS employee_avatar
          FROM time_off_requests t
          LEFT JOIN users u ON u.id = t.employee_id
          WHERE t.team_id = ${c.teamId}
          ORDER BY (t.status = 'pending') DESC, t.from_date DESC
          LIMIT 100`
      : await sql`
          SELECT t.* FROM time_off_requests t
          WHERE t.employee_id = ${c.meId}
          ORDER BY t.from_date DESC LIMIT 50`;
    return NextResponse.json({ requests: rows.map(shape), isEmployer: c.role === 'employer' });
  } catch {
    return NextResponse.json({ requests: [], isEmployer: c.role === 'employer' });
  }
}

// POST — create a request (employee or employer for themselves).
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });
  if (c.role === 'kiosk') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const from = String(b.fromDate ?? '');
  const to = String(b.toDate ?? b.fromDate ?? '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return NextResponse.json({ error: 'Neplatné datum.' }, { status: 400 });
  if (to < from) return NextResponse.json({ error: 'Konec volna je před začátkem.' }, { status: 400 });
  const type = ['vacation', 'sick', 'other'].includes(b.type) ? b.type : 'vacation';

  const [row] = await sql`
    INSERT INTO time_off_requests (team_id, employee_id, from_date, to_date, type, note)
    VALUES (${c.teamId}, ${c.meId}, ${from}, ${to}, ${type}, ${b.note || null})
    RETURNING *`;

  try {
    const employers = await sql`
      SELECT id FROM users WHERE team_id = ${c.teamId} AND role = 'employer' AND id <> ${c.meId}`;
    await notifyUsers(employers.map((e: any) => e.id), {
      title: 'Žádost o volno',
      body: `${c.name}: ${from === to ? from : `${from} až ${to}`}`,
      type: 'info',
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, request: shape(row) });
}

// PATCH (employer) — approve / reject: { id, status: 'approved'|'rejected' }.
export async function PATCH(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  const status = b.status === 'approved' ? 'approved' : b.status === 'rejected' ? 'rejected' : null;
  if (!Number.isFinite(id) || !status) return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });

  const [row] = await sql`
    UPDATE time_off_requests SET status = ${status}, decided_by = ${c.meId}
    WHERE id = ${id} AND team_id = ${c.teamId}
    RETURNING *`;
  if (!row) return NextResponse.json({ error: 'Žádost nenalezena' }, { status: 404 });

  try {
    await notifyUser(row.employee_id, {
      title: status === 'approved' ? 'Volno schváleno ✓' : 'Volno zamítnuto',
      body: `${row.from_date === row.to_date ? row.from_date : `${row.from_date} až ${row.to_date}`}`,
      type: status === 'approved' ? 'info' : 'warning',
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, request: shape(row) });
}

// DELETE ?id= — author cancels their own pending request.
export async function DELETE(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  await sql`
    DELETE FROM time_off_requests
    WHERE id = ${id} AND employee_id = ${c.meId} AND status = 'pending'`;
  return NextResponse.json({ ok: true });
}
