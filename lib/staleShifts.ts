// Forgotten clock-outs. A shift left running for many hours is (almost) never
// real work — someone walked out without punching. These helpers close such
// entries at a sensible time and tell both sides, so the employer only has to
// fine-tune the odd case instead of hunting for them.

import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';

const sql = neon(process.env.DATABASE_URL!);

/** After how long an open entry counts as a forgotten clock-out. */
export const STALE_AFTER_MS = 12 * 3600 * 1000;

/** "YYYY-MM-DD" of a moment in Europe/Prague. */
export function pragueDateOf(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
}

/** Current Prague UTC offset as "+01:00" / "+02:00" (DST-aware). */
function pragueOffset(at: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Prague', timeZoneName: 'longOffset',
  }).formatToParts(at);
  const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  const off = tz.replace('GMT', '');
  return /^[+-]\d{2}:\d{2}$/.test(off) ? off : '+01:00';
}

/** A Prague wall-clock "HH:MM" on a given day as an absolute Date. */
export function pragueMoment(dateStr: string, hhmm: string): Date | null {
  const t = String(hhmm).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const guess = new Date(`${dateStr}T${t}:00+01:00`);
  const d = new Date(`${dateStr}T${t}:00${pragueOffset(guess)}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The planned end of the person's shift on the day the entry started. */
export async function plannedEndFor(employeeId: number, clockIn: Date): Promise<Date | null> {
  const day = pragueDateOf(clockIn);
  try {
    const [sh] = await sql`
      SELECT end_time FROM shifts
      WHERE employee_id = ${employeeId} AND date = ${day}
        AND end_time IS NOT NULL AND end_time <> ''
      ORDER BY end_time DESC LIMIT 1`;
    if (!sh?.end_time) return null;
    return pragueMoment(day, String(sh.end_time));
  } catch { return null; }
}

/**
 * Close one forgotten entry: at the planned shift end when it makes sense
 * (after clock-in, already in the past), otherwise 12 h after clock-in.
 * Marks the row so the employer knows the time is an estimate to check.
 */
export async function autoCloseEntry(entry: { id: number; employee_id: number; team_id: number | null; clock_in: string | Date }, opts?: { notify?: boolean }) {
  const inTs = new Date(entry.clock_in);
  const now = new Date();
  const planned = await plannedEndFor(entry.employee_id, inTs);
  const fallback = new Date(inTs.getTime() + STALE_AFTER_MS);
  const closeAt = planned && planned.getTime() > inTs.getTime() && planned.getTime() < now.getTime()
    ? planned
    : (fallback.getTime() < now.getTime() ? fallback : now);

  const [row] = await sql`
    UPDATE time_entries
    SET clock_out = ${closeAt.toISOString()},
        note = ${planned ? 'Zavřeno automaticky podle konce směny — zkontroluj čas.' : 'Zavřeno automaticky (zapomenutý odchod) — zkontroluj čas.'}
    WHERE id = ${entry.id} AND clock_out IS NULL
    RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
  if (!row) return null; // someone closed it meanwhile

  if (opts?.notify !== false && entry.team_id) {
    const hhmm = closeAt.toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' });
    try {
      const [emp] = await sql`SELECT name FROM users WHERE id = ${entry.employee_id}`;
      const employers = await sql`
        SELECT id FROM users WHERE team_id = ${entry.team_id} AND role = 'employer' AND id <> ${entry.employee_id}`;
      await notifyUsers((employers as any[]).map(e => e.id), {
        title: '⏱️ Směna uzavřena automaticky',
        body: `${emp?.name ?? 'Zaměstnanec'} se zapomněl/a odpíchnout — směna uzavřena v ${hhmm}. Zkontroluj čas v docházce.`,
        type: 'warning',
        category: 'shift',
        link: '/employer/overview?view=attendance',
      });
      await notifyUser(entry.employee_id, {
        title: '⏱️ Zapomenutý odchod',
        body: `Zapomněl/a jsi se odpíchnout — směnu jsme uzavřeli v ${hhmm}. Kdyby čas neseděl, řekni vedení.`,
        type: 'warning',
        category: 'shift',
        link: '/employee/shifts',
      });
    } catch { /* best-effort */ }
  }
  return row;
}
