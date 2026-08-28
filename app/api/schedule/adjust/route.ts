// "Automaticky upravit": employees sent new availability AFTER the rota was
// saved. Instead of regenerating the whole month, take the standing shifts,
// find the ones that now clash with somebody's requests, and propose the
// smallest fix — hand the shift to a colleague who can take it, or flag it.
// POST { month }                      → preview { changes, warnings }
// POST { month, commit: true, changes } → apply the confirmed changes

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { audit } from '@/lib/audit';
import { prefAllowsSlot, dayPrefLabel, isRestrictingPref, type PrefType } from '@/lib/dayPrefs';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

function categoryOf(startTime: string) {
  return String(startTime).slice(0, 5) < '12:00' ? 'morning' : 'afternoon';
}
function prevDay(date: string) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function shiftHours(start: string, end: string): number {
  const [sh, sm] = String(start).slice(0, 5).split(':').map(Number);
  const [eh, em] = String(end).slice(0, 5).split(':').map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return 8;
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}
const dayNum = (d: string) => `${parseInt(d.split('-')[2])}.${parseInt(d.split('-')[1])}.`;

async function ctx() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | undefined };
}

export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const month: string = String(body.month ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });

  // ---- Commit: apply the confirmed changes. ----
  if (body.commit === true) {
    const changes: any[] = Array.isArray(body.changes) ? body.changes.slice(0, 200) : [];
    let applied = 0;
    for (const ch of changes) {
      const shiftId = parseInt(ch?.shiftId);
      if (!Number.isFinite(shiftId)) continue;
      const [sh] = await sql`
        SELECT s.id, s.employee_id, s.date, s.start_time, s.end_time FROM shifts s
        JOIN users u ON u.id = s.employee_id
        WHERE s.id = ${shiftId} AND (s.team_id = ${c.teamId} OR u.team_id = ${c.teamId})`;
      if (!sh) continue;
      if (ch.action === 'remove') {
        await sql`DELETE FROM shifts WHERE id = ${shiftId}`;
        applied++;
        try {
          await notifyUser(sh.employee_id, {
            title: '🗓️ Změna rozvrhu',
            body: `Směna ${dayNum(sh.date)} (${String(sh.start_time).slice(0, 5)}–${String(sh.end_time).slice(0, 5)}) byla zrušena podle tvých nových požadavků.`,
            type: 'shift', category: 'shift', link: '/employee/shifts',
          });
        } catch { /* best-effort */ }
      } else if (ch.action === 'reassign') {
        const toId = parseInt(ch?.toEmployeeId);
        if (!Number.isFinite(toId)) continue;
        const [emp] = await sql`SELECT id, name FROM users WHERE id = ${toId} AND team_id = ${c.teamId}`;
        if (!emp) continue;
        await sql`UPDATE shifts SET employee_id = ${toId} WHERE id = ${shiftId}`;
        applied++;
        try {
          await notifyUser(sh.employee_id, {
            title: '🗓️ Změna rozvrhu',
            body: `Směnu ${dayNum(sh.date)} (${String(sh.start_time).slice(0, 5)}–${String(sh.end_time).slice(0, 5)}) za tebe podle tvých nových požadavků převzal/a ${emp.name}.`,
            type: 'shift', category: 'shift', link: '/employee/shifts',
          });
          await notifyUser(toId, {
            title: '🗓️ Nová směna',
            body: `Dostal/a jsi směnu ${dayNum(sh.date)} ${String(sh.start_time).slice(0, 5)}–${String(sh.end_time).slice(0, 5)} (úprava rozvrhu podle nových požadavků).`,
            type: 'shift', category: 'shift', link: '/employee/shifts',
          });
        } catch { /* best-effort */ }
      }
    }
    audit(c.teamId, c.meId, 'schedule.adjust', 'schedule', null, `${applied} změn (${month})`);
    return NextResponse.json({ ok: true, applied });
  }

  // ---- Preview: find clashes and propose fixes. ----
  const employees = await sql`
    SELECT id, name, avatar FROM users
    WHERE team_id = ${c.teamId} AND role IN ('employee', 'employer') ORDER BY name ASC`;
  const shifts = await sql`
    SELECT s.id, s.employee_id, s.date, s.start_time, s.end_time, s.type
    FROM shifts s JOIN users u ON u.id = s.employee_id
    WHERE (s.team_id = ${c.teamId} OR u.team_id = ${c.teamId})
      AND s.date >= ${month + '-01'} AND s.date <= ${month + '-31'}
    ORDER BY s.date ASC, s.start_time ASC`;
  const avail = await sql`
    SELECT employee_id, unavailable_dates, day_preferences, preferred_shift, max_shifts
    FROM availability_requests WHERE team_id = ${c.teamId} AND month = ${month}`;
  // The morning/afternoon category follows the team's OWN shift types where the
  // shift carries a type name — a noon-straddling "Odpolední" must not flip to
  // morning just because it starts at 11:30.
  let shiftTypes: any[] = [];
  try {
    shiftTypes = await sql`SELECT id, name, start_time FROM shift_types WHERE team_id = ${c.teamId}`;
  } catch { /* ignore */ }
  const prefTypes: PrefType[] = shiftTypes.map((t: any) => ({
    id: Number(t.id), name: String(t.name), start: String(t.start_time).slice(0, 5),
  }));
  const typeIdByName = new Map<string, number>();
  shiftTypes.forEach((t: any) => typeIdByName.set(String(t.name), Number(t.id)));
  const slotOfShift = (sh: any) => ({
    typeId: typeIdByName.get(String(sh.type)) ?? null,
    start: String(sh.start_time).slice(0, 5),
  });
  let timeOffRows: any[] = [];
  try {
    timeOffRows = await sql`
      SELECT employee_id, from_date, to_date FROM time_off_requests
      WHERE team_id = ${c.teamId} AND status = 'approved'
        AND to_date >= ${month + '-01'} AND from_date <= ${month + '-31'}`;
  } catch { /* not migrated */ }

  // Rules (limits) — same semantics as the generator.
  let teamMaxConsecutive: number | null = null, teamMaxHours: number | null = null;
  try {
    const [t] = await sql`SELECT max_consecutive_days, max_month_hours FROM teams WHERE id = ${c.teamId}`;
    teamMaxConsecutive = t?.max_consecutive_days ?? null;
    teamMaxHours = t?.max_month_hours ?? null;
  } catch { /* not migrated */ }
  const personalMax = new Map<number, number | null>();
  const personalHours = new Map<number, number | null>();
  try {
    const rows = await sql`SELECT id, max_consecutive_days, max_month_hours FROM users WHERE team_id = ${c.teamId}`;
    rows.forEach((r: any) => {
      personalMax.set(r.id, r.max_consecutive_days ?? null);
      personalHours.set(r.id, r.max_month_hours ?? null);
    });
  } catch { /* not migrated */ }

  const availByEmp = new Map<number, any>();
  avail.forEach((a: any) => availByEmp.set(a.employee_id, a));
  const timeOffByEmp = new Map<number, Set<string>>();
  for (const t of timeOffRows) {
    const set = timeOffByEmp.get(t.employee_id) ?? new Set<string>();
    const from = new Date(t.from_date + 'T00:00:00');
    const to = new Date(t.to_date + 'T00:00:00');
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) set.add(d.toISOString().split('T')[0]);
    timeOffByEmp.set(t.employee_id, set);
  }

  // Last month's tail seeds the streak check across the month boundary.
  const carryFrom = (() => {
    const d = new Date(month + '-01T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 20);
    return d.toISOString().slice(0, 10);
  })();
  let priorShifts: any[] = [];
  try {
    priorShifts = await sql`
      SELECT employee_id, date FROM shifts
      WHERE team_id = ${c.teamId} AND date >= ${carryFrom} AND date < ${month + '-01'}`;
  } catch { /* ignore */ }

  interface P {
    id: number; name: string; avatar: string;
    unavailable: Set<string>; dayPrefs: Record<string, string>;
    preferredShift: string | null; maxShifts: number | null;
    maxConsecutive: number | null; maxHours: number | null;
    workedDates: Set<string>; monthShifts: number; monthHours: number;
  }
  const people = new Map<number, P>();
  for (const u of employees as any[]) {
    const a = availByEmp.get(u.id);
    people.set(u.id, {
      id: u.id, name: u.name, avatar: u.avatar ?? '👤',
      unavailable: new Set<string>([...(a?.unavailable_dates ?? []), ...Array.from(timeOffByEmp.get(u.id) ?? [])]),
      dayPrefs: (a?.day_preferences ?? {}) as Record<string, string>,
      preferredShift: a?.preferred_shift ?? null,
      maxShifts: a?.max_shifts ?? null,
      maxConsecutive: personalMax.get(u.id) === 0 ? null : (personalMax.get(u.id) ?? teamMaxConsecutive ?? null),
      maxHours: personalHours.get(u.id) === 0 ? null : (personalHours.get(u.id) ?? teamMaxHours ?? null),
      workedDates: new Set<string>(),
      monthShifts: 0, monthHours: 0,
    });
  }
  priorShifts.forEach((r: any) => people.get(r.employee_id)?.workedDates.add(String(r.date)));
  for (const s of shifts as any[]) {
    const p = people.get(s.employee_id);
    if (!p) continue;
    p.workedDates.add(String(s.date));
    p.monthShifts++;
    p.monthHours += shiftHours(s.start_time, s.end_time);
  }

  const dayPrefOk = (p: P, date: string, sh: any) =>
    prefAllowsSlot(p.dayPrefs[date], slotOfShift(sh), prefTypes);
  const available = (p: P, date: string) => !p.unavailable.has(date) && p.dayPrefs[date] !== 'off';
  const streakBefore = (p: P, date: string) => {
    let n = 0, cursor = prevDay(date);
    while (p.workedDates.has(cursor) && n < 40) { n++; cursor = prevDay(cursor); }
    return n;
  };
  const restOk = (p: P, date: string) =>
    p.maxConsecutive == null || p.workedDates.has(date) || streakBefore(p, date) < p.maxConsecutive;
  const hoursOk = (p: P, h: number) => p.maxHours == null || p.monthHours + h <= p.maxHours + 0.01;
  const shiftsOk = (p: P) => p.maxShifts == null || p.monthShifts < p.maxShifts;

  // Why the CURRENT person can no longer hold the shift (null = still fine).
  const clashReason = (p: P, s: any): string | null => {
    const date = String(s.date);
    if (timeOffByEmp.get(p.id)?.has(date)) return 'má na ten den schválené volno (žádost o volno)';
    if (p.unavailable.has(date) || p.dayPrefs[date] === 'off') {
      return 'v dostupnosti má ten den „nemůžu"';
    }
    const pref = p.dayPrefs[date];
    if (isRestrictingPref(pref) && !prefAllowsSlot(pref, slotOfShift(s), prefTypes)) {
      return `v dostupnosti má ten den „${dayPrefLabel(pref, prefTypes)}"`;
    }
    return null;
  };

  const changes: any[] = [];
  const warnings: string[] = [];
  const busy = new Map<string, Set<number>>(); // date → employee ids already on a shift
  for (const s of shifts as any[]) {
    const set = busy.get(String(s.date)) ?? new Set<number>();
    set.add(s.employee_id);
    busy.set(String(s.date), set);
  }

  for (const s of shifts as any[]) {
    const holder = people.get(s.employee_id);
    if (!holder) continue;
    const reason = clashReason(holder, s);
    if (!reason) continue;
    const date = String(s.date);
    const h = shiftHours(s.start_time, s.end_time);
    const cat = categoryOf(s.start_time); // only steers the soft-preference tiebreak

    const candidates = Array.from(people.values()).filter((p) =>
      p.id !== holder.id
      && available(p, date)
      && dayPrefOk(p, date, s)
      && !(busy.get(date)?.has(p.id))
      && restOk(p, date) && hoursOk(p, h) && shiftsOk(p),
    );
    candidates.sort((a, b) => {
      if (a.monthShifts !== b.monthShifts) return a.monthShifts - b.monthShifts; // fairness
      const aPref = a.preferredShift === cat ? 1 : 0, bPref = b.preferredShift === cat ? 1 : 0;
      if (aPref !== bPref) return bPref - aPref;
      const as = streakBefore(a, date), bs = streakBefore(b, date);
      if (as !== bs) return as - bs;
      return a.name.localeCompare(b.name);
    });

    const base = {
      shiftId: s.id, date, startTime: String(s.start_time).slice(0, 5), endTime: String(s.end_time).slice(0, 5),
      fromId: holder.id, fromName: holder.name, fromAvatar: holder.avatar, reason,
    };
    const pick = candidates[0];
    if (pick) {
      changes.push({ ...base, action: 'reassign', toEmployeeId: pick.id, toName: pick.name, toAvatar: pick.avatar });
      // Bookkeeping so the next clash sees the new state.
      busy.get(date)?.delete(holder.id);
      (busy.get(date) ?? busy.set(date, new Set()).get(date)!).add(pick.id);
      holder.workedDates.delete(date); holder.monthShifts--; holder.monthHours -= h;
      pick.workedDates.add(date); pick.monthShifts++; pick.monthHours += h;
    } else {
      changes.push({ ...base, action: 'remove' });
      warnings.push(`${dayNum(date)} — směnu ${base.startTime}–${base.endTime} nemá kdo převzít (${holder.name}: ${reason}). Návrh: zrušit.`);
    }
  }

  return NextResponse.json({ month, checked: shifts.length, changes, warnings });
}
