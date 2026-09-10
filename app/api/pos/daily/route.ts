// Co se dnes protočilo — živě z pokladny, po dnech a po produktech.
//
// Tři pohledy na tytéž peníze, které se musí potkat:
//   1. účtenky z pokladny (pravda o tom, co se prodalo a jak se platilo),
//   2. naše uložené prodeje po produktech (z nich se odepisuje sklad),
//   3. uzávěrky (co lidé napočítali v kase).
//
// Když se rozejdou, je to informace, ne chyba k zamlčení. Endpoint proto ke
// každému rozdílu vrací i důvod: nesesynchronizované účtenky, položka bez
// ceny v menu, refundace, účtenka po půlnoci.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getConnection, paymentLabel } from '@/lib/storyous';
import { billsOfDays, productsFromMirror, mirrorCovers, soldLines, soldDays, type SoldLine } from '@/lib/posMirror';
import { pragueToday, businessDayOf, dayPlus, pragueHourOf, NIGHT_CUTOFF_HOUR } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

interface DayRow {
  day: string;
  bills: number;
  cash: number;
  card: number;
  other: number;
  total: number;
  tips: number;
  tipsCash: number;
  tipsCard: number;
  discounts: number;
  refundCount: number;
  refundTotal: number;
  persons: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'employer') {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ connected: false });
  const teamId = u.team_id as number;

  const sp = new URL(req.url).searchParams;
  const today = pragueToday();
  const from = ISO.test(sp.get('from') ?? '') ? (sp.get('from') as string) : today;
  const to = ISO.test(sp.get('to') ?? '') ? (sp.get('to') as string) : from;
  if (to < from) return NextResponse.json({ error: 'Období je obráceně' }, { status: 400 });
  // Strop drží jeden požadavek v rozumné době — delší období patří do měsíčních
  // přehledů, ne do živého pohledu na dnešek.
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  if (!Number.isFinite(span) || span > 92) {
    return NextResponse.json({ error: 'Nejvýš tři měsíce najednou.' }, { status: 400 });
  }

  const conn = await getConnection(teamId);
  if (!conn) return NextResponse.json({ connected: false });

  const days = new Map<string, DayRow>();
  const blank = (day: string): DayRow => ({
    day, bills: 0, cash: 0, card: 0, other: 0, total: 0,
    tips: 0, tipsCash: 0, tipsCard: 0, discounts: 0,
    refundCount: 0, refundTotal: 0, persons: 0,
  });

  let byPerson = new Map<string, { total: number; bills: number }>();
  const hours = new Array(24).fill(0);

  // Účtenky ze zrcadla — pokladna se tu už nevolá. Když zrcadlo období
  // nepokrývá (starší než první synchronizace), řekne se to místo nul.
  const methodsTotal: Record<string, number> = {};
  let covered = true;
  try {
    covered = await mirrorCovers(teamId, from);
    for (const b of await billsOfDays(teamId, from, to)) {
      if (b.deleted) continue;
      const day = b.day;
      const row = days.get(day) ?? blank(day);
      const price = b.finalPrice;
      if (b.refunded) {
        row.refundCount++; row.refundTotal += price;
        days.set(day, row);
        continue;
      }
      row.bills++;
      row.total += price;
      row.tips += b.tips;
      row.cash += b.buckets.cash; row.card += b.buckets.card; row.other += b.buckets.other;
      if (b.buckets.cash >= b.buckets.card) row.tipsCash += b.tips; else row.tipsCard += b.tips;
      for (const [m, v] of Object.entries(b.buckets.methods)) methodsTotal[m] = (methodsTotal[m] ?? 0) + v;
      row.discounts += b.discount;
      if (b.personCount) row.persons += b.personCount;
      days.set(day, row);

      // Hodina podle pražských hodin na zdi — getHours() by na serveru dalo UTC.
      const when = new Date(b.paidAt ?? b.createdAt);
      const localH = pragueHourOf(when);
      if (localH != null) hours[localH] += price;

      const who = b.paidByName ?? b.createdByName;
      if (who) {
        const cur = byPerson.get(who) ?? { total: 0, bills: 0 };
        cur.total += price; cur.bills++;
        byPerson.set(who, cur);
      }
    }
  } catch {
    return NextResponse.json({ connected: true, error: 'Zrcadlo pokladny není připravené — spusť migraci a synchronizaci v Nastavení → Pokladna.' }, { status: 502 });
  }

  // ---- co se prodalo, po produktech (z položek účtenek v zrcadle) ----
  let sales: SoldLine[] = [];
  let itemsPending = 0;
  try {
    sales = await soldLines(teamId, from, to);
    const [pend] = await sql`
      SELECT COUNT(*)::int AS n FROM pos_bills
      WHERE team_id = ${teamId} AND day >= ${from} AND day <= ${to} AND deleted = FALSE AND items_synced = FALSE`;
    itemsPending = Number(pend?.n) || 0;
  } catch { /* tabulka ještě není — zůstane prázdné */ }

  const priceById = await productsFromMirror(teamId);
  const menuError: string | null = priceById.size === 0 ? 'Katalog z pokladny se ještě nesynchronizoval — u položek zatím chybí ceny.' : null;

  const noPrice: string[] = [];
  const items = sales.map(s => {
    const menu = priceById.get(s.productId);
    const qty = s.qty;
    // Skutečná cena z účtenky má přednost; ceníková jen když na řádku chybí.
    const price = s.hasPrice && qty > 0 ? Math.round((s.revenue / qty) * 100) / 100 : (menu?.price ?? null);
    if (price == null) noPrice.push(menu?.name ?? s.name ?? s.productId);
    return {
      productId: s.productId,
      name: menu?.name ?? s.name ?? s.productId,
      category: menu?.category ?? null,
      qty,
      price,
      revenue: s.hasPrice ? s.revenue : (price != null ? Math.round(price * qty) : null),
    };
  }).sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));

  // ---- uzávěrky za stejné období ----
  let closingRows: any[] = [];
  try {
    closingRows = await sql`
      SELECT COALESCE(cc.shift_date, cc.date) AS day,
             SUM(COALESCE(cc.cash_revenue, 0))::int AS cash,
             SUM(COALESCE(cc.card_revenue, 0))::int AS card,
             COUNT(*)::int AS n
      FROM cash_closings cc
      WHERE cc.team_id = ${teamId} AND cc.covered_by IS NULL AND cc.event_id IS NULL
        AND COALESCE(cc.shift_date, cc.date) >= ${from}
        AND COALESCE(cc.shift_date, cc.date) <= ${to}
      GROUP BY 1`;
  } catch { /* bez uzávěrek se prostě neporovná */ }
  const closingByDay = new Map(closingRows.map((c: any) => [String(c.day), c]));

  // ---- jak čerstvá data máme ----
  let lastSyncAt: string | null = null;
  let recordedDays = 0;
  try {
    const [c] = await sql`SELECT last_sync_at FROM pos_connections WHERE team_id = ${teamId}`;
    lastSyncAt = c?.last_sync_at ?? null;
    recordedDays = await soldDays(teamId, from, to);
  } catch { /* volitelné */ }

  const list = Array.from(days.values()).sort((a, b) => a.day.localeCompare(b.day));
  const sum = <K extends keyof DayRow>(k: K) => list.reduce((s, d) => s + (d[k] as number), 0);
  const posTotal = sum('total');
  const productRevenue = items.reduce((s, i) => s + (i.revenue ?? 0), 0);
  const soldQty = items.reduce((s, i) => s + i.qty, 0);

  // ---- proč to nesedí ----
  const notes: { tone: 'good' | 'warn' | 'info'; title: string; text: string }[] = [];
  const gap = posTotal - productRevenue;
  const expectedDays = span + 1;

  if (items.length === 0 && posTotal > 0) {
    notes.push({
      tone: itemsPending > 0 ? 'info' : 'warn',
      title: itemsPending > 0 ? `Položky ${itemsPending} účtenek se ještě stahují` : 'Rozpis po produktech chybí',
      text: itemsPending > 0
        ? 'Účtenky už tu jsou, jejich položky pokladna posílá po jedné — za chvíli se rozpis doplní sám.'
        : 'Účtenky pokladna vrátila, ale bez položek. Zkus Synchronizovat teď v Nastavení → Pokladna; do té doby jsou dole jen peníze, ne položky.',
    });
  } else if (itemsPending > 0 && posTotal > 0) {
    notes.push({
      tone: 'info',
      title: `Položky ${itemsPending} účtenek se ještě stahují`,
      text: 'Rozpis po produktech se doplní sám, jak pokladna položky pošle.',
    });
  }

  if (noPrice.length) {
    const uniq = Array.from(new Set(noPrice));
    notes.push({
      tone: 'info',
      title: `${uniq.length} položek nemá v menu cenu`,
      text: `Do součtu po produktech se nezapočítaly (${uniq.slice(0, 4).join(', ')}${uniq.length > 4 ? ' a další' : ''}). Peníze nahoře jsou z účtenek, takže platí i tak.`,
    });
  }

  if (items.length > 0 && Math.abs(gap) > Math.max(50, posTotal * 0.02)) {
    notes.push({
      tone: 'info',
      title: `Rozpis po produktech je o ${Math.abs(gap).toLocaleString('cs-CZ')} Kč ${gap > 0 ? 'nižší' : 'vyšší'}`,
      text: gap > 0
        ? 'Rozdíl dělají položky bez ceny v menu, slevy na účtence a spropitné — účtenka je vždycky ta hlavní pravda.'
        : 'Ceníková cena je vyšší než co se opravdu vybralo — obvykle slevy nebo ruční úprava ceny na účtence.',
    });
  }

  const refunds = sum('refundTotal');
  if (refunds > 0) {
    notes.push({
      tone: 'warn',
      title: `Refundace ${refunds.toLocaleString('cs-CZ')} Kč`,
      text: `${sum('refundCount')}× vrácená účtenka. Do tržby se nepočítá; stojí za to vědět, co se vracelo.`,
    });
  }


  if (!covered) {
    notes.push({
      tone: 'info',
      title: 'Začátek období je před první synchronizací',
      text: 'Zrcadlo pokladny nemá účtenky tak daleko zpátky. V Nastavení → Pokladna jde načíst historii (třeba 180 dní).',
    });
  }
  if (posTotal === 0 && sum('refundCount') === 0) {
    // Ticho není odpověď: nula může znamenat zavřeno, ještě neotevřeno, nebo
    // že se markuje jinam. Řekneme, co z toho víme.
    const isToday = from === today && to === today;
    notes.push({
      tone: 'info',
      title: isToday ? 'Dnes zatím žádná účtenka' : 'V tomhle období nic neprošlo pokladnou',
      text: isToday
        ? 'Pokladna odpověděla, jen zatím nemá co poslat. Až padne první účtenka, čísla naskočí sama.'
        : 'Pokladna za tyhle dny nevrátila žádnou účtenku — buď bylo zavřeno, nebo se markovalo na jiné provozovně.',
    });
  } else if (!notes.length) {
    notes.push({
      tone: 'good',
      title: 'Data sedí',
      text: 'Peníze z účtenek i rozpis po produktech odpovídají. Žádné refundace, žádná chybějící cena.',
    });
  }

  return NextResponse.json({
    connected: true,
    from, to, today,
    placeName: conn.placeName ?? null,
    menuError,
    lastSyncAt,
    totals: {
      bills: sum('bills'),
      total: posTotal,
      cash: sum('cash'),
      card: sum('card'),
      other: sum('other'),
      tips: sum('tips'),
      tipsCash: sum('tipsCash'),
      tipsCard: sum('tipsCard'),
      discounts: sum('discounts'),
      refundCount: sum('refundCount'),
      refundTotal: refunds,
      methods: Object.entries(methodsTotal).map(([id, amount]) => ({ id, label: paymentLabel(id), amount: Math.round(amount) }))
        .sort((a, b) => b.amount - a.amount),
      avgBill: sum('bills') > 0 ? Math.round(posTotal / sum('bills')) : 0,
      soldQty,
      productRevenue,
    },
    days: list.map(d => {
      const cl = closingByDay.get(d.day);
      const declared = cl ? Number(cl.cash) + Number(cl.card) : null;
      return {
        ...d,
        closings: cl ? Number(cl.n) : 0,
        declared,
        diff: declared != null ? declared - d.total : null,
      };
    }),
    hours,
    byPerson: Array.from(byPerson.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total).slice(0, 10),
    items: items.slice(0, 100),
    notes,
    note: `Účtenky vystavené do ${NIGHT_CUTOFF_HOUR}:00 patří k předchozímu dni.`,
  });
}
