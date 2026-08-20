// Everything else the POS data can tell us about one month: hourly peaks,
// revenue per person, refunds and discounts, average bill and party size.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getConnection } from '@/lib/storyous';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'employer') {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ connected: false });
  const conn = await getConnection(u.team_id);
  if (!conn) return NextResponse.json({ connected: false });

  const month = String(new URL(req.url).searchParams.get('month') ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
  const from = `${month}-01`;
  const next = new Date(from + 'T12:00:00'); next.setMonth(next.getMonth() + 1);
  const till = next.toISOString().slice(0, 10);

  try {
    const hours = new Array(24).fill(0);
    const byPerson = new Map<string, { total: number; bills: number }>();
    let bills = 0, total = 0, tips = 0, discounts = 0, persons = 0, personBills = 0;
    let refundCount = 0, refundTotal = 0;

    // Raw pager (insights needs fields the lib summary drops).
    let path: string | null = `/bills/${conn.merchantId}-${conn.placeId}?from=${from}&till=${till}&limit=100`;
    let guard = 0;

    const { clientId, clientSecret, merchantId, placeId } = conn;
    const authRes = await fetch('https://login.storyous.com/api/auth/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    });
    const auth = await authRes.json();
    if (!auth?.access_token) throw new Error('auth');
    const H = { Authorization: `Bearer ${auth.access_token}` };

    while (path && guard < 30) {
      guard++;
      const res: Response = await fetch(`https://api.storyous.com${path}`, { headers: H });
      if (!res.ok) throw new Error(String(res.status));
      const page: any = await res.json();
      for (const b of page?.data ?? []) {
        if (b.deleted) continue;
        const price = Number(b.finalPrice) || 0;
        if (b.refunded) { refundCount++; refundTotal += price; continue; }
        bills++;
        total += price;
        tips += Number(b.tips) || 0;
        discounts += Number(b.discount) || 0;
        const t = String(b.paidAt ?? b.createdAt ?? '');
        const h = parseInt(t.slice(11, 13));
        if (Number.isFinite(h) && h >= 0 && h < 24) hours[h] += price;
        const who = b.paidBy?.fullName ?? b.createdBy?.fullName;
        if (who) {
          const cur = byPerson.get(who) ?? { total: 0, bills: 0 };
          cur.total += price; cur.bills++;
          byPerson.set(who, cur);
        }
        if (Number(b.personCount) > 0) { persons += Number(b.personCount); personBills++; }
      }
      path = page?.nextPage ? String(page.nextPage).replace('https://api.storyous.com', '') : null;
    }

    return NextResponse.json({
      connected: true, month, bills, total, tips, discounts,
      avgBill: bills ? Math.round(total / bills) : 0,
      avgPersons: personBills ? Math.round((persons / personBills) * 10) / 10 : null,
      hours,
      byPerson: Array.from(byPerson.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total).slice(0, 10),
      refunds: { count: refundCount, total: refundTotal },
    });
  } catch {
    return NextResponse.json({ connected: true, error: 'Pokladna teď neodpovídá.' }, { status: 502 });
  }
}
