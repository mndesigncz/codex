import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { cashDifference, czk, normalizeMovements, normalizeDenominations, normalizeHandover, ShiftPerson } from '@/lib/closing';
import { dayPlus, pragueToday } from '@/lib/pragueTime';
import { windowOf, coveredBy } from '@/lib/shiftWindow';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | undefined };
}

const num = (v: any) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

// cash_closings.shift_employees holds raw user ids; normalise whatever the
// column gives us (missing column ⇒ undefined, older rows ⇒ empty array).
const idsOf = (v: any): number[] => {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const raw of v) {
    const id = Number(raw);
    if (Number.isFinite(id) && !out.includes(id)) out.push(id);
  }
  return out;
};

// GET — list closings.
//   employer: every closing in the team, with full financial detail + author name.
//   employee: only their OWN closings (they entered the values themselves).
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ closings: [], canSeeAll: false, payDailyCash: false });

  // Defensive: a not-yet-migrated column must not break the whole view.
  let payDailyCash = false;
  try {
    const [team] = await sql`SELECT pay_daily_cash FROM teams WHERE id = ${c.teamId}`;
    payDailyCash = !!team?.pay_daily_cash;
  } catch { /* column not migrated yet */ }

  let payoutFromRegister = true;
  try {
    const [team] = await sql`SELECT payout_from_register FROM teams WHERE id = ${c.teamId}`;
    payoutFromRegister = team?.payout_from_register !== false;
  } catch { /* column not migrated yet */ }

  let tipsInDrawer = false;
  try {
    const [team] = await sql`SELECT tips_in_drawer FROM teams WHERE id = ${c.teamId}`;
    tipsInDrawer = team?.tips_in_drawer === true;
  } catch { /* column not migrated yet */ }

  let requiresShift = true;
  try {
    const [team] = await sql`SELECT closing_requires_shift FROM teams WHERE id = ${c.teamId}`;
    requiresShift = team?.closing_requires_shift !== false;
  } catch { /* column not migrated yet */ }

  // The shared kiosk never sees financial history — it only submits.
  const rows = c.role === 'kiosk'
    ? []
    : c.role === 'employer'
    ? await sql`
        SELECT cc.*, u.name AS author_name, u.avatar AS author_avatar, ev.title AS event_title
        FROM cash_closings cc
        LEFT JOIN users u ON u.id = cc.created_by
        LEFT JOIN events ev ON ev.id = cc.event_id
        WHERE cc.team_id = ${c.teamId}
        ORDER BY cc.date DESC, cc.created_at DESC`
    : await sql`
        SELECT cc.*, u.name AS author_name, u.avatar AS author_avatar, ev.title AS event_title
        FROM cash_closings cc
        LEFT JOIN users u ON u.id = cc.created_by
        LEFT JOIN events ev ON ev.id = cc.event_id
        WHERE cc.team_id = ${c.teamId} AND cc.created_by = ${c.meId}
        ORDER BY cc.date DESC, cc.created_at DESC`;

  // A closing belongs to the whole shift — resolve the stored ids into people
  // so the UI can render "Směna: Anna + Petr".
  const peopleById = new Map<number, ShiftPerson>();
  if (rows.length) {
    try {
      const team = await sql`SELECT id, name, avatar FROM users WHERE team_id = ${c.teamId}`;
      for (const u of team as any[]) peopleById.set(u.id, { id: u.id, name: u.name, avatar: u.avatar });
    } catch { /* fall back to ids only */ }
  }
  const closings = (rows as any[]).map(r => ({
    ...r,
    movements: normalizeMovements(r.movements),
    denominations: normalizeDenominations(r.denominations),
    shiftEmployees: idsOf(r.shift_employees)
      .map(id => peopleById.get(id) ?? { id, name: 'Neznámý', avatar: null }),
  }));

  // Shifts the current user may still close: their own past/today shifts in
  // the last 14 days that don't yet have a closing. The kiosk gets the whole
  // team's unclosed recent shifts (it picks who is closing). Employers can
  // close any date, so they get an empty list (the UI shows a free date picker).
  //
  // "Unclosed" is per SHIFT, not per person: once anyone on the shift filed a
  // closing, everyone listed in its shift_employees is done. Older rows have no
  // shift_employees, so the created_by check still covers them.
  let eligibleShifts: any[] = [];
  const today = pragueToday();
  if (c.role === 'kiosk') {
    const cutoff = pragueToday(-3);
    try {
      eligibleShifts = await sql`
        SELECT s.id, s.date, s.start_time AS "startTime", s.end_time AS "endTime", s.type,
               u.id AS "employeeId", u.name AS "employeeName", u.avatar AS "employeeAvatar"
        FROM shifts s
        JOIN users u ON u.id = s.employee_id
        WHERE u.team_id = ${c.teamId}
          AND s.date <= ${today} AND s.date >= ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM cash_closings cc
            WHERE cc.team_id = ${c.teamId} AND COALESCE(cc.shift_date, cc.date) = s.date
              AND (cc.created_by = s.employee_id OR cc.shift_employees @> to_jsonb(s.employee_id))
          )
        ORDER BY s.date DESC, s.start_time ASC`;
    } catch {
      try {
        eligibleShifts = await sql`
          SELECT s.id, s.date, s.start_time AS "startTime", s.end_time AS "endTime", s.type,
                 u.id AS "employeeId", u.name AS "employeeName", u.avatar AS "employeeAvatar"
          FROM shifts s
          JOIN users u ON u.id = s.employee_id
          WHERE u.team_id = ${c.teamId}
            AND s.date <= ${today} AND s.date >= ${cutoff}
            AND NOT EXISTS (
              SELECT 1 FROM cash_closings cc
              WHERE cc.created_by = s.employee_id AND cc.date = s.date
            )
          ORDER BY s.date DESC, s.start_time ASC`;
      } catch { /* shifts table issue — leave empty */ }
    }
  } else if (c.role !== 'employer') {
    const cutoff = pragueToday(-14);
    try {
      eligibleShifts = await sql`
        SELECT s.id, s.date, s.start_time AS "startTime", s.end_time AS "endTime", s.type
        FROM shifts s
        WHERE s.employee_id = ${c.meId}
          AND s.date <= ${today} AND s.date >= ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM cash_closings cc
            WHERE cc.team_id = ${c.teamId} AND COALESCE(cc.shift_date, cc.date) = s.date
              AND (cc.created_by = ${c.meId} OR cc.shift_employees @> to_jsonb(${c.meId}::int))
          )
        ORDER BY s.date DESC, s.start_time ASC`;
    } catch {
      try {
        eligibleShifts = await sql`
          SELECT s.id, s.date, s.start_time AS "startTime", s.end_time AS "endTime", s.type
          FROM shifts s
          WHERE s.employee_id = ${c.meId}
            AND s.date <= ${today} AND s.date >= ${cutoff}
            AND NOT EXISTS (
              SELECT 1 FROM cash_closings cc
              WHERE cc.created_by = ${c.meId} AND cc.date = s.date
            )
          ORDER BY s.date DESC`;
      } catch { /* shifts table issue — leave empty */ }
    }
  }

  // For the employer's "submit on behalf" selector.
  let members: any[] = [];
  // Which team members were scheduled each recent day, and which of those days
  // still have NO closing at all — so the employer sees who was on shift and
  // where a closing is missing.
  let scheduledByDate: Record<string, any[]> = {};
  let missingClosings: { date: string; employees: any[] }[] = [];
  if (c.role === 'employer') {
    try {
      members = await sql`
        SELECT id, name, avatar FROM users
        WHERE team_id = ${c.teamId} AND role IN ('employee','employer')
        ORDER BY role DESC, name ASC`;
    } catch { /* ignore */ }

    try {
      const cutoff = pragueToday(-30);
      const sched = await sql`
        SELECT DISTINCT s.date, u.id, u.name, u.avatar
        FROM shifts s JOIN users u ON u.id = s.employee_id
        WHERE u.team_id = ${c.teamId} AND s.date >= ${cutoff} AND s.date <= ${today}
        ORDER BY s.date DESC, u.name ASC`;
      for (const r of sched as any[]) {
        (scheduledByDate[r.date] ??= []).push({ id: r.id, name: r.name, avatar: r.avatar });
      }
      // Dates that had at least one shift but not a single closing row.
      const closedDates = new Set(closings.map(r => r.date));
      missingClosings = Object.keys(scheduledByDate)
        .filter(d => !closedDates.has(d))
        .sort().reverse()
        .map(date => ({ date, employees: scheduledByDate[date] }));
    } catch { /* shifts table issue — leave empty */ }
  }

  // Which business day is this person closing right now? A shift that runs past
  // midnight still belongs to the day it started, so the form must not default
  // to the calendar date on the wall clock. Yesterday wins whenever yesterday's
  // shift is still inside its window (with the usual grace).
  let suggestedDate = today;
  try {
    const y = pragueToday(-1);
    const [prev] = await sql`
      SELECT start_time, end_time FROM shifts
      WHERE employee_id = ${c.meId} AND date = ${y}
      ORDER BY start_time DESC LIMIT 1`;
    if (prev) {
      const w = windowOf({ ...prev, date: y } as any, y);
      if (w && w.overnight && coveredBy(w, new Date())) suggestedDate = y;
    }
  } catch { /* no shifts table — today it is */ }

  return NextResponse.json({
    closings,
    suggestedDate,
    canSeeAll: c.role === 'employer',
    payDailyCash,
    payoutFromRegister,
    tipsInDrawer,
    requiresShift,
    isEmployer: c.role === 'employer',
    isKiosk: c.role === 'kiosk',
    eligibleShifts,
    members,
    scheduledByDate,
    missingClosings,
    meId: c.meId,
  });
}

// POST — create a closing (employee or employer). Bound to the author's team.
export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejsi v žádném týmu.' }, { status: 400 });

  const b = await request.json();
  const today = pragueToday();
  const date = typeof b.date === 'string' && b.date ? b.date : today;
  const isEmployer = c.role === 'employer';
  const isKiosk = c.role === 'kiosk';
  let payDailyCash = false;
  try {
    const [team] = await sql`SELECT pay_daily_cash FROM teams WHERE id = ${c.teamId}`;
    payDailyCash = !!team?.pay_daily_cash;
  } catch { /* not migrated */ }
  // Payout source is chosen per closing (the form defaults it to the team's
  // policy, but the person can override it). Snapshot the chosen value so the
  // row keeps its own expected-cash math regardless of later changes.
  let payoutFromRegister = true;
  try {
    const [team] = await sql`SELECT payout_from_register FROM teams WHERE id = ${c.teamId}`;
    payoutFromRegister = team?.payout_from_register !== false;
  } catch { /* not migrated */ }
  if (typeof b.payoutFromRegister === 'boolean') payoutFromRegister = b.payoutFromRegister;

  // Same snapshot logic for cash tips: do they stay in the drawer (and so count
  // towards the expected cash) or are they kept aside? Team default, per-closing
  // override; absent everywhere ⇒ false, which matches the historic maths.
  let tipsInDrawer = false;
  try {
    const [team] = await sql`SELECT tips_in_drawer FROM teams WHERE id = ${c.teamId}`;
    tipsInDrawer = team?.tips_in_drawer === true;
  } catch { /* not migrated */ }
  if (typeof b.tipsInDrawer === 'boolean') tipsInDrawer = b.tipsInDrawer;

  // The kiosk AND the employer can submit ON BEHALF of a chosen team member —
  // the closing is attributed to them (author, one-per-day, notifications).
  let actorId = c.meId;
  const wantEmployeeId = parseInt(b.employeeId);
  if (isKiosk && !Number.isFinite(wantEmployeeId)) {
    return NextResponse.json({ error: 'Vyber, kdo uzávěrku odesílá.' }, { status: 400 });
  }
  if ((isKiosk || isEmployer) && Number.isFinite(wantEmployeeId) && wantEmployeeId !== c.meId) {
    const [emp] = await sql`SELECT id, team_id, role FROM users WHERE id = ${wantEmployeeId}`;
    if (!emp || emp.team_id !== c.teamId || emp.role === 'kiosk') {
      return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu.' }, { status: 400 });
    }
    actorId = wantEmployeeId;
  }

  // No closing a day that hasn't happened yet.
  if (date > today) {
    return NextResponse.json({ error: 'Uzávěrku nelze vyplnit pro budoucí datum.' }, { status: 400 });
  }

  // Which SHIFT is this closing for? Filing at 00:40 after a night shift means
  // the shift started yesterday — the closing follows the shift, not the clock.
  const dateExplicit = typeof b.date === 'string' && !!b.date;
  let shiftDate = date;
  // Somebody who worked twice that day says WHICH shift they are closing;
  // without that we would always resolve to the first one and the second
  // closing would look like a duplicate of the first.
  const pickedShiftId = parseInt(b.shiftId);
  let shift: any = null;
  if (Number.isFinite(pickedShiftId)) {
    const [picked] = await sql`
      SELECT id, start_time, end_time FROM shifts
      WHERE id = ${pickedShiftId} AND employee_id = ${actorId} AND date = ${date}`;
    if (picked) shift = picked;
  }
  if (!shift) {
    [shift] = await sql`
      SELECT id, start_time, end_time FROM shifts
      WHERE employee_id = ${actorId} AND date = ${date}
      ORDER BY start_time ASC LIMIT 1`;
  }
  if (!shift && !dateExplicit) {
    const prev = dayPlus(date, -1);
    try {
      const [pShift] = await sql`
        SELECT id, start_time, end_time FROM shifts
        WHERE employee_id = ${actorId} AND date = ${prev}
        ORDER BY start_time DESC LIMIT 1`;
      const w = pShift ? windowOf({ ...pShift, date: prev }) : null;
      if (pShift && w && w.overnight && coveredBy(w, new Date())) {
        shift = pShift;
        shiftDate = prev;
      }
    } catch { /* no shifts table — stay on today */ }
  }

  // One closing per person per shift.
  // A closing may belong to an off-site event — it lives BESIDE the shop's
  // closing for the day (one per person per event), never instead of it.
  let eventId: number | null = null;
  if (b.eventId !== undefined && b.eventId !== null && b.eventId !== '') {
    const wantEvent = parseInt(b.eventId);
    if (Number.isFinite(wantEvent)) {
      try {
        const [ev] = await sql`SELECT id FROM events WHERE id = ${wantEvent} AND team_id = ${c.teamId}`;
        if (!ev) return NextResponse.json({ error: 'Akce nenalezena.' }, { status: 400 });
        eventId = wantEvent;
      } catch {
        return NextResponse.json({ error: 'Akce nejsou dostupné — spusť /api/init.' }, { status: 400 });
      }
    }
  }

  // One closing per person per BUSINESS DAY. The day is what the till is
  // counted for: a Friday shift that closes at 00:40 still belongs to Friday,
  // and somebody who covered both the morning and the evening of that Friday
  // files one closing for the day, not two. `shiftId` only records which shift
  // it was filed from — it never takes part in uniqueness.
  const shiftId: number | null = shift?.id ?? null;
  let dupe: any = null;
  try {
    if (eventId != null) {
      [dupe] = await sql`
        SELECT id FROM cash_closings
        WHERE created_by = ${actorId} AND event_id = ${eventId}
          AND (date = ${shiftDate} OR shift_date = ${shiftDate})`;
    } else {
      [dupe] = await sql`
        SELECT id FROM cash_closings
        WHERE created_by = ${actorId} AND (date = ${shiftDate} OR shift_date = ${shiftDate})
          AND event_id IS NULL`;
    }
  } catch {
    [dupe] = await sql`SELECT id FROM cash_closings WHERE created_by = ${actorId} AND date = ${shiftDate}`;
  }
  if (dupe) {
    return NextResponse.json({ error: eventId != null ? 'Za tuhle akci už máš uzávěrku odeslanou.' : 'Za tuto směnu už je uzávěrka odeslaná.' }, { status: 409 });
  }

  const shiftLabel: string | null = b.shiftLabel || (shift ? `${shift.start_time}–${shift.end_time}` : null);

  // An employer-submitted closing is always trusted. Otherwise it needs the
  // employer's approval when the person wasn't on shift that day.
  const approved = isEmployer || !!shift;

  // The closing covers the whole SHIFT, so record everyone who worked it. The
  // time window comes from an explicitly passed shift, otherwise the author's
  // own. A window is only usable when it doesn't wrap past midnight — for an
  // overnight shift we fall back to everybody scheduled that day.
  let windowShift: any = shift;
  const wantShiftId = parseInt(b.shiftId);
  if (Number.isFinite(wantShiftId)) {
    try {
      const [s] = await sql`SELECT id, start_time, end_time FROM shifts WHERE id = ${wantShiftId} AND date = ${shiftDate}`;
      if (s) windowShift = s;
    } catch { /* ignore — keep the author's own shift */ }
  }
  // Who else worked this shift: real-time overlap of the spans, so a night
  // shift (18:00–02:00) pairs correctly with 20:00–02:00 instead of falling
  // back to "everyone rostered that day".
  const shiftEmployeeIds: number[] = [actorId];
  try {
    const mineWindow = windowShift ? windowOf({ ...windowShift, date: shiftDate }) : null;
    const crew = await sql`
      SELECT DISTINCT s.employee_id AS id, s.start_time, s.end_time
      FROM shifts s JOIN users u ON u.id = s.employee_id
      WHERE u.team_id = ${c.teamId} AND s.date = ${shiftDate}`;
    for (const r of crew as any[]) {
      const id = Number(r.id);
      if (!Number.isFinite(id) || shiftEmployeeIds.includes(id)) continue;
      // Without a shift of our own there is no window to compare against, so
      // there is nothing to prove anybody shared it — claiming the whole day's
      // roster would file other people's work under this closing.
      if (!mineWindow) continue;
      const theirs = windowOf({ ...r, date: shiftDate });
      // Unknown times can't be told apart — keep them on the shift.
      if (theirs && !(mineWindow.start < theirs.end && theirs.start < mineWindow.end)) continue;
      shiftEmployeeIds.push(id);
    }
  } catch { /* shifts table issue — the author alone owns the closing */ }

  // Required procedures gate the closing server-side too — the client check
  // alone would be decorative. Employers may override (they confirmed in UI).
  // Not for an off-site event (the stall doesn't run the shop's opening
  // routine) and not for someone who wasn't on the shift at all — that closing
  // already goes to the employer for approval, so blocking it would just leave
  // the money unreported. The runs are matched against the SHIFT's day, so a
  // night shift filed after midnight still sees what was done before midnight.
  if (!isEmployer && eventId == null && shift) {
    try {
      const req = await sql`
        SELECT p.id, p.name FROM procedures p
        WHERE p.team_id = ${c.teamId} AND p.require_before_closing = TRUE
          AND NOT EXISTS (
            SELECT 1 FROM procedure_runs r
            WHERE r.procedure_id = p.id AND r.team_id = ${c.teamId} AND r.status = 'completed'
              AND to_char((r.completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD')
                  IN (${shiftDate}, ${date})
          )`;
      if ((req as any[]).length > 0) {
        return NextResponse.json({
          error: `Nejdřív dokonči povinné postupy: ${(req as any[]).map((r: any) => r.name).join(', ')}.`,
        }, { status: 400 });
      }
    } catch { /* column not migrated yet — don't block */ }
  }

  // Itemised movements and the reason for a mismatch travel with the closing.
  const movements = normalizeMovements(b.movements);
  const diffReason = b.diffReason ? String(b.diffReason).slice(0, 40) : null;
  const diffNote = b.diffNote ? String(b.diffNote).trim().slice(0, 500) || null : null;
  const denominations = normalizeDenominations(b.denominations);
  // End-of-shift removal happens AFTER the count, so it can never exceed what
  // was counted — clamp instead of trusting the client.
  const finalRemoval = Math.min(
    Math.max(0, Math.round(Number(b.finalRemoval) || 0)),
    Math.max(0, num(b.closingCash)),
  );

  let row: any;
  try {
   try {
    [row] = await sql`
      INSERT INTO cash_closings (
        team_id, created_by, date, shift_date, shift_label, shift_id, approved, approved_by, payout_from_register,
        tips_in_drawer, shift_employees, movements, diff_reason, diff_note, denominations, final_removal, event_id,
        opening_cash, cash_revenue, card_revenue, tips, expenses,
        cash_removed, self_payout, closing_cash, customers, notes
      ) VALUES (
        ${c.teamId}, ${actorId}, ${date}, ${shiftDate}, ${shiftLabel}, ${shiftId}, ${approved}, ${isEmployer ? c.meId : null}, ${payoutFromRegister},
        ${tipsInDrawer}, ${JSON.stringify(shiftEmployeeIds)}::jsonb,
        ${JSON.stringify(movements)}::jsonb, ${diffReason}, ${diffNote},
        ${JSON.stringify(denominations)}::jsonb, ${finalRemoval}, ${eventId},
        ${num(b.openingCash)}, ${num(b.cashRevenue)}, ${num(b.cardRevenue)}, ${num(b.tips)}, ${num(b.expenses)},
        ${num(b.cashRemoved)}, ${num(b.selfPayout)}, ${num(b.closingCash)}, ${num(b.customers)}, ${b.notes || null}
      ) RETURNING *`;
  } catch {
   try {
    // final_removal not migrated yet.
    [row] = await sql`
      INSERT INTO cash_closings (
        team_id, created_by, date, shift_label, shift_id, approved, approved_by, payout_from_register,
        tips_in_drawer, shift_employees, movements, diff_reason, diff_note, denominations,
        opening_cash, cash_revenue, card_revenue, tips, expenses,
        cash_removed, self_payout, closing_cash, customers, notes
      ) VALUES (
        ${c.teamId}, ${actorId}, ${date}, ${shiftLabel}, ${shiftId}, ${approved}, ${isEmployer ? c.meId : null}, ${payoutFromRegister},
        ${tipsInDrawer}, ${JSON.stringify(shiftEmployeeIds)}::jsonb,
        ${JSON.stringify(movements)}::jsonb, ${diffReason}, ${diffNote},
        ${JSON.stringify(denominations)}::jsonb,
        ${num(b.openingCash)}, ${num(b.cashRevenue)}, ${num(b.cardRevenue)}, ${num(b.tips)}, ${num(b.expenses)},
        ${num(b.cashRemoved)}, ${num(b.selfPayout)}, ${num(b.closingCash)}, ${num(b.customers)}, ${b.notes || null}
      ) RETURNING *`;
   } catch {
    try {
      // tips_in_drawer / shift_employees not migrated yet.
      [row] = await sql`
        INSERT INTO cash_closings (
          team_id, created_by, date, shift_label, shift_id, approved, approved_by, payout_from_register,
          opening_cash, cash_revenue, card_revenue, tips, expenses,
          cash_removed, self_payout, closing_cash, customers, notes
        ) VALUES (
          ${c.teamId}, ${actorId}, ${date}, ${shiftLabel}, ${shiftId}, ${approved}, ${isEmployer ? c.meId : null}, ${payoutFromRegister},
          ${num(b.openingCash)}, ${num(b.cashRevenue)}, ${num(b.cardRevenue)}, ${num(b.tips)}, ${num(b.expenses)},
          ${num(b.cashRemoved)}, ${num(b.selfPayout)}, ${num(b.closingCash)}, ${num(b.customers)}, ${b.notes || null}
        ) RETURNING *`;
    } catch {
      // approval/shift columns not migrated yet — insert the core row so closings still work.
      [row] = await sql`
        INSERT INTO cash_closings (
          team_id, created_by, date, shift_label,
          opening_cash, cash_revenue, card_revenue, tips, expenses,
          cash_removed, self_payout, closing_cash, customers, notes
        ) VALUES (
          ${c.teamId}, ${actorId}, ${date}, ${shiftLabel},
          ${num(b.openingCash)}, ${num(b.cashRevenue)}, ${num(b.cardRevenue)}, ${num(b.tips)}, ${num(b.expenses)},
          ${num(b.cashRemoved)}, ${num(b.selfPayout)}, ${num(b.closingCash)}, ${num(b.customers)}, ${b.notes || null}
        ) RETURNING *`;
    }
   }
   }
  } catch (e: any) {
    // The partial unique index closes the double-submit race the SELECT above
    // can't — turn the violation into the same friendly 409.
    if (e?.code === '23505') {
      // Which rule fired matters: the SELECT above already let this through, so
      // a violation here means the database still carries the older
      // one-per-DAY index. Naming it turns „nejde to uložit" into something
      // actionable instead of a mystery.
      const stale = String(e?.constraint ?? '') === 'cash_closings_one_per_day';
      return NextResponse.json({
        error: stale
          ? 'Uzávěrku blokuje starší databázové pravidlo „jedna uzávěrka na den". Spusť /api/init — přestaví se na pravidlo podle směn.'
          : 'Za tuto směnu už je uzávěrka odeslaná.',
      }, { status: 409 });
    }
    throw e;
  }

  // The business day the closing belongs to — separate from `date` so a night
  // shift's closing stays attached to the shift that earned it.
  if (row?.id) {
    try {
      await sql`UPDATE cash_closings SET shift_date = ${shiftDate} WHERE id = ${row.id}`;
      row.shift_date = shiftDate;
    } catch { /* column not migrated yet */ }
    if (eventId != null) {
      try {
        await sql`UPDATE cash_closings SET event_id = ${eventId} WHERE id = ${row.id}`;
        row.event_id = eventId;
      } catch { /* column not migrated yet */ }
    }
  }

  // The handover rides on the closing; separate UPDATE so a not-yet-migrated
  // column can't fail the insert.
  try {
    const handover = normalizeHandover(b.handover);
    if (handover) await sql`UPDATE cash_closings SET handover = ${JSON.stringify(handover)}::jsonb WHERE id = ${row.id}`;
  } catch { /* column not migrated yet */ }

  // Notify team employers (except the author).
  try {
    const employers = await sql`
      SELECT id FROM users WHERE team_id = ${c.teamId} AND role = 'employer' AND id <> ${actorId}`;
    if (employers.length) {
      const [author] = await sql`SELECT name FROM users WHERE id = ${actorId}`;
      const diff = cashDifference({ ...(row as any), tips_in_drawer: tipsInDrawer });
      const verdict = diff === 0 ? 'kasa sedí' : diff > 0 ? `přebytek +${czk(diff)}` : `manko ${czk(diff)}`;
      const name = author?.name ?? 'Zaměstnanec';
      await Promise.allSettled(employers.map((e: any) => notifyUser(e.id, {
        title: approved ? 'Nová uzávěrka' : '⚠️ Uzávěrka ke schválení',
        body: approved
          ? `${name} odeslal uzávěrku (${row.date}) — ${verdict}.`
          : `${name} odeslal uzávěrku (${row.date}) bez směny — schval ji v Uzávěrkách.`,
        type: approved ? (diff < 0 ? 'warning' : 'info') : 'warning',
        link: '/employer/overview?view=reports',
      })));
    }
  } catch (e) {
    console.error('notify employers failed', e);
  }

  // Co-workers: one closing can cover everyone who worked. A colleague who has
  // no planned shift can still be added manually — we then create an auto shift
  // and give them the SAME clocked time as the person who filed the closing,
  // flagged in attendance so the employer can check/edit it.
  const refStart: string = shift?.start_time ?? '08:00';
  const refEnd: string = shift?.end_time ?? '16:00';
  let refEntry: any = null;
  try {
    [refEntry] = await sql`
      SELECT clock_in, clock_out FROM time_entries
      WHERE employee_id = ${actorId}
        AND to_char((clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${shiftDate}
      ORDER BY clock_in ASC LIMIT 1`;
  } catch { /* ignore */ }

  const coveredIds: number[] = [];
  if (eventId == null && Array.isArray(b.coworkers) && b.coworkers.length && row?.id) {
    for (const cw of b.coworkers) {
      const cid = parseInt(cw?.employeeId);
      if (!Number.isFinite(cid) || cid === actorId) continue;
      try {
        const [emp] = await sql`SELECT id, team_id, role, name FROM users WHERE id = ${cid}`;
        if (!emp || emp.team_id !== c.teamId || emp.role === 'kiosk') continue;
        const [cwDupe] = await sql`SELECT id FROM cash_closings WHERE created_by = ${cid} AND date = ${shiftDate}`;
        if (cwDupe) continue;

        // Their shift that day, or create an auto one if they weren't scheduled.
        let cwShift: any = (await sql`SELECT id FROM shifts WHERE employee_id = ${cid} AND date = ${shiftDate} LIMIT 1`)[0];
        const noShift = !cwShift;
        if (noShift) {
          try {
            try { cwShift = (await sql`INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type, auto_created) VALUES (${c.teamId}, ${cid}, ${shiftDate}, ${refStart}, ${refEnd}, 'auto', TRUE) RETURNING id`)[0]; }
            catch { cwShift = (await sql`INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type) VALUES (${c.teamId}, ${cid}, ${shiftDate}, ${refStart}, ${refEnd}, 'auto') RETURNING id`)[0]; }
          } catch { cwShift = null; }
        }

        const cwPayout = payDailyCash ? num(cw?.payout) : 0;
        try {
          await sql`
            INSERT INTO cash_closings (team_id, created_by, date, shift_date, shift_label, shift_id, covered_by, approved, approved_by, payout_from_register, self_payout)
            VALUES (${c.teamId}, ${cid}, ${shiftDate}, ${shiftDate}, ${shiftLabel}, ${cwShift?.id ?? null}, ${row.id}, ${approved}, ${isEmployer ? c.meId : null}, ${payoutFromRegister}, ${cwPayout})`;
        } catch {
          await sql`INSERT INTO cash_closings (team_id, created_by, date, shift_label, covered_by, self_payout) VALUES (${c.teamId}, ${cid}, ${shiftDate}, ${shiftLabel}, ${row.id}, ${cwPayout})`;
        }
        coveredIds.push(cid);

        // Attendance record with the same time as the closing author + a note.
        if (noShift) {
          try {
            const note = 'Přidán v uzávěrce — neměl naplánovanou směnu (zkontroluj čas)';
            if (refEntry?.clock_in) {
              await sql`INSERT INTO time_entries (team_id, employee_id, clock_in, clock_out, source, note) VALUES (${c.teamId}, ${cid}, ${refEntry.clock_in}, ${refEntry.clock_out ?? null}, 'closing', ${note})`;
            } else {
              await sql`INSERT INTO time_entries (team_id, employee_id, clock_in, clock_out, source, note) VALUES (${c.teamId}, ${cid}, ${`${shiftDate} ${refStart}`}, ${`${shiftDate} ${refEnd}`}, 'closing', ${note})`;
            }
          } catch { /* best-effort */ }
        }

        try {
          const [author] = await sql`SELECT name FROM users WHERE id = ${actorId}`;
          await notifyUser(cid, { title: 'Uzávěrka za tebe', body: `${author?.name ?? 'Kolega'} vyplnil uzávěrku i za tebe (${shiftDate}).`, type: 'info', link: '/employee/shifts?view=closing' });
        } catch { /* best-effort */ }
      } catch { /* skip this coworker */ }
    }
  }

  // Colleagues added by hand were on the shift too — fold them into the crew.
  const finalCrew = shiftEmployeeIds.concat(coveredIds.filter(id => !shiftEmployeeIds.includes(id)));
  if (row?.id && finalCrew.length > shiftEmployeeIds.length) {
    try {
      await sql`UPDATE cash_closings SET shift_employees = ${JSON.stringify(finalCrew)}::jsonb WHERE id = ${row.id}`;
      row.shift_employees = finalCrew;
    } catch { /* column not migrated yet */ }
  }

  return NextResponse.json({ ok: true, closing: row, approved, covered: coveredIds.length, tipsInDrawer });
}
