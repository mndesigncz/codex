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

  let requiresShift = true;
  try {
    const [team] = await sql`SELECT closing_requires_shift FROM teams WHERE id = ${c.teamId}`;
    requiresShift = team?.closing_requires_shift !== false;
  } catch { /* column not migrated yet */ }

  const rows = c.role === 'employer'
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
  // the last 14 days that don't yet have a closing. Employers can close any
  // date, so they get an empty list (the UI shows a free date picker).
  let eligibleShifts: any[] = [];
  if (c.role !== 'employer') {
    const today = new Date().toISOString().split('T')[0];
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

  return NextResponse.json({
    closings: rows,
    canSeeAll: c.role === 'employer',
    payDailyCash,
    requiresShift,
    isEmployer: c.role === 'employer',
    eligibleShifts,
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

  // No closing a day that hasn't happened yet.
  if (date > today) {
    return NextResponse.json({ error: 'Uzávěrku nelze vyplnit pro budoucí datum.' }, { status: 400 });
  }

  // One closing per person per day.
  const [dupe] = await sql`
    SELECT id FROM cash_closings WHERE created_by = ${c.meId} AND date = ${date}`;
  if (dupe) {
    return NextResponse.json({ error: 'Za tento den už jsi uzávěrku odeslal/a.' }, { status: 409 });
  }

  // Employees may only close a day on which they actually had a shift
  // (unless the team turned this requirement off). Employers can close any day.
  let shiftId: number | null = null;
  let shiftLabel: string | null = b.shiftLabel || null;
  if (!isEmployer) {
    let requiresShift = true;
    try {
      const [team] = await sql`SELECT closing_requires_shift FROM teams WHERE id = ${c.teamId}`;
      requiresShift = team?.closing_requires_shift !== false;
    } catch { /* not migrated */ }

    const [shift] = await sql`
      SELECT id, start_time, end_time FROM shifts
      WHERE employee_id = ${c.meId} AND date = ${date}
      ORDER BY start_time ASC LIMIT 1`;
    if (requiresShift && !shift) {
      return NextResponse.json(
        { error: 'Uzávěrku můžeš odeslat jen za den, kdy jsi měl/a směnu.' },
        { status: 403 },
      );
    }
    if (shift) {
      shiftId = shift.id;
      if (!shiftLabel) shiftLabel = `${shift.start_time}–${shift.end_time}`;
    }
  }

  let row: any;
  try {
    [row] = await sql`
      INSERT INTO cash_closings (
        team_id, created_by, date, shift_label, shift_id,
        opening_cash, cash_revenue, card_revenue, tips, expenses,
        cash_removed, self_payout, closing_cash, customers, notes
      ) VALUES (
        ${c.teamId}, ${c.meId}, ${date}, ${shiftLabel}, ${shiftId},
        ${num(b.openingCash)}, ${num(b.cashRevenue)}, ${num(b.cardRevenue)}, ${num(b.tips)}, ${num(b.expenses)},
        ${num(b.cashRemoved)}, ${num(b.selfPayout)}, ${num(b.closingCash)}, ${num(b.customers)}, ${b.notes || null}
      ) RETURNING *`;
  } catch {
    // shift_id column not migrated yet — insert without it so closings still work.
    [row] = await sql`
      INSERT INTO cash_closings (
        team_id, created_by, date, shift_label,
        opening_cash, cash_revenue, card_revenue, tips, expenses,
        cash_removed, self_payout, closing_cash, customers, notes
      ) VALUES (
        ${c.teamId}, ${c.meId}, ${date}, ${shiftLabel},
        ${num(b.openingCash)}, ${num(b.cashRevenue)}, ${num(b.cardRevenue)}, ${num(b.tips)}, ${num(b.expenses)},
        ${num(b.cashRemoved)}, ${num(b.selfPayout)}, ${num(b.closingCash)}, ${num(b.customers)}, ${b.notes || null}
      ) RETURNING *`;
  }

  // Notify team employers (except the author) — flag manko/přebytek up front.
  try {
    const employers = await sql`
      SELECT id FROM users WHERE team_id = ${c.teamId} AND role = 'employer' AND id <> ${c.meId}`;
    if (employers.length) {
      const [author] = await sql`SELECT name FROM users WHERE id = ${c.meId}`;
      const diff = cashDifference(row as any);
      const verdict = diff === 0 ? 'kasa sedí' : diff > 0 ? `přebytek +${czk(diff)}` : `manko ${czk(diff)}`;
      await Promise.allSettled(employers.map((e: any) => notifyUser(e.id, {
        title: 'Nová uzávěrka',
        body: `${author?.name ?? 'Zaměstnanec'} odeslal uzávěrku (${row.date}) — ${verdict}.`,
        type: diff < 0 ? 'warning' : 'info',
      })));
    }
  } catch (e) {
    console.error('notify employers failed', e);
  }

  return NextResponse.json({ ok: true, closing: row });
}
