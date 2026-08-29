// Kde se skladová položka používá: produkty z kasy, které ji mají v receptuře.
// Čte jen naši tabulku párování — žádné volání pokladny, aby se to dalo bez
// váhání zobrazit přímo u položky ve skladu.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getConnection, menuProducts } from '@/lib/storyous';
import { audit } from '@/lib/audit';

/** Receptury mění jen vedení — stejná podmínka jako v /api/pos/products. */
async function employer() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${id}`;
  if (!u || u.role !== 'employer' || !u.team_id) return null;
  return u;
}

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ usage: {} });

  // Hledání produktu pro přiřazení „odsud do receptury". Menu má u větších
  // podniků skoro tisíc položek — posílat ho celé kvůli našeptávači by bylo
  // 90 kB na každé otevření skladové položky.
  const q = String(new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q) {
    try {
      const conn = await getConnection(u.team_id);
      if (!conn) return NextResponse.json({ products: [] });
      const all = await menuProducts(conn);
      const needle = q.toLowerCase();
      const products = all
        .filter(p => p.name.toLowerCase().includes(needle) || (p.category ?? '').toLowerCase().includes(needle))
        .slice(0, 20)
        .map(p => ({ productId: p.productId, name: p.name, category: p.category, price: p.price }));
      return NextResponse.json({ products });
    } catch {
      return NextResponse.json({ products: [], error: 'Menu z pokladny se teď nepodařilo načíst.' });
    }
  }

  try {
    const rows = await sql`
      SELECT item_id AS "itemId", product_id AS "productId", product_name AS "productName",
             amount_per_sale::float AS amount
      FROM pos_product_map WHERE team_id = ${u.team_id}`;
    const usage: Record<string, { productId: string; productName: string | null; amount: number }[]> = {};
    for (const r of rows as any[]) {
      const key = String(r.itemId);
      (usage[key] ??= []).push({ productId: r.productId, productName: r.productName, amount: r.amount });
    }
    return NextResponse.json({ usage });
  } catch {
    return NextResponse.json({ usage: {} });
  }
}

/** Přidá, upraví nebo odebere JEDNU surovinu v receptuře jednoho produktu.
 *
 *  POST výše nahrazuje celou recepturu — to je správně, když ji člověk edituje
 *  jako celek v Recepturách. Ze skladové položky ale míří opačným směrem:
 *  „tuhle surovinu dej do Blue Lagoonu". Přečíst recepturu, přidat řádek a
 *  poslat ji celou zpátky by přepsalo změny, které mezitím udělal někdo jiný.
 *
 *  { productId, productName?, itemId, amount }  — amount <= 0 surovinu odebere.
 */
export async function PATCH(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const productId = String(b.productId ?? '').trim();
  const itemId = parseInt(b.itemId);
  if (!productId || !Number.isFinite(itemId)) {
    return NextResponse.json({ error: 'Chybí produkt nebo položka' }, { status: 400 });
  }
  const amount = Number(b.amount);
  const productName = b.productName ? String(b.productName).slice(0, 160) : null;

  const [item] = await sql`
    SELECT id, name FROM inventory_items WHERE id = ${itemId} AND team_id = ${u.team_id}`;
  if (!item) return NextResponse.json({ error: 'Položka nenalezena' }, { status: 404 });

  try {
    if (!(amount > 0)) {
      await sql`
        DELETE FROM pos_product_map
        WHERE team_id = ${u.team_id} AND product_id = ${productId} AND item_id = ${itemId}`;
      audit(u.team_id, u.id, 'pos.recipe', 'pos', null, `${productName ?? productId}: −${item.name}`);
      return NextResponse.json({ ok: true, removed: true });
    }
    const [existing] = await sql`
      SELECT 1 FROM pos_product_map
      WHERE team_id = ${u.team_id} AND product_id = ${productId} AND item_id = ${itemId}`;
    if (existing) {
      await sql`
        UPDATE pos_product_map SET amount_per_sale = ${amount},
          product_name = COALESCE(${productName}, product_name)
        WHERE team_id = ${u.team_id} AND product_id = ${productId} AND item_id = ${itemId}`;
    } else {
      await sql`
        INSERT INTO pos_product_map (team_id, product_id, product_name, item_id, amount_per_sale)
        VALUES (${u.team_id}, ${productId}, ${productName}, ${itemId}, ${amount})`;
    }
    try { await sql`DELETE FROM pos_unmapped WHERE team_id = ${u.team_id} AND product_id = ${productId}`; } catch { /* volitelné */ }
    audit(u.team_id, u.id, 'pos.recipe', 'pos', null,
      `${productName ?? productId}: ${item.name} ${amount}`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Receptura není dostupná — spusť /api/init.' }, { status: 400 });
  }
}
