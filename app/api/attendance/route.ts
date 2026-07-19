import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

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

// GET — kiosk/employer: today's roster with live status; employer also gets
// recent entries; employee: their own entries.
export async function GET(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ roster: [], entries: [] });

  if (c.role === 'kiosk' || c.role === 'employer') {
    // Roster: every employee + their currently-open entry (if clocked in)
    // + today's planned shift so the kiosk can show plan vs reality.
    const today = new Date().toISOString().split('T')[0];
    const roster = await sql`
      SELECT u.id, u.name, u.avatar,
             (u.pin IS NOT NULL AND u.pin <> '') AS "hasPin",
             te.clock_in AS "openSince",
             sh.start_time AS "shiftStart", sh.end_time AS "shiftEnd"
      FROM users u
      LEFT JOIN LATERAL (
        SELECT clock_in FROM time_entries
        WHERE employee_id = u.id AND clock_out IS NULL
        ORDER BY clock_in DESC LIMIT 1
      ) te ON TRUE
      LEFT JOIN LATERAL (
        SELECT start_time, end_time FROM shifts
        WHERE employee_id = u.id AND date = ${today}
        ORDER BY start_time ASC LIMIT 1
      ) sh ON TRUE
      WHERE u.team_id = ${c.teamId} AND u.role IN ('employee','employer')
      ORDER BY u.role DESC, u.name ASC`;

    let entries: any[] = [];
    if (c.role === 'employer') {
      const { searchParams } = new URL(req.url);
      const days = Math.min(180, Math.max(1, parseInt(searchParams.get('days') ?? '30')));
      entries = await sql`
        SELECT te.id, te.employee_id AS "employeeId", u.name AS "employeeName", u.avatar AS "employeeAvatar",
               te.clock_in AS "clockIn", te.clock_out AS "clockOut", te.source
        FROM time_entries te
        LEFT JOIN users u ON u.id = te.employee_id
        WHERE te.team_id = ${c.teamId}
          AND te.clock_in >= NOW() - (${days} || ' days')::interval
        ORDER BY te.clock_in DESC`;
    }
    return NextResponse.json({ roster, entries });
  }

  // Employee — own entries (last 60 days).
  const entries = await sql`
    SELECT id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut", source
    FROM time_entries
    WHERE employee_id = ${c.meId} AND clock_in >= NOW() - INTERVAL '60 days'
    ORDER BY clock_in DESC`;
  return NextResponse.json({ roster: [], entries });
}

// POST — clock in / out. Caller must be the kiosk or the employee themselves.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const employeeId = parseInt(b.employeeId);
  const action = b.action === 'out' ? 'out' : 'in';
  if (!Number.isFinite(employeeId)) return NextResponse.json({ error: 'Chybí zaměstnanec' }, { status: 400 });

  // Authorization: kiosk (same team) or the employee acting on themselves.
  const isKiosk = c.role === 'kiosk';
  if (!isKiosk && employeeId !== c.meId) {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }
  const [emp] = await sql`SELECT id, team_id, pin FROM users WHERE id = ${employeeId}`;
  if (!emp || emp.team_id !== c.teamId) {
    return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 400 });
  }
  // PIN check for shared-kiosk clock-ins when the employee has one set.
  if (isKiosk && emp.pin) {
    if (String(b.pin ?? '') !== String(emp.pin)) {
      return NextResponse.json({ error: 'Nesprávný PIN' }, { status: 403 });
    }
  }

  const [open] = await sql`
    SELECT id, clock_in FROM time_entries
    WHERE employee_id = ${employeeId} AND clock_out IS NULL
    ORDER BY clock_in DESC LIMIT 1`;

  if (action === 'in') {
    if (open) return NextResponse.json({ error: 'Příchod už je zaznamenaný.' }, { status: 409 });
    const [row] = await sql`
      INSERT INTO time_entries (team_id, employee_id, source)
      VALUES (${c.teamId}, ${employeeId}, ${isKiosk ? 'kiosk' : 'self'})
      RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
    return NextResponse.json({ ok: true, action: 'in', entry: row });
  }

  // clock out
  if (!open) return NextResponse.json({ error: 'Žádný otevřený příchod k odpíchnutí.' }, { status: 409 });
  const [row] = await sql`
    UPDATE time_entries SET clock_out = NOW() WHERE id = ${open.id}
    RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;

  // Nudge: does today's cash closing still need to be filled in?
  let closingDone = true;
  try {
    const today = new Date().toISOString().split('T')[0];
    const [cl] = await sql`SELECT id FROM cash_closings WHERE created_by = ${employeeId} AND date = ${today}`;
    closingDone = !!cl;
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, action: 'out', entry: row, closingDone });
}

// PATCH — employer fixes a forgotten clock-out: { id, clockOut?: ISO } (default now).
export async function PATCH(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [entry] = await sql`SELECT id, clock_in FROM time_entries WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!entry) return NextResponse.json({ error: 'Záznam nenalezen' }, { status: 404 });

  // Custom timestamp must be valid and after clock-in; otherwise use now.
  let out = new Date();
  if (b.clockOut) {
    const parsed = new Date(b.clockOut);
    if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: 'Neplatný čas' }, { status: 400 });
    out = parsed;
  }
  if (out.getTime() <= new Date(entry.clock_in).getTime()) {
    return NextResponse.json({ error: 'Odchod musí být po příchodu.' }, { status: 400 });
  }

  const [row] = await sql`
    UPDATE time_entries SET clock_out = ${out.toISOString()} WHERE id = ${id}
    RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
  return NextResponse.json({ ok: true, entry: row });
}

// DELETE ?id= — employer removes an attendance entry (corrections).
export async function DELETE(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  await sql`DELETE FROM time_entries WHERE id = ${id} AND team_id = ${c.teamId}`;
  return NextResponse.json({ ok: true });
}
