// Finance: where the money goes. One month of truth for the employer —
// revenue from closings, every expense the app knows about (receipts, cash
// movements, supplier orders, daily payouts), computed wages, and rule-based
// advice built from the numbers the app already collects.

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { cashDifference, normalizeMovements } from '@/lib/closing';
import { pragueToday } from '@/lib/pragueTime';
import { wagesTotal } from '@/lib/wages';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const WEEKDAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

async function monthClosings(teamId: number, month: string) {
  try {
    return await sql`
      SELECT cc.*, ev.title AS event_title
      FROM cash_closings cc LEFT JOIN events ev ON ev.id = cc.event_id
      WHERE cc.team_id = ${teamId}
        AND COALESCE(cc.shift_date, cc.date) >= ${month + '-01'}
        AND COALESCE(cc.shift_date, cc.date) <= ${month + '-31'}`;
  } catch {
    return await sql`
      SELECT cc.* FROM cash_closings cc
      WHERE cc.team_id = ${teamId} AND cc.date >= ${month + '-01'} AND cc.date <= ${month + '-31'}`;
  }
}

export async function GET(req: NextRequest) {
  // Kolo 67: finance podle oprávnění, podnik z databáze. Mzdy jsou zvlášť
  // (finance.mzdy) — role může vidět tržby a výdaje, a přitom ne, kolik kdo
  // bere. Vedení má obojí, jeho odpověď je stejná jako dřív.
  const c = await pozaduj('finance.zobrazit');
  if (jeOdpoved(c)) return c;
  const u = { team_id: c.teamId };
  const mzdy = c.role.opravneni.has('finance.mzdy');
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') ?? pragueToday().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
  const [y, m] = month.split('-').map(Number);
  const prevMonth = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;

  // ---- Revenue: closings are the source of truth. Stubs (covered coworkers)
  // carry no revenue of their own; event closings count and stay labelled. ----
  const closings = await monthClosings(u.team_id, month);
  const real = (closings as any[]).filter((c) => !c.covered_by);
  let cash = 0, card = 0, tips = 0, diffSum = 0, diffAbs = 0;
  const byWeekday = new Map<number, { total: number; n: number }>();
  for (const c of real) {
    cash += num(c.cash_revenue); card += num(c.card_revenue); tips += num(c.tips);
    const diff = cashDifference({
      opening_cash: num(c.opening_cash), cash_revenue: num(c.cash_revenue),
      expenses: num(c.expenses), cash_removed: num(c.cash_removed),
      self_payout: num(c.self_payout), closing_cash: num(c.closing_cash),
      tips: num(c.tips), payout_from_register: c.payout_from_register ?? null,
      tips_in_drawer: c.tips_in_drawer ?? null, tips_card: num(c.tips_card),
    });
    diffSum += diff; diffAbs += Math.abs(diff);
    const day = String(c.shift_date ?? c.date);
    const wd = new Date(day + 'T12:00:00').getDay();
    const slot = byWeekday.get(wd) ?? { total: 0, n: 0 };
    slot.total += num(c.cash_revenue) + num(c.card_revenue); slot.n += 1;
    byWeekday.set(wd, slot);
  }
  const revenue = cash + card;

  const prevClosings = await monthClosings(u.team_id, prevMonth);
  const prevRevenue = (prevClosings as any[])
    .filter((c) => !c.covered_by)
    .reduce((s, c) => s + num(c.cash_revenue) + num(c.card_revenue), 0);

  // ---- The ledger: every outgoing crown the app knows about. ----
  type Row = {
    date: string; kind: string; label: string; amount: number;
    receiptId?: number; photoUrl?: string | null; note?: string | null;
  };
  const ledger: Row[] = [];

  // Receipts (purchases on the go).
  let receiptRows: any[] = [];
  try {
    receiptRows = await sql`
      SELECT id, photo_url, supplier, amount, note, created_at FROM receipts
      WHERE team_id = ${u.team_id}
        AND ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague') >= ${month + '-01'}::timestamp
        AND ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague') < (${month + '-01'}::timestamp + INTERVAL '1 month')`;
  } catch { /* not migrated */ }
  for (const r of receiptRows) {
    ledger.push({
      date: String(r.created_at).slice(0, 10), kind: 'receipt',
      label: r.supplier || 'Účtenka', amount: num(r.amount),
      receiptId: r.id, photoUrl: r.photo_url ?? null, note: r.note ?? null,
    });
  }

  // Cash movements + aggregates from closings.
  for (const c of real) {
    const day = String(c.shift_date ?? c.date);
    const movements = normalizeMovements(c.movements);
    const evSuffix = c.event_title ? ` (akce ${c.event_title})` : '';
    if (movements.length) {
      for (const mv of movements) {
        if (mv.kind === 'deposit') continue;
        ledger.push({
          date: day,
          kind: mv.kind === 'payout' ? 'wage' : mv.kind === 'removal' ? 'removal' : 'expense',
          label: (mv.note || (mv.kind === 'payout' ? 'Výplata z kasy' : mv.kind === 'removal' ? 'Odloženo ven' : 'Výdaj z kasy')) + evSuffix,
          amount: mv.amount,
        });
      }
    } else {
      if (num(c.expenses) > 0) ledger.push({ date: day, kind: 'expense', label: 'Výdaje z kasy' + evSuffix, amount: num(c.expenses) });
      if (num(c.self_payout) > 0) ledger.push({ date: day, kind: 'wage', label: 'Denní výplata' + evSuffix, amount: num(c.self_payout) });
    }
  }
  // Covered coworkers' daily payouts live on stub rows.
  for (const c of (closings as any[]).filter((x) => x.covered_by)) {
    if (num(c.self_payout) > 0) {
      ledger.push({ date: String(c.shift_date ?? c.date), kind: 'wage', label: 'Denní výplata (kolega)', amount: num(c.self_payout) });
    }
  }

  // Supplier orders with a price.
  try {
    const orders = await sql`
      SELECT id, supplier, total_cost, received_at, created_at FROM orders
      WHERE team_id = ${u.team_id} AND total_cost IS NOT NULL AND total_cost > 0
        AND ((COALESCE(received_at, created_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague') >= ${month + '-01'}::timestamp
        AND ((COALESCE(received_at, created_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague') < (${month + '-01'}::timestamp + INTERVAL '1 month')`;
    for (const o of orders as any[]) {
      ledger.push({
        date: String(o.received_at ?? o.created_at).slice(0, 10), kind: 'order',
        label: `Objednávka — ${o.supplier ?? 'dodavatel'}`, amount: num(o.total_cost),
      });
    }
  } catch { /* ignore */ }

  // ---- Akce: ruční náklady do výdajů ----------------------------------------
  // events.costs se dosud počítaly jen uvnitř Akcí. Nákup na akci je ale
  // výdaj jako každý jiný, takže patří do přehledu peněz.
  let eventsRevenue = 0, eventsWithClosing = 0, eventsRevenueNoClosing = 0;
  try {
    const evs = await sql`
      SELECT id, title, date, revenue, costs, (SELECT COUNT(*)::int FROM cash_closings cc WHERE cc.event_id = events.id) AS closings
      FROM events
      WHERE team_id = ${u.team_id} AND date >= ${month + '-01'} AND date < to_char((${month + '-01'}::date + INTERVAL '1 month'), 'YYYY-MM-DD')
        AND status <> 'cancelled'`;
    for (const e of evs as any[]) {
      if (num(e.costs) > 0) ledger.push({ date: String(e.date), kind: 'expense', label: `Náklady akce — ${e.title}`, amount: num(e.costs) });
      if (num(e.revenue) > 0) {
        eventsRevenue += num(e.revenue);
        // Akce s uzávěrkou už má tržbu v `revenue` (přes uzávěrku). Akce bez
        // uzávěrky ji má jen tady — a její náklady se výš odečítají z hrubého
        // zisku, takže bez připočtení tržby by zisk trestal náklady bez výnosu.
        if (Number(e.closings) > 0) eventsWithClosing++;
        else eventsRevenueNoClosing += num(e.revenue);
      }
    }
  } catch { /* akce nemusí existovat */ }

  // ---- Hostovská strana: objednávky od stolu ---------------------------------
  // Objednávka, která nedotekla do pokladny (nespárovaný stůl nebo položka bez
  // produktu), není v tržbě z uzávěrek. Vedení to má vidět, ne hádat.
  let guest = { orders: 0, total: 0, offPos: 0, offPosTotal: 0, members: 0, newMembers: 0, couponsRedeemed: 0 };
  try {
    const [go] = await sql`
      SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::int AS total,
             COUNT(*) FILTER (WHERE storyous_order_id IS NULL)::int AS off_n,
             COALESCE(SUM(total) FILTER (WHERE storyous_order_id IS NULL), 0)::int AS off_total
      FROM client_orders
      WHERE team_id = ${u.team_id} AND status = 'done'
        AND ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague') >= ${month + '-01'}::timestamp AND ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague') < (${month + '-01'}::timestamp + INTERVAL '1 month')` as any[];
    const [gm] = await sql`
      SELECT COUNT(*)::int AS members,
             COUNT(*) FILTER (WHERE ((joined_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague') >= ${month + '-01'}::timestamp AND ((joined_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague') < (${month + '-01'}::timestamp + INTERVAL '1 month'))::int AS new_members
      FROM client_memberships WHERE team_id = ${u.team_id}` as any[];
    const [gc] = await sql`
      SELECT COUNT(*)::int AS n FROM client_coupon_claims
      WHERE team_id = ${u.team_id} AND ((redeemed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague') >= ${month + '-01'}::timestamp AND ((redeemed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague') < (${month + '-01'}::timestamp + INTERVAL '1 month')` as any[];
    guest = {
      orders: Number(go?.n) || 0, total: Number(go?.total) || 0,
      offPos: Number(go?.off_n) || 0, offPosTotal: Number(go?.off_total) || 0,
      members: Number(gm?.members) || 0, newMembers: Number(gm?.new_members) || 0,
      couponsRedeemed: Number(gc?.n) || 0,
    };
  } catch { /* hostovská část nemusí být zapnutá */ }

  ledger.sort((a, b) => b.date.localeCompare(a.date));

  // ---- Wages from attendance × hourly rates (the payroll view of labour). ----
  let wagesWorked = 0;
  if (mzdy) try {
    // Sazba z členství v podniku ZÁZNAMU, ne ze zrcadla (kolo 62): člen
    // přepnutý jinam by měl mzdu z cizí sazby nebo 0. Stejný výraz jako
    // Přehled organizace, ať dají totéž číslo.
    const entries = await sql`
      SELECT te.clock_in, te.clock_out,
             CASE WHEN m.user_id IS NOT NULL THEN COALESCE(m.hourly_rate, 0)
                  WHEN us.team_id = te.team_id THEN COALESCE(us.hourly_rate, 0) ELSE 0 END AS hourly_rate
      FROM time_entries te
      JOIN users us ON us.id = te.employee_id
      LEFT JOIN team_members m ON m.user_id = te.employee_id AND m.team_id = te.team_id
      WHERE te.team_id = ${u.team_id} AND te.clock_out IS NOT NULL
        AND to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = ${month}`;
    // Jedno pravidlo pro celou aplikaci — viz lib/wages.
    wagesWorked = wagesTotal((entries as any[]).map(e => ({
      ms: new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime(),
      rate: num(e.hourly_rate),
    }))).total;
  } catch { /* ignore */ }

  const spent = (kind: string) => ledger.filter((r) => r.kind === kind).reduce((s, r) => s + r.amount, 0);
  const purchases = spent('receipt') + spent('order') + spent('expense');
  // Bez finance.mzdy se mzdové řádky knihy (denní výplaty) nepošlou vůbec
  // a součty mezd jsou nula — odečtem hrubého výsledku od tržeb by šly
  // dopočítat. `mzdySkryte` říká rozhraní, že nula neznamená „nic".
  if (!mzdy) for (let i = ledger.length - 1; i >= 0; i--) if (ledger[i].kind === 'wage') ledger.splice(i, 1);
  const wagesCash = spent('wage');
  const totalOut = purchases + wagesCash;

  // ---- Stock value: money sitting on the shelves. ----
  let stockValue = 0; let stockTop: { name: string; value: number }[] = [];
  try {
    const items = await sql`
      SELECT name, quantity, unit_cost, package_size, open_amount FROM inventory_items
      WHERE team_id = ${u.team_id} AND unit_cost IS NOT NULL AND archived IS NOT TRUE`;
    const valued = (items as any[])
      // Načatá lahev je pořád majetek. quantity drží jen zapečetěná balení,
      // zbytek v otevřeném se počítá jeho podílem z ceny balení.
      .map((i) => {
        const pkg = num(i.package_size);
        const openShare = pkg > 0 ? Math.max(0, num(i.open_amount)) / pkg : 0;
        return {
          name: i.name,
          value: Math.round((Math.max(0, num(i.quantity)) + openShare) * num(i.unit_cost)),
        };
      })
      .filter((i) => i.value > 0)
      .sort((a, b) => b.value - a.value);
    stockValue = valued.reduce((s, i) => s + i.value, 0);
    stockTop = valued.slice(0, 3);
  } catch { /* ignore */ }

  // ---- Advice, computed from the month's own numbers. ----
  const insights: { icon: string; title: string; text: string; tone: 'good' | 'warn' | 'info' }[] = [];
  if (prevRevenue > 0 && revenue > 0) {
    const pct = Math.round(((revenue - prevRevenue) / prevRevenue) * 100);
    insights.push({
      icon: 'trend', tone: pct >= 0 ? 'good' : 'warn',
      title: `Tržby ${pct >= 0 ? '+' : ''}${pct} % proti minulému měsíci`,
      text: pct >= 0
        ? 'Držíte růst — mrkni, který den táhne nejvíc, a zopakuj, co tam funguje.'
        : 'Pokles stojí za pozornost: srovnej slabé dny níže a zvaž akci nebo úpravu otevíracích hodin.',
    });
  }
  const laborBase = Math.max(wagesWorked, wagesCash);
  if (revenue > 0 && laborBase > 0) {
    const share = Math.round((laborBase / revenue) * 100);
    let target: number | null = null;
    try {
      const [t] = await sql`SELECT labor_target_pct FROM teams WHERE id = ${u.team_id}`;
      target = t?.labor_target_pct ?? null;
    } catch { /* ignore */ }
    const goal = target ?? 30;
    insights.push({
      icon: 'users', tone: share <= goal ? 'good' : 'warn',
      title: `Mzdy tvoří ${share} % tržeb${target != null ? ` (cíl ${goal} %)` : ''}`,
      text: share <= goal
        ? 'Podíl mezd je v pořádku.'
        : 'Podíl mezd je nad cílem — pomůže kratší překryv směn v slabých hodinách nebo víc směn v silných dnech.',
    });
  }
  const wk = Array.from(byWeekday.entries()).filter(([, v]) => v.n >= 2)
    .map(([wd, v]) => ({ wd, avg: v.total / v.n })).sort((a, b) => a.avg - b.avg);
  if (wk.length >= 3) {
    const worst = wk[0], best = wk[wk.length - 1];
    if (best.avg > 0 && worst.avg / best.avg < 0.6) {
      insights.push({
        icon: 'calendar', tone: 'info',
        title: `Nejslabší den je ${WEEKDAYS[worst.wd]} (Ø ${Math.round(worst.avg).toLocaleString('cs-CZ')} Kč)`,
        text: `Nejsilnější ${WEEKDAYS[best.wd]} dělá Ø ${Math.round(best.avg).toLocaleString('cs-CZ')} Kč. Slabý den unese kratší směnu, akci nebo speciální nabídku.`,
      });
    }
  }
  if (diffAbs > 200) {
    insights.push({
      icon: 'warning', tone: 'warn',
      title: `Rozdíly v kase za měsíc: ${diffSum >= 0 ? '+' : ''}${diffSum.toLocaleString('cs-CZ')} Kč (celkem ±${diffAbs.toLocaleString('cs-CZ')})`,
      text: 'Projdi uzávěrky s rozdílem v Přehledech — nejčastěji jde o nezapsaný výdaj nebo rozměňování. Počítání bankovek v uzávěrce rozdíly srazí.',
    });
  }
  const supplierSums = new Map<string, number>();
  for (const r of ledger) if (r.kind === 'receipt' || r.kind === 'order') {
    supplierSums.set(r.label, (supplierSums.get(r.label) ?? 0) + r.amount);
  }
  const topSup = Array.from(supplierSums.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topSup && purchases > 0 && topSup[1] / purchases > 0.5 && topSup[1] > 1000) {
    insights.push({
      icon: 'box', tone: 'info',
      title: `${Math.round((topSup[1] / purchases) * 100)} % nákupů jde přes „${topSup[0]}"`,
      text: 'U dominantního dodavatele se vyplatí vyjednat množstevní slevu — nebo aspoň jednou za čas porovnat ceny jinde.',
    });
  }
  if (revenue > 0 && card > 0) {
    const cardShare = Math.round((card / revenue) * 100);
    insights.push({
      icon: 'clipboard', tone: 'info',
      title: `${cardShare} % tržeb jde přes kartu`,
      text: cardShare > 60
        ? 'Vysoký podíl karet = poplatky. Zkontroluj sazbu u svého terminálu; u vysokých objemů jde často vyjednat nižší.'
        : 'Poměr hotovost/karta je zdravý.',
    });
  }
  if (stockValue > 0 && revenue > 0 && stockValue > revenue * 0.5) {
    insights.push({
      icon: 'box', tone: 'warn',
      title: `Ve skladu leží ${stockValue.toLocaleString('cs-CZ')} Kč`,
      text: `Nejvíc drží ${stockTop.map((i) => `${i.name} (${i.value.toLocaleString('cs-CZ')} Kč)`).join(', ')}. Zvaž menší objednávky častěji — peníze ve skladu nevydělávají.`,
    });
  }
  if (tips > 0) {
    insights.push({
      icon: 'award', tone: 'good',
      title: `Spropitné za měsíc: ${tips.toLocaleString('cs-CZ')} Kč`,
      text: 'Hezký signál spokojenosti hostů — propiš ho do odměn, ať ho tým vidí.',
    });
  }

  if (guest.offPos > 0) {
    insights.push({
      tone: 'warn', icon: 'warning',
      title: `${guest.offPos}× objednávka od stolu nedotekla do pokladny (${guest.offPosTotal.toLocaleString('cs-CZ')} Kč)`,
      text: 'Tyhle tržby nejsou v uzávěrce ani v pokladně. Spáruj stoly s pokladnou a doplň produktům položky z kasy, jinak čísla nesedí.',
    });
  }
  if (eventsWithClosing > 0) {
    insights.push({
      tone: 'info', icon: 'calendarCheck',
      title: `${eventsWithClosing}× akce má vyplněnou tržbu i uzávěrku`,
      text: 'Tržba z uzávěrky je v přehledu; ruční výsledek u akce je jen pro ni. Ať nepočítáš totéž dvakrát, drž se jednoho zdroje.',
    });
  }
  if (guest.couponsRedeemed > 0) {
    insights.push({
      tone: 'info', icon: 'gift',
      title: `Uplatněno ${guest.couponsRedeemed} věrnostních kuponů`,
      text: 'Odměny se vydávají ze skladu, ale nemají vlastní náklad. Počítej s nimi při marži, nebo jim dej cenu v Menu.',
    });
  }

  return NextResponse.json({
    month, prevMonth,
    summary: {
      revenue, cash, card, tips,
      purchases, wagesCash, wagesWorked, totalOut,
      gross: revenue + eventsRevenueNoClosing - purchases - Math.max(wagesCash, wagesWorked),
      stockValue,
      prevRevenue,
      closingsCount: real.length,
      diffSum, diffAbs,
      eventsRevenue,
      mzdySkryte: !mzdy,
    },
    guest,
    ledger,
    insights,
  });
}
