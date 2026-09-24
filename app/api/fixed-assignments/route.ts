import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { tymyCiselniku, jeClenem } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Pevné dny vidí jen plánovač rozvrhu (dřív je API vydalo komukoli
// z podniku, UI zaměstnance ani tabletu je nikdy neukazovalo — kolo 67).

// GET — team fixed assignments joined with employee name + shift type info
export async function GET() {
  const ctx = await pozaduj('rozvrh.zobrazit');
  if (jeOdpoved(ctx)) return ctx;

  const rows = await sql`
    SELECT f.id, f.employee_id, f.weekday, f.shift_type_id,
           u.name AS employee_name, u.avatar AS employee_avatar,
           st.name AS shift_type_name, st.start_time, st.end_time, st.color
    FROM fixed_assignments f
    JOIN users u ON u.id = f.employee_id
    LEFT JOIN shift_types st ON st.id = f.shift_type_id
    WHERE f.team_id = ${ctx.teamId}
    ORDER BY f.weekday ASC, u.name ASC`;

  const assignments = rows.map((r: any) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    employeeAvatar: r.employee_avatar ?? '👤',
    weekday: r.weekday,
    shiftTypeId: r.shift_type_id,
    shiftTypeName: r.shift_type_name ?? null,
    startTime: r.start_time ?? null,
    endTime: r.end_time ?? null,
    color: r.color ?? null,
  }));
  return NextResponse.json({ assignments });
}

// POST (employer) — { employeeId, weekday, shiftTypeId? }
export async function POST(req: Request) {
  const ctx = await pozaduj('rozvrh.nastaveni');
  if (jeOdpoved(ctx)) return ctx;

  const body = await req.json();
  const employeeId = parseInt(body.employeeId);
  const weekday = parseInt(body.weekday);
  const shiftTypeId =
    body.shiftTypeId === null || body.shiftTypeId === undefined || body.shiftTypeId === ''
      ? null
      : parseInt(body.shiftTypeId);

  if (!employeeId || Number.isNaN(weekday) || weekday < 0 || weekday > 6) {
    return NextResponse.json({ error: 'Neplatná data' }, { status: 400 });
  }

  // Členství, ne zrcadlo (kolo 62); tablet pevný den nedostane.
  if (!(await jeClenem(employeeId, ctx.teamId))) return NextResponse.json({ error: 'Zaměstnanec není v týmu' }, { status: 400 });

  if (shiftTypeId != null) {
    // Pevný den je řádek podniku, ale smí ukázat i na typ ze zdrojového
    // podniku organizace (kolo 60) — proto ANY(tymy), ne holé id.
    const tymy = await tymyCiselniku(ctx.teamId, 'typySmen');
    const [st] = await sql`SELECT id FROM shift_types WHERE id = ${shiftTypeId} AND team_id = ANY(${tymy})`;
    if (!st) return NextResponse.json({ error: 'Typ směny nenalezen' }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO fixed_assignments (team_id, employee_id, weekday, shift_type_id)
    VALUES (${ctx.teamId}, ${employeeId}, ${weekday}, ${shiftTypeId})
    RETURNING id`;
  return NextResponse.json({ id: row.id, ok: true });
}

// PATCH { id, shiftTypeId } — change the shift type of an existing fixed day
// in place (no more delete + recreate).
export async function PATCH(req: Request) {
  const ctx = await pozaduj('rozvrh.nastaveni');
  if (jeOdpoved(ctx)) return ctx;

  const body = await req.json().catch(() => ({}));
  const id = parseInt(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  const shiftTypeId =
    body.shiftTypeId === null || body.shiftTypeId === undefined || body.shiftTypeId === ''
      ? null
      : parseInt(body.shiftTypeId);
  if (shiftTypeId != null) {
    const tymy = await tymyCiselniku(ctx.teamId, 'typySmen');
    const [st] = await sql`SELECT id FROM shift_types WHERE id = ${shiftTypeId} AND team_id = ANY(${tymy})`;
    if (!st) return NextResponse.json({ error: 'Typ směny nenalezen' }, { status: 400 });
  }
  const [row] = await sql`
    UPDATE fixed_assignments SET shift_type_id = ${shiftTypeId}
    WHERE id = ${id} AND team_id = ${ctx.teamId}
    RETURNING id`;
  if (!row) return NextResponse.json({ error: 'Záznam nenalezen' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE ?id= (employer)
export async function DELETE(req: Request) {
  const ctx = await pozaduj('rozvrh.nastaveni');
  if (jeOdpoved(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });

  await sql`DELETE FROM fixed_assignments WHERE id = ${parseInt(id)} AND team_id = ${ctx.teamId}`;
  return NextResponse.json({ ok: true });
}
