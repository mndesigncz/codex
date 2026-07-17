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

  return NextResponse.json({ closings: rows, canSeeAll: c.role === 'employer', payDailyCash });
}

// POST — create a closing (employee or employer). Bound to the author's team.
export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejsi v žádném týmu.' }, { status: 400 });

  const b = await request.json();
  const date = typeof b.date === 'string' && b.date ? b.date : new Date().toISOString().split('T')[0];

  const [row] = await sql`
    INSERT INTO cash_closings (
      team_id, created_by, date, shift_label,
      opening_cash, cash_revenue, card_revenue, tips, expenses,
      cash_removed, self_payout, closing_cash, customers, notes
    ) VALUES (
      ${c.teamId}, ${c.meId}, ${date}, ${b.shiftLabel || null},
      ${num(b.openingCash)}, ${num(b.cashRevenue)}, ${num(b.cardRevenue)}, ${num(b.tips)}, ${num(b.expenses)},
      ${num(b.cashRemoved)}, ${num(b.selfPayout)}, ${num(b.closingCash)}, ${num(b.customers)}, ${b.notes || null}
    ) RETURNING *`;

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
