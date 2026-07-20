import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Hourly cron: remind anyone whose shift today has ended but who hasn't
// submitted a cash closing yet. Also nudges employers about pending ones.
export async function GET() {
  const now = new Date();
  // Local (Europe/Prague) date + HH:MM for comparing against shift end_time.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const today = `${get('year')}-${get('month')}-${get('day')}`;
  const nowHM = `${get('hour')}:${get('minute')}`;

  let reminded = 0;
  try {
    // Shifts today whose end time has passed and have no closing for that person.
    const due = await sql`
      SELECT s.employee_id AS id, s.end_time, u.name
      FROM shifts s
      JOIN users u ON u.id = s.employee_id
      WHERE s.date = ${today}
        AND s.end_time <= ${nowHM}
        AND NOT EXISTS (
          SELECT 1 FROM cash_closings cc
          WHERE cc.created_by = s.employee_id AND cc.date = ${today}
        )`;
    // De-dupe employees (one nudge even with multiple shifts).
    const seen = new Set<number>();
    for (const r of due) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      try {
        await notifyUser(r.id, {
          title: '📊 Nezapomeň na uzávěrku',
          body: 'Tvoje směna skončila — vyplň prosím uzávěrku kasy.',
          type: 'warning',
        });
        reminded++;
      } catch { /* best-effort */ }
    }
  } catch (e) {
    console.error('closing remind failed', e);
  }

  return NextResponse.json({ ok: true, reminded });
}
