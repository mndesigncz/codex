import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Vlastní žádosti má každý člen; volno týmu (i typ „nemoc", tedy zdravotní
// údaj) jen s volno.zobrazit, rozhodování s volno.schvalovat.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const shape = (r: any) => ({
  id: r.id, employeeId: r.employee_id, fromDate: r.from_date, toDate: r.to_date,
  type: r.type, note: r.note, status: r.status, createdAt: r.created_at,
  employeeName: r.employee_name ?? null, employeeAvatar: r.employee_avatar ?? null,
});

// GET — bez volno.zobrazit vlastní žádosti, s ním celý tým.
export async function GET() {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  // Pole se dál jmenuje isEmployer kvůli klientům (TimeOffApprovals podle něj
  // ukáže panel); znamená „odpověď nese žádosti týmu".
  const isEmployer = c.role.opravneni.has('volno.zobrazit');
  try {
    const rows = isEmployer
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
    return NextResponse.json({ requests: rows.map(shape), isEmployer });
  } catch {
    return NextResponse.json({ requests: [], isEmployer });
  }
}

// POST — vlastní žádost o volno (kdokoli s osobním účtem, ne tablet).
export async function POST(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  if (c.role.typ === 'kiosk') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  let jmeno = 'Kolega';
  try { const [u] = await sql`SELECT name FROM users WHERE id = ${c.meId}`; if (u?.name) jmeno = String(u.name); } catch { /* jen do upozornění */ }

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

  // Kdo volno schvaluje (kolo 67), podle členství (kolo 62): vedoucí
  // přepnutý jinam žádost jinak neuvidí.
  try {
    const employers = (await clenoveSOpravnenim(c.teamId, 'volno.schvalovat')).filter(id => id !== c.meId);
    await notifyUsers(employers, {
      title: 'Žádost o volno',
      body: `${jmeno}: ${from === to ? from : `${from} až ${to}`}`,
      type: 'info',
      category: 'shift',
      link: '/employer/overview?view=shifts',
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, request: shape(row) });
}

// PATCH (volno.schvalovat) — approve / reject: { id, status: 'approved'|'rejected' }.
export async function PATCH(req: NextRequest) {
  const c = await pozaduj('volno.schvalovat');
  if (jeOdpoved(c)) return c;

  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  const status = b.status === 'approved' ? 'approved' : b.status === 'rejected' ? 'rejected' : null;
  const wantsDates = b.fromDate !== undefined || b.toDate !== undefined;
  if (!Number.isFinite(id) || (!status && !wantsDates)) {
    return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });
  }

  const [existing] = await sql`
    SELECT * FROM time_off_requests WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!existing) return NextResponse.json({ error: 'Žádost nenalezena' }, { status: 404 });

  // The employer may fix the dates — a holiday booked a day off by mistake
  // must not force the person to cancel and re-request.
  const fromDate = b.fromDate !== undefined ? String(b.fromDate) : String(existing.from_date);
  const toDate = b.toDate !== undefined ? String(b.toDate) : String(existing.to_date);
  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate) || toDate < fromDate) {
    return NextResponse.json({ error: 'Neplatné rozmezí dat.' }, { status: 400 });
  }
  const nextStatus = status ?? String(existing.status);

  const [row] = await sql`
    UPDATE time_off_requests
    SET status = ${nextStatus}, from_date = ${fromDate}, to_date = ${toDate}, decided_by = ${c.meId}
    WHERE id = ${id} AND team_id = ${c.teamId}
    RETURNING *`;
  if (!row) return NextResponse.json({ error: 'Žádost nenalezena' }, { status: 404 });

  const datesChanged = fromDate !== String(existing.from_date) || toDate !== String(existing.to_date);
  try {
    await notifyUser(row.employee_id, {
      title: status === 'approved' ? 'Volno schváleno ✓'
        : status === 'rejected' ? 'Volno zamítnuto'
        : '🗓️ Upravený termín volna',
      body: `${row.from_date === row.to_date ? row.from_date : `${row.from_date} až ${row.to_date}`}${datesChanged && status ? ' (termín upraven vedením)' : ''}`,
      type: status === 'approved' ? 'info' : 'warning',
      category: 'shift',
      link: '/employee/shifts?view=availability',
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, request: shape(row) });
}

// DELETE ?id= — the author cancels their own pending request; kdo volno
// schvaluje, smí zrušit JAKOUKOLI žádost (i schválenou dovolenou), the person is told.
export async function DELETE(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  if (c.role.opravneni.has('volno.schvalovat')) {
    const [row] = await sql`
      DELETE FROM time_off_requests
      WHERE id = ${id} AND team_id = ${c.teamId}
      RETURNING employee_id, from_date, to_date, status`;
    if (row && row.employee_id !== c.meId) {
      try {
        await notifyUser(row.employee_id, {
          title: '🗓️ Volno zrušeno vedením',
          body: `${row.from_date === row.to_date ? row.from_date : `${row.from_date} až ${row.to_date}`} — kdyby to nesedělo, ozvi se vedení.`,
          type: 'warning', category: 'shift', link: '/employee/shifts?view=availability',
        });
      } catch { /* best-effort */ }
    }
    return NextResponse.json({ ok: true });
  }

  await sql`
    DELETE FROM time_off_requests
    WHERE id = ${id} AND employee_id = ${c.meId} AND status = 'pending'`;
  return NextResponse.json({ ok: true });
}
