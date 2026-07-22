import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Current wall-clock time in Prague as "HH:MM".
function hhmmPrague(d = new Date()): string {
  return d.toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' });
}

// Ensure the employee has a shift for `date`; create an auto one if not, so the
// closing counts it. Returns silently on any error (e.g. column not migrated).
async function ensureShift(teamId: number, employeeId: number, date: string, start: string, end: string) {
  try {
    const [sh] = await sql`SELECT id FROM shifts WHERE employee_id = ${employeeId} AND date = ${date} LIMIT 1`;
    if (sh) return;
    try {
      await sql`INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type, auto_created)
                VALUES (${teamId}, ${employeeId}, ${date}, ${start}, ${end}, 'auto', TRUE)`;
    } catch {
      await sql`INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type)
                VALUES (${teamId}, ${employeeId}, ${date}, ${start}, ${end}, 'auto')`;
    }
  } catch { /* best-effort */ }
}

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
    const rosterQuery = (withRate: boolean) => sql`
      SELECT u.id, u.name, u.avatar,
             CASE WHEN ${withRate} THEN COALESCE(u.hourly_rate, 0) ELSE NULL END AS "hourlyRate",
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
    let roster: any[];
    try {
      roster = await rosterQuery(c.role === 'employer');
    } catch {
      // hourly_rate not migrated yet — retry without touching the column
      roster = await sql`
        SELECT u.id, u.name, u.avatar, NULL AS "hourlyRate",
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
    }

    let entries: any[] = [];
    if (c.role === 'employer') {
      const { searchParams } = new URL(req.url);
      const days = Math.min(180, Math.max(1, parseInt(searchParams.get('days') ?? '30')));
      entries = await sql`
        SELECT te.id, te.employee_id AS "employeeId", u.name AS "employeeName", u.avatar AS "employeeAvatar",
               te.clock_in AS "clockIn", te.clock_out AS "clockOut", te.source, te.note
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

  const today = new Date().toISOString().split('T')[0];

  if (action === 'in') {
    if (open) return NextResponse.json({ error: 'Příchod už je zaznamenaný.' }, { status: 409 });
    const [row] = await sql`
      INSERT INTO time_entries (team_id, employee_id, source)
      VALUES (${c.teamId}, ${employeeId}, ${isKiosk ? 'kiosk' : 'self'})
      RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
    // No planned shift for today? Create one from the clock-in so the closing counts it.
    const now = hhmmPrague();
    await ensureShift(c.teamId, employeeId, today, now, now);
    return NextResponse.json({ ok: true, action: 'in', entry: row });
  }

  // clock out
  if (!open) return NextResponse.json({ error: 'Žádný otevřený příchod k odpíchnutí.' }, { status: 409 });
  const [row] = await sql`
    UPDATE time_entries SET clock_out = NOW() WHERE id = ${open.id}
    RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
  // Extend the auto-created shift's end to the real clock-out time.
  try { await sql`UPDATE shifts SET end_time = ${hhmmPrague()} WHERE employee_id = ${employeeId} AND date = ${today} AND auto_created = TRUE`; } catch { /* not migrated */ }

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

  const [entry] = await sql`SELECT id, clock_in, clock_out FROM time_entries WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!entry) return NextResponse.json({ error: 'Záznam nenalezen' }, { status: 404 });

  // clockIn optional (edit). clockOut given ⇒ set it; clockOut omitted with no
  // clockIn ⇒ force-close to now (the "Ukončit" button).
  let inTs = new Date(entry.clock_in);
  if (b.clockIn !== undefined) {
    const p = new Date(b.clockIn);
    if (Number.isNaN(p.getTime())) return NextResponse.json({ error: 'Neplatný čas příchodu.' }, { status: 400 });
    inTs = p;
  }
  let outTs: Date | null = entry.clock_out ? new Date(entry.clock_out) : null;
  if (b.clockOut !== undefined) {
    if (b.clockOut === null || b.clockOut === '') outTs = null;
    else {
      const p = new Date(b.clockOut);
      if (Number.isNaN(p.getTime())) return NextResponse.json({ error: 'Neplatný čas odchodu.' }, { status: 400 });
      outTs = p;
    }
  } else if (b.clockIn === undefined) {
    outTs = new Date(); // force-close to now
  }
  if (outTs && outTs.getTime() <= inTs.getTime()) {
    return NextResponse.json({ error: 'Odchod musí být po příchodu.' }, { status: 400 });
  }

  const [row] = await sql`
    UPDATE time_entries SET clock_in = ${inTs.toISOString()}, clock_out = ${outTs ? outTs.toISOString() : null}
    WHERE id = ${id}
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
