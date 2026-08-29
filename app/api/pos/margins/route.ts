// Kolik na čem vyděláváme. Prodeje z pokladny × receptury × ceny ve skladu:
// tržba, náklad na suroviny a marže po položkách za měsíc — a z toho konkrétní
// rady, kde jsou peníze.
//
// Čte prodeje z naší tabulky pos_sales (plní ji synchronizace), ne z pokladny —
// měsíc účtenek by znamenal jeden požadavek na účet.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getConnection, menuProducts } from '@/lib/storyous';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

export interface ProductMargin {
  productId: string;
  name: string;
  category: string | null;
  qty: number;
  price: number | null;
  revenue: number | null;
  /** Náklad na suroviny podle receptury; null = recepturu nemá, nevíme. */
  cost: number | null;
  margin: number | null;
  marginPct: number | null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'employer') {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ connected: false });
  const teamId = u.team_id as number;

  const month = String(new URL(req.url).searchParams.get('month') ?? pragueToday().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });

  const conn = await getConnection(teamId);
  if (!conn) return NextResponse.json({ connected: false });

  // ---- what sold ----
  let sales: any[] = [];
  try {
    sales = await sql`
      SELECT product_id AS "productId", MAX(product_name) AS name, SUM(qty)::float AS qty
      FROM pos_sales
      WHERE team_id = ${teamId} AND date LIKE ${month + '%'}
      GROUP BY product_id`;
  } catch {
    return NextResponse.json({ connected: true, ready: false, error: 'Historie prodejů se teprve sbírá — spusť /api/init.' });
  }

  // ---- recipes and what the ingredients cost ----
  const recipeRows = await sql`
    SELECT m.product_id AS "productId", m.item_id AS "itemId", m.amount_per_sale::float AS amount,
           i.name AS "itemName", i.unit_cost AS "unitCost", i.package_size::float AS "packageSize"
    FROM pos_product_map m
    JOIN inventory_items i ON i.id = m.item_id
    WHERE m.team_id = ${teamId}`;

  const recipeByProduct = new Map<string, any[]>();
  for (const r of recipeRows as any[]) {
    const list = recipeByProduct.get(r.productId) ?? [];
    list.push(r);
    recipeByProduct.set(r.productId, list);
  }

  /** Co stojí suroviny na jednu porci. Cena je za BALENÍ, receptura v obsahu —
   *  bez velikosti balení bychom dělili jablka hruškami, tak radši nic. */
  const costOf = (productId: string): { cost: number | null; missing: string[] } => {
    const rows = recipeByProduct.get(productId);
    if (!rows || !rows.length) return { cost: null, missing: [] };
    let total = 0;
    const missing: string[] = [];
    for (const r of rows) {
      const unitCost = Number(r.unitCost) || 0;
      const pkg = Number(r.packageSize) || 0;
      if (unitCost <= 0) { missing.push(r.itemName); continue; }
      total += pkg > 0 ? (unitCost / pkg) * Number(r.amount) : unitCost * Number(r.amount);
    }
    // Chybí-li cena byť jedné suroviny, náklad by vyšel nižší, než je — a marže
    // vyšší. Nadhodnocená marže je horší než žádná, tak radši přiznáme, že
    // nevíme, a řekneme u čeho.
    if (missing.length) return { cost: null, missing };
    return { cost: Math.round(total), missing };
  };

  // ---- menu prices ----
  let priceById = new Map<string, { price: number | null; category: string | null; name: string }>();
  let menuError: string | null = null;
  try {
    const products = await menuProducts(conn);
    priceById = new Map(products.map(p => [p.productId, {
      price: p.price ?? null, category: p.category ?? null, name: p.name,
    }]));
  } catch { menuError = 'Menu z pokladny se nepodařilo načíst — ceny chybí.'; }

  const missingPrice = new Set<string>();
  const items: ProductMargin[] = (sales as any[]).map(s => {
    const menu = priceById.get(s.productId);
    const price = menu?.price ?? null;
    const qty = Number(s.qty) || 0;
    const { cost, missing } = costOf(s.productId);
    missing.forEach(m => missingPrice.add(m));
    const revenue = price != null ? Math.round(price * qty) : null;
    const margin = price != null && cost != null ? Math.round((price - cost) * qty) : null;
    const marginPct = price != null && cost != null && price > 0
      ? Math.round(((price - cost) / price) * 100) : null;
    return {
      productId: s.productId,
      name: menu?.name ?? s.name ?? s.productId,
      category: menu?.category ?? null,
      qty, price, revenue, cost: cost != null ? cost : null, margin, marginPct,
    };
  }).sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));

  const withCost = items.filter(i => i.cost != null && i.price != null);
  const revenueKnown = withCost.reduce((s, i) => s + (i.revenue ?? 0), 0);
  const cogs = withCost.reduce((s, i) => s + (i.cost ?? 0) * i.qty, 0);
  const totalRevenue = items.reduce((s, i) => s + (i.revenue ?? 0), 0);
  const noRecipe = items.filter(i => i.cost == null);
  const noRecipeShare = totalRevenue > 0
    ? Math.round((noRecipe.reduce((s, i) => s + (i.revenue ?? 0), 0) / totalRevenue) * 100) : 0;

  // ---- advice: only what the numbers actually support ----
  const insights: { icon: string; title: string; text: string; tone: 'good' | 'warn' | 'info' }[] = [];

  if (noRecipe.length) {
    insights.push({
      icon: 'warning', tone: noRecipeShare > 30 ? 'warn' : 'info',
      title: `${noRecipe.length} položek nemá recepturu (${noRecipeShare} % tržby)`,
      text: noRecipeShare > 30
        ? 'U takhle velké části tržby nevíš, co tě stojí — ani se z ní neodepisuje sklad. Začni od těch nejprodávanějších v Recepturách.'
        : 'Doplň jim receptury, ať vidíš marži a sklad se odepisuje sám.',
    });
  }

  if (missingPrice.size) {
    const names = Array.from(missingPrice).slice(0, 4).join(', ');
    insights.push({
      icon: 'coins', tone: 'info',
      title: `${missingPrice.size} surovin nemá zadanou cenu`,
      text: `Bez ceny nejde spočítat marži položek, které je používají (${names}${missingPrice.size > 4 ? ' a další' : ''}). Doplň cenu za balení ve skladu.`,
    });
  }

  if (withCost.length && revenueKnown > 0) {
    const pct = Math.round(((revenueKnown - cogs) / revenueKnown) * 100);
    insights.push({
      icon: 'coins', tone: pct >= 65 ? 'good' : pct >= 50 ? 'info' : 'warn',
      title: `Hrubá marže ${pct} % na tom, co má recepturu`,
      text: pct >= 65
        ? 'Zdravé číslo. Drž ceny surovin pod kontrolou a hlídej, ať se nezvedne odpad.'
        : 'Nižší, než bývá v gastru zvykem. Podívej se na položky s nejhorší marží níž — často stačí upravit gramáž nebo cenu.',
    });
  }

  const worst = withCost.filter(i => i.marginPct != null && i.qty >= 3)
    .sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0))[0];
  if (worst && (worst.marginPct ?? 100) < 45) {
    insights.push({
      icon: 'warning', tone: 'warn',
      title: `Nejhorší marže: ${worst.name} (${worst.marginPct} %)`,
      text: `Prodalo se ${worst.qty}×, suroviny stojí ${worst.cost} Kč z ceny ${worst.price} Kč. Zvaž cenu, gramáž nebo levnější surovinu.`,
    });
  }

  const best = withCost.filter(i => i.marginPct != null && i.qty >= 3)
    .sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0))[0];
  if (best) {
    insights.push({
      icon: 'award', tone: 'good',
      title: `Nejvíc vydělává: ${best.name}`,
      text: `Za měsíc přineslo ${(best.margin ?? 0).toLocaleString('cs-CZ')} Kč nad náklady na suroviny (${best.qty}× prodáno). Tohle se vyplatí tlačit.`,
    });
  }

  // Položky z menu, které se za měsíc neprodaly ani jednou — držet je v nabídce
  // něco stojí (sklad, pozornost hosta).
  const soldIds = new Set(items.map(i => i.productId));
  const dead = Array.from(priceById.entries()).filter(([id]) => !soldIds.has(id));
  if (dead.length >= 5) {
    insights.push({
      icon: 'box', tone: 'info',
      title: `${dead.length} položek menu se za měsíc neprodalo`,
      text: 'Mrtvé položky drží suroviny a rozptylují hosta. Projdi je a zvaž vyřazení nebo přeřazení do sezónní nabídky.',
    });
  }

  return NextResponse.json({
    connected: true,
    ready: true,
    month,
    menuError,
    totals: {
      revenue: totalRevenue,
      revenueKnown,
      cogs,
      margin: revenueKnown - cogs,
      marginPct: revenueKnown > 0 ? Math.round(((revenueKnown - cogs) / revenueKnown) * 100) : null,
      products: items.length,
      noRecipe: noRecipe.length,
      noRecipeShare,
    },
    items: items.slice(0, 60),
    insights,
  });
}
