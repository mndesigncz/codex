// Finance: where the money goes. One month of truth for the employer —
// revenue from closings, every expense the app knows about (receipts, cash
// movements, supplier orders, daily payouts), computed wages, and rule-based
// advice built from the numbers the app already collects.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { cashDifference, normalizeMovements } from '@/lib/closing';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const WEEKDAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

async function employer() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${meId}`;
  if (!u || u.role !== 'employer' || !u.team_id) return null;
  return u;
}

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
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
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
      tips_in_drawer: c.tips_in_drawer ?? null,
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
        AND created_at >= ${month + '-01'}::timestamp
        AND created_at < (${month + '-01'}::timestamp + INTERVAL '1 month')`;
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
        AND COALESCE(received_at, created_at) >= ${month + '-01'}::timestamp
        AND COALESCE(received_at, created_at) < (${month + '-01'}::timestamp + INTERVAL '1 month')`;
    for (const o of orders as any[]) {
      ledger.push({
        date: String(o.received_at ?? o.created_at).slice(0, 10), kind: 'order',
        label: `Objednávka — ${o.supplier ?? 'dodavatel'}`, amount: num(o.total_cost),
      });
    }
  } catch { /* ignore */ }

  ledger.sort((a, b) => b.date.localeCompare(a.date));

  // ---- Wages from attendance × hourly rates (the payroll view of labour). ----
  let wagesWorked = 0;
  try {
    const entries = await sql`
      SELECT te.clock_in, te.clock_out, us.hourly_rate FROM time_entries te
      JOIN users us ON us.id = te.employee_id
      WHERE te.team_id = ${u.team_id} AND te.clock_out IS NOT NULL
        AND te.clock_in >= ${month + '-01'}::timestamp
        AND te.clock_in < (${month + '-01'}::timestamp + INTERVAL '1 month')`;
    for (const e of entries as any[]) {
      const rate = num(e.hourly_rate);
      if (rate <= 0) continue;
      const ms = new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime();
      if (ms > 0) wagesWorked += Math.round((ms / 3600000) * rate);
    }
  } catch { /* ignore */ }

  const spent = (kind: string) => ledger.filter((r) => r.kind === kind).reduce((s, r) => s + r.amount, 0);
  const purchases = spent('receipt') + spent('order') + spent('expense');
  const wagesCash = spent('wage');
  const totalOut = purchases + wagesCash;

  // ---- Stock value: money sitting on the shelves. ----
  let stockValue = 0; let stockTop: { name: string; value: number }[] = [];
  try {
    const items = await sql`
      SELECT name, quantity, unit_cost FROM inventory_items
      WHERE team_id = ${u.team_id} AND unit_cost IS NOT NULL AND archived IS NOT TRUE`;
    const valued = (items as any[])
      .map((i) => ({ name: i.name, value: Math.max(0, num(i.quantity)) * num(i.unit_cost) }))
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

  return NextResponse.json({
    month, prevMonth,
    summary: {
      revenue, cash, card, tips,
      purchases, wagesCash, wagesWorked, totalOut,
      gross: revenue - purchases - Math.max(wagesCash, wagesWorked),
      stockValue,
      prevRevenue,
      closingsCount: real.length,
      diffSum, diffAbs,
    },
    ledger,
    insights,
  });
}
