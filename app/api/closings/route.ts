import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { cashDifference, czk } from '@/lib/closing';

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
        SELECT cc.*, u.name AS author_name, u.avatar AS author_avatar
        FROM cash_closings cc
        LEFT JOIN users u ON u.id = cc.created_by
        WHERE cc.team_id = ${c.teamId}
        ORDER BY cc.date DESC, cc.created_at DESC`
    : await sql`
        SELECT cc.*, u.name AS author_name, u.avatar AS author_avatar
        FROM cash_closings cc
        LEFT JOIN users u ON u.id = cc.created_by
        WHERE cc.team_id = ${c.teamId} AND cc.created_by = ${c.meId}
        ORDER BY cc.date DESC, cc.created_at DESC`;

  // Shifts the current user may still close: their own past/today shifts in
  // the last 14 days that don't yet have a closing. The kiosk gets the whole
  // team's unclosed recent shifts (it picks who is closing). Employers can
  // close any date, so they get an empty list (the UI shows a free date picker).
  let eligibleShifts: any[] = [];
  const today = new Date().toISOString().split('T')[0];
  if (c.role === 'kiosk') {
    const cutoff = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
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
  } else if (c.role !== 'employer') {
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
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
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const sched = await sql`
        SELECT DISTINCT s.date, u.id, u.name, u.avatar
        FROM shifts s JOIN users u ON u.id = s.employee_id
        WHERE u.team_id = ${c.teamId} AND s.date >= ${cutoff} AND s.date <= ${today}
        ORDER BY s.date DESC, u.name ASC`;
      for (const r of sched as any[]) {
        (scheduledByDate[r.date] ??= []).push({ id: r.id, name: r.name, avatar: r.avatar });
      }
      // Dates that had at least one shift but not a single closing row.
      const closedDates = new Set((rows as any[]).map(r => r.date));
      missingClosings = Object.keys(scheduledByDate)
        .filter(d => !closedDates.has(d))
        .sort().reverse()
        .map(date => ({ date, employees: scheduledByDate[date] }));
    } catch { /* shifts table issue — leave empty */ }
  }

  return NextResponse.json({
    closings: rows,
    canSeeAll: c.role === 'employer',
    payDailyCash,
    payoutFromRegister,
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
  const today = new Date().toISOString().split('T')[0];
  const date = typeof b.date === 'string' && b.date ? b.date : today;
  const isEmployer = c.role === 'employer';
  const isKiosk = c.role === 'kiosk';
  let payDailyCash = false;
  try {
    const [team] = await sql`SELECT pay_daily_cash FROM teams WHERE id = ${c.teamId}`;
    payDailyCash = !!team?.pay_daily_cash;
  } catch { /* not migrated */ }
  // Snapshot the payout-source policy onto the closing so historical rows keep
  // their own expected-cash math even if the team later flips the switch.
  let payoutFromRegister = true;
  try {
    const [team] = await sql`SELECT payout_from_register FROM teams WHERE id = ${c.teamId}`;
    payoutFromRegister = team?.payout_from_register !== false;
  } catch { /* not migrated */ }

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

  // One closing per person per day.
  const [dupe] = await sql`
    SELECT id FROM cash_closings WHERE created_by = ${actorId} AND date = ${date}`;
  if (dupe) {
    return NextResponse.json({ error: 'Za tento den už je uzávěrka odeslaná.' }, { status: 409 });
  }

  // Did the person the closing is FOR actually have a shift that day?
  const [shift] = await sql`
    SELECT id, start_time, end_time FROM shifts
    WHERE employee_id = ${actorId} AND date = ${date}
    ORDER BY start_time ASC LIMIT 1`;
  const shiftId: number | null = shift?.id ?? null;
  const shiftLabel: string | null = b.shiftLabel || (shift ? `${shift.start_time}–${shift.end_time}` : null);

  // An employer-submitted closing is always trusted. Otherwise it needs the
  // employer's approval when the person wasn't on shift that day.
  const approved = isEmployer || !!shift;

  let row: any;
  try {
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

  // Notify team employers (except the author).
  try {
    const employers = await sql`
      SELECT id FROM users WHERE team_id = ${c.teamId} AND role = 'employer' AND id <> ${actorId}`;
    if (employers.length) {
      const [author] = await sql`SELECT name FROM users WHERE id = ${actorId}`;
      const diff = cashDifference(row as any);
      const verdict = diff === 0 ? 'kasa sedí' : diff > 0 ? `přebytek +${czk(diff)}` : `manko ${czk(diff)}`;
      const name = author?.name ?? 'Zaměstnanec';
      await Promise.allSettled(employers.map((e: any) => notifyUser(e.id, {
        title: approved ? 'Nová uzávěrka' : '⚠️ Uzávěrka ke schválení',
        body: approved
          ? `${name} odeslal uzávěrku (${row.date}) — ${verdict}.`
          : `${name} odeslal uzávěrku (${row.date}) bez směny — schval ji v Uzávěrkách.`,
        type: approved ? (diff < 0 ? 'warning' : 'info') : 'warning',
      })));
    }
  } catch (e) {
    console.error('notify employers failed', e);
  }

  // Co-workers: when several people were on shift, one closing can cover them.
  // We record a lightweight covered stub per colleague (their payout only) so
  // they don't get reminded / can't double-submit, and their wage is tracked.
  let covered = 0;
  if (Array.isArray(b.coworkers) && b.coworkers.length && row?.id) {
    for (const cw of b.coworkers) {
      const cid = parseInt(cw?.employeeId);
      if (!Number.isFinite(cid) || cid === actorId) continue;
      try {
        const [emp] = await sql`SELECT id, team_id, role, name FROM users WHERE id = ${cid}`;
        if (!emp || emp.team_id !== c.teamId || emp.role === 'kiosk') continue;
        // Must have had a shift that day and not already have a closing.
        const [cwShift] = await sql`SELECT id FROM shifts WHERE employee_id = ${cid} AND date = ${date} LIMIT 1`;
        if (!cwShift) continue;
        const [cwDupe] = await sql`SELECT id FROM cash_closings WHERE created_by = ${cid} AND date = ${date}`;
        if (cwDupe) continue;
        const cwPayout = payDailyCash ? num(cw?.payout) : 0;
        await sql`
          INSERT INTO cash_closings (
            team_id, created_by, date, shift_label, shift_id, covered_by, approved, approved_by, payout_from_register, self_payout
          ) VALUES (
            ${c.teamId}, ${cid}, ${date}, ${shiftLabel}, ${cwShift.id}, ${row.id}, ${approved}, ${isEmployer ? c.meId : null}, ${payoutFromRegister}, ${cwPayout}
          )`;
        covered++;
        try {
          const [author] = await sql`SELECT name FROM users WHERE id = ${actorId}`;
          await notifyUser(cid, {
            title: 'Uzávěrka za tebe',
            body: `${author?.name ?? 'Kolega'} vyplnil uzávěrku i za tebe (${date}).`,
            type: 'info',
          });
        } catch { /* best-effort */ }
      } catch { /* skip this coworker */ }
    }
  }

  return NextResponse.json({ ok: true, closing: row, approved, covered });
}
