// Shift requests (day off, swap…).
//
// SECURITY: shift_requests has no team column, so every query has to reach the
// team through `users`. Without that join the endpoint returns other businesses'
// requests — and a POST could be filed under somebody else's name.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { jeClenem } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Vlastní žádosti má každý člen; cizí jsou žádosti o volno týmu
// (volno.zobrazit, podle oponentury kola 67 — ne rozvrh.upravit).
export async function GET(req: NextRequest) {
  const me = await pozaduj(null);
  if (jeOdpoved(me)) return me;

  try {
    const { searchParams } = new URL(req.url);
    const asked = parseInt(searchParams.get('employeeId') ?? '');

    // An employee only ever sees their own requests, whatever they ask for.
    if (!me.role.opravneni.has('volno.zobrazit')) {
      const rows = await sql`
        SELECT * FROM shift_requests WHERE employee_id = ${me.meId} AND team_id = ${me.teamId} ORDER BY created_at DESC`;
      return NextResponse.json(rows);
    }

    // Who may see the team's requests sees their own team, optionally narrowed to one person.
    const rows = Number.isFinite(asked)
      ? await sql`
          SELECT r.* FROM shift_requests r
          WHERE r.team_id = ${me.teamId} AND r.employee_id = ${asked}
          ORDER BY r.created_at DESC`
      : await sql`
          SELECT r.* FROM shift_requests r
          WHERE r.team_id = ${me.teamId}
          ORDER BY r.created_at DESC`;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Žádosti se nepodařilo načíst' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await pozaduj(null);
  if (jeOdpoved(me)) return me;

  try {
    const body = await req.json();
    const requestType = String(body.requestType ?? '').slice(0, 40);
    const date = String(body.date ?? '').slice(0, 20);
    if (!requestType || !date) {
      return NextResponse.json({ error: 'Chybí typ nebo datum' }, { status: 400 });
    }
    const note = body.note ? String(body.note).trim().slice(0, 500) || null : null;

    // The request belongs to the person making it. Kdo upravuje rozvrh, smí ji
    // založit za člena svého podniku; za cizího člověka nikdo.
    let employeeId = me.meId;
    const asked = parseInt(body.employeeId);
    if (Number.isFinite(asked) && asked !== me.meId) {
      if (!me.role.opravneni.has('rozvrh.upravit')) {
        return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
      }
      // Členství, ne zrcadlo (kolo 62): žádost za člena přepnutého jinam musí jít založit.
      if (!(await jeClenem(asked, me.teamId))) return NextResponse.json({ error: 'Zaměstnanec nenalezen' }, { status: 404 });
      employeeId = asked;
    }

    const [row] = await sql`
      INSERT INTO shift_requests (employee_id, request_type, date, note, status, team_id)
      VALUES (${employeeId}, ${requestType}, ${date}, ${note}, 'pending', ${me.teamId})
      RETURNING *`;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Žádost se nepodařilo vytvořit' }, { status: 500 });
  }
}
