import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { pragueToday } from '@/lib/pragueTime';
import { STALE_AFTER_MS, autoCloseEntry, pragueMoment } from '@/lib/staleShifts';
import { notifyUser } from '@/lib/push';

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
    const today = pragueToday();
    const rosterQuery = (withRate: boolean) => sql`
      SELECT u.id, u.name, u.avatar,
             CASE WHEN ${withRate} THEN COALESCE(u.hourly_rate, 0) ELSE NULL END AS "hourlyRate",
             (u.pin IS NOT NULL AND u.pin <> '') AS "hasPin",
             te.clock_in AS "openSince",
             te.id AS "openEntryId", te.nudged_at AS "nudgedAt",
             sh.start_time AS "shiftStart", sh.end_time AS "shiftEnd"
      FROM users u
      LEFT JOIN LATERAL (
        SELECT id, clock_in, nudged_at FROM time_entries
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

    // Inline watchdog: the shop kiosk polls this endpoint all day, so every
    // roster load doubles as the hourly check that Vercel's daily-cron limit
    // won't give us. The daily cron stays as a backstop for quiet teams.
    try {
      const nowMs = Date.now();
      for (const r of roster as any[]) {
        if (!r.openSince || !r.openEntryId) continue;
        const inMs = new Date(r.openSince).getTime();
        if (nowMs - inMs > STALE_AFTER_MS) {
          await autoCloseEntry({ id: r.openEntryId, employee_id: Number(r.id), team_id: c.teamId, clock_in: r.openSince });
          r.openSince = null; r.openEntryId = null;
        } else if (!r.nudgedAt && r.shiftEnd) {
          const planned = pragueMoment(today, String(r.shiftEnd));
          if (planned && planned.getTime() > inMs && nowMs - planned.getTime() > 30 * 60 * 1000) {
            await notifyUser(Number(r.id), {
              title: '🕐 Pořád jsi na směně?',
              body: 'Směna ti už skončila a pořád jsi odpíchnutý/á. Jestli už jsi doma, odpíchni si odchod — jinak se směna po čase uzavře sama.',
              type: 'warning',
              category: 'shift',
              link: '/employee/shifts',
            });
            try { await sql`UPDATE time_entries SET nudged_at = NOW() WHERE id = ${r.openEntryId}`; } catch { /* not migrated */ }
          }
        }
      }
    } catch { /* watchdog is best-effort */ }

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
    SELECT id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut", source, note
    FROM time_entries
    WHERE employee_id = ${c.meId} AND clock_in >= NOW() - INTERVAL '60 days'
    ORDER BY clock_in DESC`;
  // Their own open entry rides along so the clock widget works for them too.
  let openSince: string | null = null;
  try {
    const [openRow] = await sql`
      SELECT clock_in FROM time_entries
      WHERE employee_id = ${c.meId} AND clock_out IS NULL
      ORDER BY clock_in DESC LIMIT 1`;
    openSince = openRow?.clock_in ?? null;
  } catch { /* ignore */ }
  return NextResponse.json({ roster: [{ id: c.meId, openSince }], entries });
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

  // Manual complete entry: the employer backfills a forgotten punch for a
  // member of their own team ({ employeeId, clockIn, clockOut } as ISO).
  if (c.role === 'employer' && b.clockIn && b.clockOut) {
    const [emp0] = await sql`SELECT id, team_id FROM users WHERE id = ${employeeId}`;
    if (!emp0 || emp0.team_id !== c.teamId) {
      return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu' }, { status: 400 });
    }
    const ci = new Date(b.clockIn), co = new Date(b.clockOut);
    if (isNaN(+ci) || isNaN(+co) || co <= ci) {
      return NextResponse.json({ error: 'Odchod musí být po příchodu.' }, { status: 400 });
    }
    if (+co - +ci > 24 * 3600 * 1000) {
      return NextResponse.json({ error: 'Záznam je delší než 24 hodin — zkontroluj časy.' }, { status: 400 });
    }
    const [entry] = await sql`
      INSERT INTO time_entries (team_id, employee_id, clock_in, clock_out, source)
      VALUES (${c.teamId}, ${employeeId}, ${ci.toISOString()}, ${co.toISOString()}, 'manual')
      RETURNING id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut"`;
    return NextResponse.json({ ok: true, entry });
  }

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

  const today = pragueToday();

  if (action === 'in') {
    let autoClosedPrevious = false;
    if (open) {
      // A forgotten clock-out from a previous day must not block today's
      // arrival — close the stale entry at a sensible time and carry on.
      const openMs = Date.now() - new Date(open.clock_in).getTime();
      if (openMs > STALE_AFTER_MS) {
        const { autoCloseEntry } = await import('@/lib/staleShifts');
        try {
          await autoCloseEntry({ id: open.id, employee_id: employeeId, team_id: c.teamId, clock_in: open.clock_in });
          autoClosedPrevious = true;
        } catch { /* fall through to the 409 below */ }
      }
      if (!autoClosedPrevious) {
        return NextResponse.json({ error: 'Příchod už je zaznamenaný.' }, { status: 409 });
      }
    }
    const [row] = await sql`
      INSERT INTO time_entries (team_id, employee_id, source)
      VALUES (${c.teamId}, ${employeeId}, ${isKiosk ? 'kiosk' : 'self'})
      RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
    // No planned shift for today? Create one from the clock-in so the closing counts it.
    const now = hhmmPrague();
    await ensureShift(c.teamId, employeeId, today, now, now);

    // Late check: a planned start more than 10 minutes ago means the shift
    // started without them — tell the employer while it still matters.
    try {
      const [planned] = await sql`
        SELECT start_time FROM shifts
        WHERE employee_id = ${employeeId} AND date = ${today} AND start_time IS NOT NULL
        ORDER BY start_time ASC LIMIT 1`;
      if (planned?.start_time) {
        const [ph, pm] = String(planned.start_time).split(':').map(Number);
        const [nh, nm] = now.split(':').map(Number);
        const lateMin = (nh * 60 + nm) - (ph * 60 + pm);
        if (lateMin > 10 && lateMin < 12 * 60) {
          const [emp2] = await sql`SELECT name FROM users WHERE id = ${employeeId}`;
          const employers = await sql`
            SELECT id FROM users WHERE team_id = ${c.teamId} AND role = 'employer' AND id <> ${employeeId}`;
          const { notifyUsers } = await import('@/lib/push');
          await notifyUsers((employers as any[]).map(e => e.id), {
            title: '⏰ Pozdní příchod',
            body: `${emp2?.name ?? 'Zaměstnanec'} se odpíchl/a v ${now} — směna začínala v ${String(planned.start_time).slice(0, 5)} (+${lateMin} min).`,
            type: 'warning',
            category: 'shift',
            link: '/employer/overview?view=attendance',
          });
        }
      }
    } catch { /* late check is best-effort */ }

    return NextResponse.json({ ok: true, action: 'in', entry: row, autoClosedPrevious });
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
    const today = pragueToday();
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
    RETURNING id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut"`;

  // The person whose hours changed deserves to know — hours are wages.
  const changed = inTs.getTime() !== new Date(entry.clock_in).getTime()
    || (outTs?.getTime() ?? null) !== (entry.clock_out ? new Date(entry.clock_out).getTime() : null);
  if (changed && row && Number(row.employeeId) !== c.meId) {
    const fmt = (d: Date | null) => d
      ? d.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '…';
    try {
      await notifyUser(Number(row.employeeId), {
        title: '🕐 Upravená docházka',
        body: `Vedení upravilo tvůj záznam: ${fmt(inTs)} – ${fmt(outTs)}.`,
        type: 'info',
        category: 'shift',
        link: '/employee/shifts',
      });
    } catch { /* best-effort */ }
  }
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
