// Sedí uzávěrky s pokladnou? Den po dni: co říká kasa proti tomu, co lidé
// napsali do uzávěrky.
//
// Účtenka vystavená po půlnoci patří k předchozímu obchodnímu dni — stejně
// jako uzávěrka, kterou po ní někdo vyplní ve 2 ráno. Bez toho by každý den
// s pozdním zavíráním vypadal jako rozdíl v obou směrech naráz.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getConnection } from '@/lib/storyous';
import { teamIsPro, PRO_ONLY_MSG } from '@/lib/planServer';
import { pragueDayOf, pragueHourOf, dayPlus } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

/** Do kolika hodin ráno se účtenka počítá k předchozímu dni. */
const NIGHT_CUTOFF_HOUR = 6;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'employer') {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ connected: false });
  if (!(await teamIsPro(u.team_id))) {
    return NextResponse.json({ error: PRO_ONLY_MSG }, { status: 403 });
  }
  const conn = await getConnection(u.team_id);
  if (!conn) return NextResponse.json({ connected: false });

  const month = String(new URL(req.url).searchParams.get('month') ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
  const from = `${month}-01`;
  const nextM = new Date(from + 'T12:00:00'); nextM.setMonth(nextM.getMonth() + 1);
  const till = nextM.toISOString().slice(0, 10);

  type Bucket = { cash: number; card: number; total: number; bills: number };
  const pos = new Map<string, Bucket>();

  try {
    const { clientId, clientSecret, merchantId, placeId } = conn;
    const authRes = await fetch('https://login.storyous.com/api/auth/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    });
    const auth = await authRes.json();
    if (!auth?.access_token) throw new Error('auth');
    const H = { Authorization: `Bearer ${auth.access_token}` };

    // O den dál, ať se zachytí i noční účtenky prvního dne dalšího měsíce,
    // které patří poslednímu dni tohohle.
    let path: string | null =
      `/bills/${conn.merchantId}-${conn.placeId}?from=${from}&till=${dayPlus(till, 1)}&limit=100`;
    let guard = 0;
    while (path && guard < 40) {
      guard++;
      const res: Response = await fetch(`https://api.storyous.com${path}`, { headers: H });
      if (!res.ok) throw new Error(String(res.status));
      const page: any = await res.json();
      for (const b of page?.data ?? []) {
        if (b.deleted || b.refunded) continue;
        const when = new Date(String(b.paidAt ?? b.createdAt ?? ''));
        const h = pragueHourOf(when);
        if (h == null) continue;
        const day = h < NIGHT_CUTOFF_HOUR ? dayPlus(pragueDayOf(when), -1) : pragueDayOf(when);
        if (day < from || day >= till) continue;
        const price = Number(b.finalPrice) || 0;
        const cur = pos.get(day) ?? { cash: 0, card: 0, total: 0, bills: 0 };
        const pm = String(b.paymentMethod ?? '').toLowerCase();
        if (pm === 'cash') cur.cash += price; else cur.card += price;
        cur.total += price;
        cur.bills++;
        pos.set(day, cur);
      }
      path = page?.nextPage ? String(page.nextPage).replace('https://api.storyous.com', '') : null;
    }
  } catch {
    return NextResponse.json({ connected: true, error: 'Pokladna teď neodpovídá.' }, { status: 502 });
  }

  // ---- co lidé napsali do uzávěrek ----
  let closings: any[] = [];
  try {
    closings = await sql`
      SELECT COALESCE(cc.shift_date, cc.date) AS day,
             SUM(COALESCE(cc.cash_revenue, 0))::int AS cash,
             SUM(COALESCE(cc.card_revenue, 0))::int AS card,
             COUNT(*)::int AS n,
             STRING_AGG(DISTINCT us.name, ', ') AS people
      FROM cash_closings cc LEFT JOIN users us ON us.id = cc.created_by
      WHERE cc.team_id = ${u.team_id}
        AND cc.covered_by IS NULL AND cc.event_id IS NULL
        AND COALESCE(cc.shift_date, cc.date) >= ${from}
        AND COALESCE(cc.shift_date, cc.date) < ${till}
      GROUP BY 1`;
  } catch { /* bez uzávěrek se porovná aspoň pokladna */ }

  const byDay = new Map<string, any>();
  for (const [day, v] of Array.from(pos.entries())) {
    byDay.set(day, { day, pos: v, cash: 0, card: 0, n: 0, people: null });
  }
  for (const c of closings as any[]) {
    const day = String(c.day);
    const row = byDay.get(day) ?? { day, pos: null, cash: 0, card: 0, n: 0, people: null };
    row.cash = Number(c.cash) || 0;
    row.card = Number(c.card) || 0;
    row.n = Number(c.n) || 0;
    row.people = c.people ?? null;
    byDay.set(day, row);
  }

  const days = Array.from(byDay.values()).map(r => {
    const posTotal = r.pos ? r.pos.total : null;
    const declared = r.n > 0 ? r.cash + r.card : null;
    return {
      day: r.day,
      bills: r.pos?.bills ?? 0,
      posCash: r.pos?.cash ?? null,
      posCard: r.pos?.card ?? null,
      posTotal,
      declaredCash: r.n > 0 ? r.cash : null,
      declaredCard: r.n > 0 ? r.card : null,
      declared,
      diff: posTotal != null && declared != null ? declared - posTotal : null,
      closings: r.n,
      people: r.people,
    };
  }).sort((a, b) => a.day.localeCompare(b.day));

  const compared = days.filter(d => d.diff != null);
  // 50 Kč je zaokrouhlování a drobné; nad to jde o překlep nebo chybějící platbu.
  const off = compared.filter(d => Math.abs(d.diff as number) > 50)
    .sort((a, b) => Math.abs(b.diff as number) - Math.abs(a.diff as number));
  const missingClosing = days.filter(d => (d.bills ?? 0) > 0 && d.closings === 0);
  const noPos = days.filter(d => d.closings > 0 && (d.bills ?? 0) === 0);
  const netDiff = compared.reduce((s, d) => s + (d.diff as number), 0);

  const insights: { icon: string; title: string; text: string; tone: 'good' | 'warn' | 'info' }[] = [];
  if (compared.length && !off.length) {
    insights.push({
      icon: 'check', tone: 'good',
      title: 'Uzávěrky sedí s pokladnou',
      text: `Porovnáno ${compared.length} dní, nikde rozdíl nad 50 Kč. Čísla z kasy a z uzávěrek si odpovídají.`,
    });
  }
  if (off.length) {
    const worst = off[0];
    insights.push({
      icon: 'warning', tone: Math.abs(worst.diff as number) > 500 ? 'warn' : 'info',
      title: `${off.length} ${off.length === 1 ? 'den nesedí' : 'dní nesedí'} s pokladnou`,
      text: `Největší rozdíl ${new Date(worst.day + 'T12:00:00').toLocaleDateString('cs-CZ')}: uzávěrka ${(worst.declared ?? 0).toLocaleString('cs-CZ')} Kč proti ${(worst.posTotal ?? 0).toLocaleString('cs-CZ')} Kč z kasy${worst.people ? ` (${worst.people})` : ''}. Nejčastěji je to překlep v uzávěrce nebo platba, která se do kasy nedostala.`,
    });
  }
  if (missingClosing.length) {
    insights.push({
      icon: 'clipboard', tone: 'warn',
      title: `${missingClosing.length} dní bez uzávěrky`,
      text: `V kase je tržba, ale uzávěrku k ní nikdo nevyplnil: ${missingClosing.slice(0, 5).map(d => new Date(d.day + 'T12:00:00').toLocaleDateString('cs-CZ')).join(', ')}${missingClosing.length > 5 ? ' a další' : ''}.`,
    });
  }
  if (noPos.length) {
    insights.push({
      icon: 'bulb', tone: 'info',
      title: `${noPos.length} dní má uzávěrku bez účtenek`,
      text: 'Uzávěrka existuje, ale kasa na ten den nic nemá. Buď se markovalo jinam, nebo je uzávěrka zapsaná na špatný den.',
    });
  }

  return NextResponse.json({
    connected: true, month,
    days,
    totals: {
      comparedDays: compared.length,
      offDays: off.length,
      netDiff,
      posTotal: days.reduce((s, d) => s + (d.posTotal ?? 0), 0),
      declaredTotal: days.reduce((s, d) => s + (d.declared ?? 0), 0),
    },
    insights,
    note: `Účtenky vystavené do ${NIGHT_CUTOFF_HOUR}:00 se počítají k předchozímu dni.`,
  });
}
