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
// does a shift [start,end] fit inside opening [open,close]?
function fitsWithin(start: string, end: string, open: string, close: string) {
  // overnight shift (end <= start): only require start within open window
  if (end <= start) return start >= open;
  return start >= open && end <= close;
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
  assigned: number;
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
  const employeeRows = await sql`
    SELECT id, name, avatar FROM users WHERE team_id = ${ctx.teamId} AND role = 'employee' ORDER BY name ASC`;
  const availRows = await sql`
    SELECT employee_id, unavailable_dates, day_preferences, preferred_shift, max_shifts
    FROM availability_requests WHERE team_id = ${ctx.teamId} AND month = ${month}`;
  const shiftTypes = await sql`
    SELECT id, name, start_time, end_time, color, position
    FROM shift_types WHERE team_id = ${ctx.teamId} ORDER BY position ASC, id ASC`;
  const fixedRows = await sql`
    SELECT employee_id, weekday, shift_type_id FROM fixed_assignments WHERE team_id = ${ctx.teamId}`;
  const [team] = await sql`SELECT opening_hours FROM teams WHERE id = ${ctx.teamId}`;
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
      unavailable: new Set<string>(a?.unavailable_dates ?? []),
      dayPrefs: (a?.day_preferences ?? {}) as Record<string, string>,
      preferredShift: a?.preferred_shift ?? null,
      maxShifts: a?.max_shifts ?? null,
      assigned: 0,
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

  const proposed: any[] = [];
  const monthDays = daysInMonth(month);

  for (let d = 1; d <= monthDays; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const wd = weekdayOf(date);
    const oh = openingHours[String(wd)] ?? { open: '08:00', close: '20:00', closed: false };
    if (oh.closed) continue;

    // shift types that fit within this day's opening hours
    const fitting = shiftTypes.filter((st: any) => fitsWithin(st.start_time, st.end_time, oh.open, oh.close));
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
      slotFilled.set(st.id, emp.id);
      assignedToday.add(emp.id);
      emp.assigned++;
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
      const match = openSlots.find((s: any) => categoryOf(s.start_time) === wantPref) ?? openSlots[0];
      slotFilled.set(match.id, emp.id);
      assignedToday.add(emp.id);
      emp.assigned++;
    }

    // Pass 2: fill remaining slots with best candidate
    for (const st of fitting) {
      if (slotFilled.has(st.id)) continue;
      const cat = categoryOf(st.start_time);
      const candidates = emps.filter(
        (e) => isAvailable(e, date) && !assignedToday.has(e.id) && hasCapacity(e),
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
        // 3. fairness — fewest assigned so far
        if (a.assigned !== b.assigned) return a.assigned - b.assigned;
        // 4. stable by name
        return a.name.localeCompare(b.name);
      });

      const pick = candidates[0];
      slotFilled.set(st.id, pick.id);
      assignedToday.add(pick.id);
      pick.assigned++;
    }

    // Build proposed list + warnings for the day
    for (const st of fitting) {
      const empId = slotFilled.get(st.id);
      if (empId == null) {
        const [, mm, dd] = date.split('-');
        warnings.push(`${parseInt(dd)}.${parseInt(mm)}. — nepokrytá směna „${st.name}" (nikdo dostupný).`);
        continue;
      }
      const emp = empById.get(empId)!;
      proposed.push({
        employeeId: emp.id,
        employeeName: emp.name,
        employeeAvatar: emp.avatar,
        date,
        startTime: st.start_time,
        endTime: st.end_time,
        type: categoryOf(st.start_time),
        shiftTypeId: st.id,
        shiftTypeName: st.name,
        color: st.color,
      });
    }
  }

  return NextResponse.json({ proposed, warnings });
}
