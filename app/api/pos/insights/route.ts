// Everything else the POS data can tell us about one month: hourly peaks,
// revenue per person, refunds and discounts, average bill and party size.
//
// A pak to nejcennější: špičky proti tomu, kdo na ně byl naplánovaný. Sama
// o sobě je hodinová křivka jen hezký graf — teprve porovnaná s rozvrhem
// řekne, jestli se v šest večer stíhá a jestli se v deset ráno platí lidi za
// prázdnou místnost.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getConnection } from '@/lib/storyous';
import { teamIsPro, PRO_ONLY_MSG } from '@/lib/planServer';
import { pragueHourOf, dayPlus } from '@/lib/pragueTime';

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
  if (!(await teamIsPro(u.team_id))) {
    return NextResponse.json({ error: PRO_ONLY_MSG }, { status: 403 });
  }
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
        const h = t ? pragueHourOf(new Date(t)) : null;
        if (h != null) hours[h] += price;
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

    // ---- kdo na ty hodiny byl naplánovaný ----
    // Směna 18:00–02:00 se počítá i do hodin po půlnoci; poslední hodina se
    // bere jako otevřená, aby 18:00–22:00 pokrylo 18, 19, 20 a 21.
    const staff = new Array(24).fill(0);
    let staffTotal = 0;
    let wageSum = 0, wageHours = 0;
    try {
      const shifts = await sql`
        SELECT s.date, s.start_time, s.end_time, u.hourly_rate
        FROM shifts s LEFT JOIN users u ON u.id = s.employee_id
        WHERE s.team_id = ${u.team_id}
          AND s.date >= ${dayPlus(from, -1)} AND s.date < ${till}`;
      for (const sh of shifts as any[]) {
        const st = String(sh.start_time ?? '').slice(0, 5);
        const en = String(sh.end_time ?? '').slice(0, 5);
        if (!/^\d{2}:\d{2}$/.test(st) || !/^\d{2}:\d{2}$/.test(en)) continue;
        const h0 = parseInt(st.slice(0, 2), 10);
        const h1 = parseInt(en.slice(0, 2), 10);
        const span = en <= st ? (24 - h0) + h1 : h1 - h0;
        for (let k = 0; k < span && k < 24; k++) {
          const h = (h0 + k) % 24;
          // Hodina po půlnoci patří dalšímu dni — mimo měsíc ji nepočítáme.
          const day = h0 + k >= 24 ? dayPlus(String(sh.date), 1) : String(sh.date);
          if (day < from || day >= till) continue;
          staff[h] += 1;
          staffTotal += 1;
          const rate = Number(sh.hourly_rate) || 0;
          if (rate > 0) { wageSum += rate; wageHours += 1; }
        }
      }
    } catch { /* bez rozvrhu prostě nebude srovnání */ }

    const avgRate = wageHours > 0 ? Math.round(wageSum / wageHours) : null;
    const staffing: { hour: number; revenueShare: number; staffShare: number; perHour: number | null }[] = [];
    for (let h = 0; h < 24; h++) {
      if (!hours[h] && !staff[h]) continue;
      staffing.push({
        hour: h,
        revenueShare: total > 0 ? Math.round((hours[h] / total) * 1000) / 10 : 0,
        staffShare: staffTotal > 0 ? Math.round((staff[h] / staffTotal) * 1000) / 10 : 0,
        perHour: staff[h] > 0 ? Math.round(hours[h] / staff[h]) : null,
      });
    }

    const staffingAdvice: { title: string; text: string; tone: 'good' | 'warn' | 'info' }[] = [];
    if (staffTotal > 0 && total > 0) {
      const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
      const tight = staffing.filter(x => x.revenueShare - x.staffShare >= 5)
        .sort((a, b) => (b.revenueShare - b.staffShare) - (a.revenueShare - a.staffShare)).slice(0, 2);
      for (const x of tight) {
        staffingAdvice.push({
          tone: 'warn',
          title: `${hh(x.hour)} táhne ${x.revenueShare} % tržby, ale jen ${x.staffShare} % hodin`,
          text: `Na jednoho člověka tu připadá ${x.perHour != null ? x.perHour.toLocaleString('cs-CZ') + ' Kč' : 'nejvíc z celého dne'} za hodinu. Přidat na tuhle hodinu překryv obvykle zvedne tržbu víc, než stojí mzda.`,
        });
      }
      const idle = staffing.filter(x => x.staffShare >= 4 && x.revenueShare <= 1)
        .sort((a, b) => b.staffShare - a.staffShare).slice(0, 2);
      for (const x of idle) {
        const cost = avgRate != null ? ` Hodina obsluhy vyjde v průměru na ${avgRate} Kč.` : '';
        staffingAdvice.push({
          tone: 'info',
          title: `${hh(x.hour)} je zaplacená, ale skoro bez tržby`,
          text: `Padne sem ${x.staffShare} % naplánovaných hodin a ${x.revenueShare} % tržby. Zvaž posunutí začátku nebo konce směny.${cost}`,
        });
      }
      const bestHour = staffing.filter(x => x.perHour != null)
        .sort((a, b) => (b.perHour ?? 0) - (a.perHour ?? 0))[0];
      if (bestHour && !tight.length) {
        staffingAdvice.push({
          tone: 'good',
          title: `Nejvýnosnější hodina: ${hh(bestHour.hour)}`,
          text: `Jeden člověk tu udělá ${(bestHour.perHour ?? 0).toLocaleString('cs-CZ')} Kč za hodinu. Rozvrh na špičky sedí.`,
        });
      }
    }

    return NextResponse.json({
      connected: true, month, bills, total, tips, discounts,
      staff, staffing, staffingAdvice, avgRate,
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
