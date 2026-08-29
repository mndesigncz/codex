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
import { pragueHourOf, pragueDayOf, dayPlus, businessDayOf, NIGHT_CUTOFF_HOUR } from '@/lib/pragueTime';

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

    // Účtenky po půlnoci patří k předchozímu obchodnímu dni — proto se stahuje
    // o den navíc. Do měsíčních součtů se pak započítají jen ty, které do
    // měsíce opravdu patří.
    type Bucket = { cash: number; card: number; total: number; bills: number };
    const posByDay = new Map<string, Bucket>();

    // Raw pager (insights needs fields the lib summary drops).
    let path: string | null = `/bills/${conn.merchantId}-${conn.placeId}?from=${from}&till=${dayPlus(till, 1)}&limit=100`;
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
        const t = String(b.paidAt ?? b.createdAt ?? '');
        const when = t ? new Date(t) : null;
        const h = when ? pragueHourOf(when) : null;
        const calDay = when && h != null ? pragueDayOf(when) : null;
        const bizDay = when ? (businessDayOf(when) || null) : null;

        if (!b.refunded && bizDay && bizDay >= from && bizDay < till) {
          const cur = posByDay.get(bizDay) ?? { cash: 0, card: 0, total: 0, bills: 0 };
          const pm = String(b.paymentMethod ?? '').toLowerCase();
          if (pm === 'cash') cur.cash += price; else cur.card += price;
          cur.total += price; cur.bills++;
          posByDay.set(bizDay, cur);
        }

        // Měsíční čísla zůstávají podle kalendářního dne účtenky — aby seděla
        // s tím, co ukazuje pokladna sama.
        if (calDay != null && (calDay < from || calDay >= till)) continue;
        if (b.refunded) { refundCount++; refundTotal += price; continue; }
        bills++;
        total += price;
        tips += Number(b.tips) || 0;
        discounts += Number(b.discount) || 0;
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
        // Stejný začátek i konec znamená, že směnu založilo odpíchnutí a
        // ještě neskončila — délku neznáme. Rozprostřít ji přes celý den by
        // z jednoho člověka udělalo obsazenost od rána do rána.
        if (en === st) continue;
        const h0 = parseInt(st.slice(0, 2), 10);
        const h1 = parseInt(en.slice(0, 2), 10);
        const span = en < st ? (24 - h0) + h1 : h1 - h0;
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

    // ---- uzávěrky proti kase, den po dni ----
    let closingRows: any[] = [];
    try {
      closingRows = await sql`
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
    } catch { /* bez uzávěrek se porovnávat nedá */ }

    const dayMap = new Map<string, any>();
    for (const [day, v] of Array.from(posByDay.entries())) {
      dayMap.set(day, { day, pos: v, cash: 0, card: 0, n: 0, people: null });
    }
    for (const c of closingRows as any[]) {
      const day = String(c.day);
      const row = dayMap.get(day) ?? { day, pos: null, cash: 0, card: 0, n: 0, people: null };
      row.cash = Number(c.cash) || 0; row.card = Number(c.card) || 0;
      row.n = Number(c.n) || 0; row.people = c.people ?? null;
      dayMap.set(day, row);
    }
    const days = Array.from(dayMap.values()).map(r => {
      const posTotal = r.pos ? r.pos.total : null;
      const declared = r.n > 0 ? r.cash + r.card : null;
      return {
        day: r.day, bills: r.pos?.bills ?? 0,
        posCash: r.pos?.cash ?? null, posCard: r.pos?.card ?? null, posTotal,
        declaredCash: r.n > 0 ? r.cash : null, declaredCard: r.n > 0 ? r.card : null, declared,
        diff: posTotal != null && declared != null ? declared - posTotal : null,
        closings: r.n, people: r.people,
      };
    }).sort((a, b) => a.day.localeCompare(b.day));

    const compared = days.filter(d => d.diff != null);
    // 50 Kč je zaokrouhlování a drobné; nad to jde o překlep nebo chybějící platbu.
    const off = compared.filter(d => Math.abs(d.diff as number) > 50)
      .sort((a, b) => Math.abs(b.diff as number) - Math.abs(a.diff as number));
    const missingClosing = days.filter(d => (d.bills ?? 0) > 0 && d.closings === 0);
    const noPosDays = days.filter(d => d.closings > 0 && (d.bills ?? 0) === 0);
    const csDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('cs-CZ');

    const reconcileInsights: { icon: string; title: string; text: string; tone: 'good' | 'warn' | 'info' }[] = [];
    if (compared.length && !off.length) {
      reconcileInsights.push({
        icon: 'check', tone: 'good', title: 'Uzávěrky sedí s pokladnou',
        text: `Porovnáno ${compared.length} dní, nikde rozdíl nad 50 Kč.`,
      });
    }
    if (off.length) {
      const w = off[0];
      reconcileInsights.push({
        icon: 'warning', tone: Math.abs(w.diff as number) > 500 ? 'warn' : 'info',
        title: `${off.length} ${off.length === 1 ? 'den nesedí' : 'dní nesedí'} s pokladnou`,
        text: `Největší rozdíl ${csDate(w.day)}: uzávěrka ${(w.declared ?? 0).toLocaleString('cs-CZ')} Kč proti ${(w.posTotal ?? 0).toLocaleString('cs-CZ')} Kč z kasy${w.people ? ` (${w.people})` : ''}. Nejčastěji překlep v uzávěrce nebo platba, která se do kasy nedostala.`,
      });
    }
    if (missingClosing.length) {
      reconcileInsights.push({
        icon: 'clipboard', tone: 'warn',
        title: `${missingClosing.length} dní bez uzávěrky`,
        text: `V kase je tržba, ale uzávěrku k ní nikdo nevyplnil: ${missingClosing.slice(0, 5).map(d => csDate(d.day)).join(', ')}${missingClosing.length > 5 ? ' a další' : ''}.`,
      });
    }
    if (noPosDays.length) {
      reconcileInsights.push({
        icon: 'bulb', tone: 'info',
        title: `${noPosDays.length} dní má uzávěrku bez účtenek`,
        text: 'Uzávěrka existuje, ale kasa na ten den nic nemá. Buď se markovalo jinam, nebo je uzávěrka na špatném dni.',
      });
    }

    return NextResponse.json({
      connected: true, month, bills, total, tips, discounts,
      staff, staffing, staffingAdvice, avgRate,
      reconcile: {
        days,
        totals: {
          comparedDays: compared.length, offDays: off.length,
          netDiff: compared.reduce((sm, d) => sm + (d.diff as number), 0),
        },
        insights: reconcileInsights,
        note: `Účtenky vystavené do ${NIGHT_CUTOFF_HOUR}:00 se počítají k předchozímu dni.`,
      },
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
