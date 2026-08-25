import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function context() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | undefined };
}

// weekday 0=Mon..6=Sun from a YYYY-MM-DD date
function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}
// categorize a shift by its start time → matches 'morning'|'afternoon' preferences
function categoryOf(startTime: string) {
  return startTime < '12:00' ? 'morning' : 'afternoon';
}
// A shift type's concrete times for a given day, following opening hours when
// the type is set to start at open / end at close.
function resolveTimes(st: any, oh: { open: string; close: string }) {
  return {
    start: st.starts_at_open && oh.open ? oh.open : st.start_time,
    end: st.ends_at_close && oh.close ? oh.close : st.end_time,
  };
}
// does a shift [start,end] fit inside opening [open,close]?
function fitsWithin(start: string, end: string, open: string, close: string) {
  // overnight shift (end <= start): only require start within open window
  if (end <= start) return start >= open;
  return start >= open && end <= close;
}
function prevDay(date: string) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function defaultsOpening() {
  const oh: Record<string, { open: string; close: string; closed: boolean }> = {};
  for (let d = 0; d <= 6; d++) oh[String(d)] = { open: '08:00', close: '20:00', closed: false };
  return oh;
}

interface Emp {
  id: number;
  name: string;
  avatar: string;
  unavailable: Set<string>;
  dayPrefs: Record<string, string>;
  preferredShift: string | null;
  maxShifts: number | null;
  /** How many days in a row this person may work (null = no limit). */
  maxConsecutive: number | null;
  assigned: number;
  /** Every date already taken by this person — seeds the streak check. */
  workedDates: Set<string>;
}

export async function POST(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const body = await req.json();
  const month: string = body.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
  }

  // ---- Commit path: employer confirmed a preview → bulk insert ----
  if (body.commit) {
    const list: any[] = Array.isArray(body.shifts) ? body.shifts : [];
    if (list.length === 0) return NextResponse.json({ inserted: 0 });
    // replaceMonth: wipe the month only here, right before inserting — the old
    // client-side "DELETE, then hope the commit succeeds" lost the whole month
    // whenever the second request failed.
    if (body.replaceMonth === true && /^\d{4}-\d{2}$/.test(String(month))) {
      await sql`
        DELETE FROM shifts
        WHERE team_id = ${ctx.teamId} AND date >= ${month + '-01'} AND date <= ${month + '-31'}`;
    }
    let inserted = 0;
    for (const s of list) {
      const employeeId = parseInt(s.employeeId);
      if (!employeeId || !s.date || !s.startTime || !s.endTime) continue;
      const [emp] = await sql`SELECT id FROM users WHERE id = ${employeeId} AND team_id = ${ctx.teamId}`;
      if (!emp) continue;
      await sql`
        INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type)
        VALUES (${ctx.teamId}, ${employeeId}, ${s.date}, ${s.startTime}, ${s.endTime}, ${s.type ?? 'flexible'})`;
      inserted++;
    }
    return NextResponse.json({ inserted, ok: true });
  }

  // ---- Preview path: run the algorithm ----
  // Employees always; employers only when they submitted availability for
  // the month (i.e. they want to be scheduled too).
  const employeeRows = await sql`
    SELECT u.id, u.name, u.avatar FROM users u
    WHERE u.team_id = ${ctx.teamId} AND (
      u.role = 'employee' OR (
        u.role = 'employer' AND EXISTS (
          SELECT 1 FROM availability_requests a
          WHERE a.employee_id = u.id AND a.month = ${month}
        )
      )
    )
    ORDER BY u.name ASC`;
  const availRows = await sql`
    SELECT employee_id, unavailable_dates, day_preferences, preferred_shift, max_shifts
    FROM availability_requests WHERE team_id = ${ctx.teamId} AND month = ${month}`;
  // Approved time off blocks those days regardless of submitted availability.
  let timeOffRows: any[] = [];
  try {
    timeOffRows = await sql`
      SELECT employee_id, from_date, to_date FROM time_off_requests
      WHERE team_id = ${ctx.teamId} AND status = 'approved'
        AND to_date >= ${month + '-01'} AND from_date <= ${month + '-31'}`;
  } catch { /* table not migrated yet */ }
  const timeOffByEmp = new Map<number, Set<string>>();
  for (const t of timeOffRows) {
    const set = timeOffByEmp.get(t.employee_id) ?? new Set<string>();
    const from = new Date(t.from_date + 'T00:00:00');
    const to = new Date(t.to_date + 'T00:00:00');
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      set.add(d.toISOString().split('T')[0]);
    }
    timeOffByEmp.set(t.employee_id, set);
  }
  let shiftTypes: any[];
  try {
    shiftTypes = await sql`
      SELECT id, name, start_time, end_time, color, position, starts_at_open, ends_at_close
      FROM shift_types WHERE team_id = ${ctx.teamId} ORDER BY position ASC, id ASC`;
  } catch {
    shiftTypes = await sql`
      SELECT id, name, start_time, end_time, color, position
      FROM shift_types WHERE team_id = ${ctx.teamId} ORDER BY position ASC, id ASC`;
  }
  const fixedRows = await sql`
    SELECT employee_id, weekday, shift_type_id FROM fixed_assignments WHERE team_id = ${ctx.teamId}`;
  const [team] = await sql`SELECT opening_hours FROM teams WHERE id = ${ctx.teamId}`;

  // ---- Rule: how many days in a row may someone work ----
  let teamMaxConsecutive: number | null = null;
  try {
    const [t] = await sql`SELECT max_consecutive_days FROM teams WHERE id = ${ctx.teamId}`;
    teamMaxConsecutive = t?.max_consecutive_days ?? null;
  } catch { /* not migrated yet — no limit */ }
  const personalMax = new Map<number, number | null>();
  try {
    const rows = await sql`
      SELECT id, max_consecutive_days FROM users WHERE team_id = ${ctx.teamId}`;
    rows.forEach((r: any) => personalMax.set(r.id, r.max_consecutive_days ?? null));
  } catch { /* not migrated yet */ }

  // Shifts already standing just before this month, so a streak that started in
  // the previous month keeps counting instead of resetting on the 1st.
  const carryFrom = (() => {
    const d = new Date(month + '-01T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 20);
    return d.toISOString().slice(0, 10);
  })();
  let priorShifts: any[] = [];
  try {
    priorShifts = await sql`
      SELECT employee_id, date FROM shifts
      WHERE team_id = ${ctx.teamId} AND date >= ${carryFrom} AND date < ${month + '-01'}`;
  } catch { /* ignore */ }
  const priorByEmp = new Map<number, Set<string>>();
  for (const r of priorShifts as any[]) {
    const set = priorByEmp.get(r.employee_id) ?? new Set<string>();
    set.add(String(r.date));
    priorByEmp.set(r.employee_id, set);
  }
  const openingHours =
    team?.opening_hours && Object.keys(team.opening_hours).length > 0 ? team.opening_hours : defaultsOpening();

  const warnings: string[] = [];
  if (shiftTypes.length === 0) {
    return NextResponse.json({
      proposed: [],
      warnings: ['Nejsou nastaveny žádné typy směn. Přidej je v záložce „Typy směn".'],
    });
  }
  if (employeeRows.length === 0) {
    return NextResponse.json({ proposed: [], warnings: ['V týmu nejsou žádní zaměstnanci.'] });
  }

  const availByEmp = new Map<number, any>();
  availRows.forEach((a: any) => availByEmp.set(a.employee_id, a));

  const emps: Emp[] = employeeRows.map((u: any) => {
    const a = availByEmp.get(u.id);
    return {
      id: u.id,
      name: u.name,
      avatar: u.avatar ?? '👤',
      unavailable: new Set<string>([...(a?.unavailable_dates ?? []), ...Array.from(timeOffByEmp.get(u.id) ?? new Set<string>())]),
      dayPrefs: (a?.day_preferences ?? {}) as Record<string, string>,
      preferredShift: a?.preferred_shift ?? null,
      maxShifts: a?.max_shifts ?? null,
      // Personal override wins (0 = explicitly no limit for them); otherwise
      // the team default; null everywhere = no limit at all.
      maxConsecutive: personalMax.get(u.id) === 0
        ? null
        : (personalMax.get(u.id) ?? teamMaxConsecutive ?? null),
      assigned: 0,
      workedDates: new Set<string>(priorByEmp.get(u.id) ?? []),
    };
  });
  const empById = new Map<number, Emp>(emps.map((e) => [e.id, e]));

  // fixed assignments indexed by weekday
  const fixedByWeekday = new Map<number, { employeeId: number; shiftTypeId: number | null }[]>();
  fixedRows.forEach((f: any) => {
    const arr = fixedByWeekday.get(f.weekday) ?? [];
    arr.push({ employeeId: f.employee_id, shiftTypeId: f.shift_type_id });
    fixedByWeekday.set(f.weekday, arr);
  });

  function isAvailable(emp: Emp, date: string) {
    if (emp.unavailable.has(date)) return false;
    if (emp.dayPrefs[date] === 'off') return false;
    return true;
  }
  function hasCapacity(emp: Emp) {
    return emp.maxShifts == null || emp.assigned < emp.maxShifts;
  }
  /** Days worked in an unbroken run ending the day before `date`. */
  function streakBefore(emp: Emp, date: string) {
    let n = 0;
    let cursor = prevDay(date);
    while (emp.workedDates.has(cursor) && n < 40) {
      n++;
      cursor = prevDay(cursor);
    }
    return n;
  }
  /** Would this shift break "max X days in a row"? */
  function restOk(emp: Emp, date: string) {
    if (emp.maxConsecutive == null) return true;
    if (emp.workedDates.has(date)) return true; // already working today
    return streakBefore(emp, date) < emp.maxConsecutive;
  }
  function take(emp: Emp, date: string) {
    emp.assigned++;
    emp.workedDates.add(date);
  }

  const proposed: any[] = [];
  const monthDays = daysInMonth(month);

  for (let d = 1; d <= monthDays; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const wd = weekdayOf(date);
    const oh = openingHours[String(wd)] ?? { open: '08:00', close: '20:00', closed: false };
    if (oh.closed) continue;

    // shift types that fit within this day's opening hours (times resolved to
    // the day's open/close where the type follows them)
    const fitting = shiftTypes.filter((st: any) => {
      const rt = resolveTimes(st, oh);
      return fitsWithin(rt.start, rt.end, oh.open, oh.close);
    });
    if (fitting.length === 0) continue;

    const assignedToday = new Set<number>(); // employee ids already placed this day
    const slotFilled = new Map<number, number>(); // shiftTypeId → employeeId

    const fixedToday = fixedByWeekday.get(wd) ?? [];

    // Pass 1a: fixed assignments bound to a specific shift type
    for (const fx of fixedToday) {
      if (fx.shiftTypeId == null) continue;
      const st = fitting.find((s: any) => s.id === fx.shiftTypeId);
      if (!st) continue; // that shift type doesn't fit today
      if (slotFilled.has(st.id)) continue;
      const emp = empById.get(fx.employeeId);
      if (!emp || !isAvailable(emp, date) || assignedToday.has(emp.id)) continue;
      if (!restOk(emp, date)) {
        const [, mm, dd] = date.split('-');
        warnings.push(`${parseInt(dd)}.${parseInt(mm)}. — ${emp.name} má pevný den, ale už by šlo o ${emp.maxConsecutive! + 1}. směnu v řadě (limit ${emp.maxConsecutive}). Vynecháno.`);
        continue;
      }
      slotFilled.set(st.id, emp.id);
      assignedToday.add(emp.id);
      take(emp, date);
    }

    // Pass 1b: fixed assignments with no specific shift type → place in first open fitting slot
    for (const fx of fixedToday) {
      if (fx.shiftTypeId != null) continue;
      const emp = empById.get(fx.employeeId);
      if (!emp || !isAvailable(emp, date) || assignedToday.has(emp.id)) continue;
      // prefer a shift matching their day/overall preference
      const wantPref = emp.dayPrefs[date] && emp.dayPrefs[date] !== 'flexible' ? emp.dayPrefs[date] : emp.preferredShift;
      const openSlots = fitting.filter((s: any) => !slotFilled.has(s.id));
      if (openSlots.length === 0) continue;
      if (!restOk(emp, date)) {
        const [, mm, dd] = date.split('-');
        warnings.push(`${parseInt(dd)}.${parseInt(mm)}. — ${emp.name} má pevný den, ale už by šlo o ${emp.maxConsecutive! + 1}. směnu v řadě (limit ${emp.maxConsecutive}). Vynecháno.`);
        continue;
      }
      const match = openSlots.find((s: any) => categoryOf(s.start_time) === wantPref) ?? openSlots[0];
      slotFilled.set(match.id, emp.id);
      assignedToday.add(emp.id);
      take(emp, date);
    }

    // Pass 2: fill remaining slots with best candidate
    for (const st of fitting) {
      if (slotFilled.has(st.id)) continue;
      const cat = categoryOf(st.start_time);
      const candidates = emps.filter(
        (e) => isAvailable(e, date) && !assignedToday.has(e.id) && hasCapacity(e) && restOk(e, date),
      );
      if (candidates.length === 0) continue;

      candidates.sort((a, b) => {
        // 1. exact day preference for this shift category
        const aDay = a.dayPrefs[date] === cat ? 1 : 0;
        const bDay = b.dayPrefs[date] === cat ? 1 : 0;
        if (aDay !== bDay) return bDay - aDay;
        // 2. overall preferred shift matches category
        const aPref = a.preferredShift === cat ? 1 : 0;
        const bPref = b.preferredShift === cat ? 1 : 0;
        if (aPref !== bPref) return bPref - aPref;
        // 3. rest — whoever has worked fewer days in a row goes first, so the
        //    rota spreads out instead of running people to their limit.
        const aStreak = streakBefore(a, date);
        const bStreak = streakBefore(b, date);
        if (aStreak !== bStreak) return aStreak - bStreak;
        // 4. fairness — fewest assigned so far
        if (a.assigned !== b.assigned) return a.assigned - b.assigned;
        // 5. stable by name
        return a.name.localeCompare(b.name);
      });

      const pick = candidates[0];
      slotFilled.set(st.id, pick.id);
      assignedToday.add(pick.id);
      take(pick, date);
    }

    // Build proposed list + warnings for the day
    for (const st of fitting) {
      const empId = slotFilled.get(st.id);
      if (empId == null) {
        const [, mm, dd] = date.split('-');
        const blockedByRest = emps.some(
          (e) => isAvailable(e, date) && !assignedToday.has(e.id) && hasCapacity(e) && !restOk(e, date),
        );
        warnings.push(
          `${parseInt(dd)}.${parseInt(mm)}. — nepokrytá směna „${st.name}" (${blockedByRest ? 'volní lidé už mají limit dní v řadě' : 'nikdo dostupný'}).`,
        );
        continue;
      }
      const emp = empById.get(empId)!;
      const rt = resolveTimes(st, oh);
      proposed.push({
        employeeId: emp.id,
        employeeName: emp.name,
        employeeAvatar: emp.avatar,
        date,
        startTime: rt.start,
        endTime: rt.end,
        type: st.name, // store the configured type name so the calendar shows it
        shiftTypeId: st.id,
        shiftTypeName: st.name,
        color: st.color,
      });
    }
  }

  return NextResponse.json({ proposed, warnings });
}
