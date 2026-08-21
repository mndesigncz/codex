// Hourly watchdog for forgotten clock-outs (cron):
//  1. Shift end passed and the person is still clocked in → one push reminder.
//  2. Entry open longer than 12 h → close it automatically at the planned
//     shift end (or +12 h), flag it for review, tell both sides.
// Protected like the other crons: Vercel sends Authorization: Bearer $CRON_SECRET.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { autoCloseEntry, plannedEndFor, STALE_AFTER_MS } from '@/lib/staleShifts';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  const key = new URL(request.url).searchParams.get('key');
  const secret = process.env.CRON_SECRET;
  const authorized = !secret || auth === `Bearer ${secret}` || key === secret;
  if (!authorized) return NextResponse.json({ error: 'Neautorizováno' }, { status: 401 });

  let open: any[] = [];
  try {
    open = await sql`
      SELECT te.id, te.employee_id, te.team_id, te.clock_in, te.nudged_at, u.name
      FROM time_entries te
      JOIN users u ON u.id = te.employee_id
      WHERE te.clock_out IS NULL
        AND te.clock_in < NOW() - INTERVAL '15 minutes'`;
  } catch (e) {
    console.error('attendance watch query failed', e);
    return NextResponse.json({ ok: false });
  }

  const now = Date.now();
  let nudged = 0, closed = 0;

  for (const e of open) {
    const inTs = new Date(e.clock_in);
    const openMs = now - inTs.getTime();

    // 12+ h → this is not a shift any more; close and flag.
    if (openMs > STALE_AFTER_MS) {
      try {
        const row = await autoCloseEntry(e);
        if (row) closed++;
      } catch { /* next entry */ }
      continue;
    }

    // Reminder: the planned shift end passed >30 min ago, or the entry has
    // been open 10+ h with no plan to compare against. One nudge per entry.
    if (e.nudged_at) continue;
    let due = openMs > 10 * 3600 * 1000;
    if (!due) {
      const planned = await plannedEndFor(e.employee_id, inTs);
      due = !!planned && planned.getTime() > inTs.getTime()
        && now - planned.getTime() > 30 * 60 * 1000;
    }
    if (!due) continue;
    try {
      await notifyUser(e.employee_id, {
        title: '🕐 Pořád jsi na směně?',
        body: 'Směna ti už skončila a pořád jsi odpíchnutý/á. Jestli už jsi doma, odpíchni si odchod — jinak se směna po čase uzavře sama.',
        type: 'warning',
        category: 'shift',
        link: '/employee/shifts',
      });
      try { await sql`UPDATE time_entries SET nudged_at = NOW() WHERE id = ${e.id}`; } catch { /* not migrated */ }
      nudged++;
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true, watched: open.length, nudged, closed });
}
