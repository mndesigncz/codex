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
import { getConnection, menuProducts } from '@/lib/storyous';
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
  let unreadable = 0;

  try {
    const { clientId, clientSecret } = conn;
    const authRes = await fetch('https://login.storyous.com/api/auth/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    });
    const auth = await authRes.json();
    if (!auth?.access_token) throw new Error('auth');
    const H = { Authorization: `Bearer ${auth.access_token}` };

    // O den dál, ať se zachytí i noční účtenky posledního dne období.
    let path: string | null =
      `/bills/${conn.merchantId}-${conn.placeId}?from=${from}&till=${dayPlus(to, 2)}&limit=100`;
    let guard = 0;
    while (path && guard < 60) {
      guard++;
      const res: Response = await fetch(`https://api.storyous.com${path}`, { headers: H });
      if (!res.ok) throw new Error(String(res.status));
      const page: any = await res.json();
      for (const b of page?.data ?? []) {
        if (b.deleted) continue;
        const when = new Date(String(b.paidAt ?? b.createdAt ?? ''));
        const day = businessDayOf(when);
        if (!day) { unreadable++; continue; }
        if (day < from || day > to) continue;
        const row = days.get(day) ?? blank(day);
        const price = Number(b.finalPrice) || 0;
        if (b.refunded) {
          row.refundCount++; row.refundTotal += price;
          days.set(day, row);
          continue;
        }
        row.bills++;
        row.total += price;
        const tip = Number(b.tips) || 0;
        row.tips += tip;
        const pm = String(b.paymentMethod ?? '').toLowerCase();
        if (pm === 'cash') { row.cash += price; row.tipsCash += tip; }
        else if (pm.includes('card')) { row.card += price; row.tipsCard += tip; }
        else { row.other += price; }
        row.discounts += Number(b.discount) || 0;
        if (Number(b.personCount) > 0) row.persons += Number(b.personCount);
        days.set(day, row);

        // Hodina podle pražských hodin na zdi — getHours() by na serveru dalo UTC.
        const localH = pragueHourOf(when);
        if (localH != null) hours[localH] += price;

        const who = b.paidBy?.fullName ?? b.createdBy?.fullName;
        if (who) {
          const cur = byPerson.get(who) ?? { total: 0, bills: 0 };
          cur.total += price; cur.bills++;
          byPerson.set(who, cur);
        }
      }
      path = page?.nextPage ? String(page.nextPage).replace('https://api.storyous.com', '') : null;
    }
  } catch {
    return NextResponse.json({ connected: true, error: 'Pokladna teď neodpovídá — zkus to za chvíli.' }, { status: 502 });
  }

  // ---- co se prodalo, po produktech (z našich uložených prodejů) ----
  let sales: any[] = [];
  try {
    sales = await sql`
      SELECT product_id AS "productId", MAX(product_name) AS name, SUM(qty)::float AS qty
      FROM pos_sales
      WHERE team_id = ${teamId} AND date >= ${from} AND date <= ${to}
      GROUP BY product_id`;
  } catch { /* tabulka ještě není — zůstane prázdné */ }

  let priceById = new Map<string, { price: number | null; category: string | null; name: string }>();
  let menuError: string | null = null;
  try {
    const products = await menuProducts(conn);
    priceById = new Map(products.map(p => [p.productId, { price: p.price ?? null, category: p.category ?? null, name: p.name }]));
  } catch { menuError = 'Menu z pokladny se nepodařilo načíst — u položek chybí ceny.'; }

  const noPrice: string[] = [];
  const items = (sales as any[]).map(s => {
    const menu = priceById.get(s.productId);
    const price = menu?.price ?? null;
    const qty = Number(s.qty) || 0;
    if (price == null) noPrice.push(menu?.name ?? s.name ?? s.productId);
    return {
      productId: s.productId,
      name: menu?.name ?? s.name ?? s.productId,
      category: menu?.category ?? null,
      qty,
      price,
      revenue: price != null ? Math.round(price * qty) : null,
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
    const [d] = await sql`
      SELECT COUNT(DISTINCT date)::int AS n FROM pos_sales
      WHERE team_id = ${teamId} AND date >= ${from} AND date <= ${to}`;
    recordedDays = Number(d?.n) || 0;
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
      tone: 'warn',
      title: 'Rozpis po produktech chybí',
      text: 'Účtenky pokladna vrátila, ale co přesně se prodalo, se do aplikace ještě nesynchronizovalo. Spusť synchronizaci v Recepturách — do té doby jsou dole jen peníze, ne položky.',
    });
  } else if (recordedDays < expectedDays && posTotal > 0) {
    notes.push({
      tone: 'info',
      title: `Rozpis pokrývá ${recordedDays} z ${expectedDays} dní`,
      text: 'Prodeje po produktech se ukládají při synchronizaci; dny před jejím zapnutím zůstanou bez rozpisu, i když peníze z účtenek sedí.',
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

  if (unreadable > 0) {
    notes.push({
      tone: 'warn',
      title: `${unreadable} účtenek bez čitelného času`,
      text: 'Nešly přiřadit ke dni, takže v přehledu nejsou. Pokud jich přibývá, ozvi se — je to na straně pokladny.',
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
