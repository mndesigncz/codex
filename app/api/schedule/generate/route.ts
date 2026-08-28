import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { prefAllowsSlot, dayPrefLabel, type PrefType } from '@/lib/dayPrefs';

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
// Hours a shift spans; 18:00–02:00 crosses midnight and counts as 8.
function shiftHours(start: string, end: string): number {
  const [sh, sm] = String(start).slice(0, 5).split(':').map(Number);
  const [eh, em] = String(end).slice(0, 5).split(':').map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return 8;
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}
function toMin(t: string) {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function toHM(min: number) {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
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
  /** Monthly hour cap (null = no limit) and hours proposed so far. */
  maxHours: number | null;
  assignedHours: number;
  /** Last date this person got a shift — drives the rotation tiebreak. */
  lastAssigned: string;
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
  // Day choices reference the team's shift types; legacy binary values map by
  // rank (earliest type = "ranní"), never by the hard-coded noon boundary.
  const prefTypes: PrefType[] = shiftTypes.map((t: any) => ({
    id: Number(t.id), name: String(t.name), start: String(t.start_time).slice(0, 5),
  }));
  const [team] = await sql`SELECT opening_hours FROM teams WHERE id = ${ctx.teamId}`;

  // ---- Rule: how many days in a row may someone work ----
  let teamMaxConsecutive: number | null = null;
  let teamMaxHours: number | null = null;
  let balanceShifts = true;
  let splitShifts = false;
  try {
    const [t] = await sql`
      SELECT max_consecutive_days, max_month_hours, balance_shifts, allow_split_shifts FROM teams WHERE id = ${ctx.teamId}`;
    teamMaxConsecutive = t?.max_consecutive_days ?? null;
    teamMaxHours = t?.max_month_hours ?? null;
    balanceShifts = t?.balance_shifts !== false; // NULL = fair rotation on
    splitShifts = t?.allow_split_shifts === true;
  } catch {
    try {
      const [t] = await sql`SELECT max_consecutive_days FROM teams WHERE id = ${ctx.teamId}`;
      teamMaxConsecutive = t?.max_consecutive_days ?? null;
    } catch { /* not migrated yet — no limits */ }
  }
  const personalMax = new Map<number, number | null>();
  const personalHours = new Map<number, number | null>();
  try {
    const rows = await sql`
      SELECT id, max_consecutive_days, max_month_hours FROM users WHERE team_id = ${ctx.teamId}`;
    rows.forEach((r: any) => {
      personalMax.set(r.id, r.max_consecutive_days ?? null);
      personalHours.set(r.id, r.max_month_hours ?? null);
    });
  } catch {
    try {
      const rows = await sql`
        SELECT id, max_consecutive_days FROM users WHERE team_id = ${ctx.teamId}`;
      rows.forEach((r: any) => personalMax.set(r.id, r.max_consecutive_days ?? null));
    } catch { /* not migrated yet */ }
  }

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
      // Personal 0 = explicitly unlimited; null = follow the team default.
      maxHours: personalHours.get(u.id) === 0
        ? null
        : (personalHours.get(u.id) ?? teamMaxHours ?? null),
      assignedHours: 0,
      lastAssigned: '',
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
  /**
   * Day preferences are STRICT: "ten den můžu jen odpolední" means the
   * generator may never hand them the opening shift that day. 'flexible'
   * or no entry keeps every slot open; 'off' is handled by isAvailable.
   */
  function dayPrefOk(emp: Emp, date: string, st: any, start: string) {
    return prefAllowsSlot(emp.dayPrefs[date], { typeId: st?.id ?? null, start }, prefTypes);
  }
  function prefText(emp: Emp, date: string) {
    return dayPrefLabel(emp.dayPrefs[date], prefTypes) ?? 'jiný typ směny';
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
  /** Would this shift push the person over their monthly hour cap? */
  function hoursOk(emp: Emp, hours: number) {
    return emp.maxHours == null || emp.assignedHours + hours <= emp.maxHours + 0.01;
  }
  function take(emp: Emp, date: string, hours: number) {
    emp.assigned++;
    emp.workedDates.add(date);
    emp.assignedHours += hours;
    emp.lastAssigned = date;
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
      const stHours = (() => { const rt = resolveTimes(st, oh); return shiftHours(rt.start, rt.end); })();
      if (!dayPrefOk(emp, date, st, resolveTimes(st, oh).start)) {
        const [, mm, dd] = date.split('-');
        warnings.push(`${parseInt(dd)}.${parseInt(mm)}. — ${emp.name} má pevný den, ale na ten den si zadal/a ${prefText(emp, date)}. Vynecháno.`);
        continue;
      }
      if (!restOk(emp, date)) {
        const [, mm, dd] = date.split('-');
        warnings.push(`${parseInt(dd)}.${parseInt(mm)}. — ${emp.name} má pevný den, ale už by šlo o ${emp.maxConsecutive! + 1}. směnu v řadě (limit ${emp.maxConsecutive}). Vynecháno.`);
        continue;
      }
      if (!hoursOk(emp, stHours)) {
        const [, mm, dd] = date.split('-');
        warnings.push(`${parseInt(dd)}.${parseInt(mm)}. — ${emp.name} má pevný den, ale směna by překročila limit ${emp.maxHours} h/měsíc. Vynecháno.`);
        continue;
      }
      slotFilled.set(st.id, emp.id);
      assignedToday.add(emp.id);
      take(emp, date, stHours);
    }

    // Pass 1b: fixed assignments with no specific shift type → place in first open fitting slot
    for (const fx of fixedToday) {
      if (fx.shiftTypeId != null) continue;
      const emp = empById.get(fx.employeeId);
      if (!emp || !isAvailable(emp, date) || assignedToday.has(emp.id)) continue;
      // prefer a shift matching their day/overall preference
      const wantPref = emp.dayPrefs[date] && emp.dayPrefs[date] !== 'flexible' ? emp.dayPrefs[date] : emp.preferredShift;
      const openSlots = fitting.filter((s: any) =>
        !slotFilled.has(s.id) && dayPrefOk(emp, date, s, resolveTimes(s, oh).start));
      if (openSlots.length === 0) continue;
      if (!restOk(emp, date)) {
        const [, mm, dd] = date.split('-');
        warnings.push(`${parseInt(dd)}.${parseInt(mm)}. — ${emp.name} má pevný den, ale už by šlo o ${emp.maxConsecutive! + 1}. směnu v řadě (limit ${emp.maxConsecutive}). Vynecháno.`);
        continue;
      }
      const match = openSlots.find((s: any) =>
        wantPref?.startsWith('type:') ? `type:${s.id}` === wantPref : categoryOf(s.start_time) === wantPref,
      ) ?? openSlots[0];
      const matchHours = (() => { const rt = resolveTimes(match, oh); return shiftHours(rt.start, rt.end); })();
      if (!hoursOk(emp, matchHours)) {
        const [, mm, dd] = date.split('-');
        warnings.push(`${parseInt(dd)}.${parseInt(mm)}. — ${emp.name} má pevný den, ale směna by překročila limit ${emp.maxHours} h/měsíc. Vynecháno.`);
        continue;
      }
      slotFilled.set(match.id, emp.id);
      assignedToday.add(emp.id);
      take(emp, date, matchHours);
    }

    // Pass 2: fill remaining slots with best candidate
    for (const st of fitting) {
      if (slotFilled.has(st.id)) continue;
      const cat = categoryOf(st.start_time);
      const rtSt = resolveTimes(st, oh);
      const stHours = shiftHours(rtSt.start, rtSt.end);
      const candidates = emps.filter(
        (e) => isAvailable(e, date) && !assignedToday.has(e.id) && hasCapacity(e)
          && restOk(e, date) && hoursOk(e, stHours) && dayPrefOk(e, date, st, rtSt.start),
      );
      if (candidates.length === 0) continue;

      candidates.sort((a, b) => {
        // 0. fair rotation (when on): fewest shifts so far goes first, so the
        //    whole team ends the month with a similar count. Hard requests
        //    (unavailability, day off, limits) were already filtered out;
        //    soft preferences still break the ties below.
        if (balanceShifts && a.assigned !== b.assigned) return a.assigned - b.assigned;
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
        // 5. rotation — whoever waited longest since their last shift goes
        //    first, so the same faces don't cluster on the same days.
        if (a.lastAssigned !== b.lastAssigned) return a.lastAssigned < b.lastAssigned ? -1 : 1;
        // 6. stable by name
        return a.name.localeCompare(b.name);
      });

      const pick = candidates[0];
      slotFilled.set(st.id, pick.id);
      assignedToday.add(pick.id);
      take(pick, date, stHours);
    }

    // Build proposed list + warnings for the day
    for (const st of fitting) {
      const empId = slotFilled.get(st.id);
      if (empId == null) {
        const [, mm, dd] = date.split('-');
        const rtW = resolveTimes(st, oh);
        const hW = shiftHours(rtW.start, rtW.end);

        // Nobody can hold the whole slot. With splitting enabled, cut it in
        // half (rounded to 30 min) and look for two DIFFERENT people — a day
        // choice like "jen odpolední" also unlocks the matching half when that
        // type's window overlaps it.
        if (splitShifts && hW >= 3) {
          const startMin = toMin(rtW.start);
          const endMinRaw = toMin(rtW.end);
          const endMin = endMinRaw <= startMin ? endMinRaw + 24 * 60 : endMinRaw;
          const midMin = Math.round((startMin + endMin) / 2 / 30) * 30;
          const halves = [
            { start: toHM(startMin), end: toHM(midMin), startMin, endMin: midMin },
            { start: toHM(midMin), end: toHM(endMin), startMin: midMin, endMin },
          ];
          const halfPrefOk = (e: Emp, half: { startMin: number; endMin: number; start: string }) => {
            if (dayPrefOk(e, date, st, half.start)) return true;
            // "jen <typ>" also allows the half its type-window overlaps.
            const wanted = String(emps ? e.dayPrefs[date] ?? '' : '');
            const m = /^type:(\d+)$/.exec(wanted);
            if (!m) return false;
            const t = shiftTypes.find((x: any) => Number(x.id) === parseInt(m[1]));
            if (!t) return false;
            const rt = resolveTimes(t, oh);
            const ts = toMin(rt.start);
            const teRaw = toMin(rt.end);
            const te = teRaw <= ts ? teRaw + 24 * 60 : teRaw;
            return ts < half.endMin && half.startMin < te;
          };
          const picks: (Emp | null)[] = [null, null];
          for (let hi = 0; hi < 2; hi++) {
            const half = halves[hi];
            const hHours = (half.endMin - half.startMin) / 60;
            const cands = emps.filter((e) =>
              isAvailable(e, date) && !assignedToday.has(e.id) && hasCapacity(e)
              && restOk(e, date) && hoursOk(e, hHours) && halfPrefOk(e, half)
              && picks[0]?.id !== e.id,
            );
            cands.sort((a, b) => a.assigned - b.assigned || a.name.localeCompare(b.name));
            picks[hi] = cands[0] ?? null;
          }
          if (picks[0] && picks[1]) {
            for (let hi = 0; hi < 2; hi++) {
              const half = halves[hi];
              const who = picks[hi]!;
              assignedToday.add(who.id);
              take(who, date, (half.endMin - half.startMin) / 60);
              proposed.push({
                employeeId: who.id, employeeName: who.name, employeeAvatar: who.avatar,
                date, startTime: half.start, endTime: half.end,
                type: st.name, shiftTypeId: st.id, shiftTypeName: st.name, color: st.color,
                split: true,
              });
            }
            warnings.push(`${parseInt(dd)}.${parseInt(mm)}. — směna „${st.name}" rozdělena: ${picks[0]!.name} (${halves[0].start}–${halves[0].end}) + ${picks[1]!.name} (${halves[1].start}–${halves[1].end}).`);
            continue;
          }
        }

        const free = emps.filter((e) => isAvailable(e, date) && !assignedToday.has(e.id) && hasCapacity(e));
        const blockedByPref = free.some((e) => !dayPrefOk(e, date, st, rtW.start));
        const blockedByRest = free.some((e) => dayPrefOk(e, date, st, rtW.start) && !restOk(e, date));
        const blockedByHours = free.some((e) => dayPrefOk(e, date, st, rtW.start) && restOk(e, date) && !hoursOk(e, hW));
        warnings.push(
          `${parseInt(dd)}.${parseInt(mm)}. — nepokrytá směna „${st.name}" (${
            blockedByRest ? 'volní lidé už mají limit dní v řadě'
            : blockedByHours ? 'volní lidé už mají limit hodin za měsíc'
            : blockedByPref ? 'volní lidé mají ten den povolený jen jiný typ směny'
            : 'nikdo dostupný'}).`,
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
