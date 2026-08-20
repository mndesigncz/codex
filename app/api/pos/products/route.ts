// Product recipes: which stock items one sold product consumes, and how much.
// A glass of wine = 150 ml from the bottle; svařák = 200 ml wine + spices.
// GET also serves the "map me" queue — what sold recently without a recipe.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getConnection, menuProducts } from '@/lib/storyous';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function employer() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id FROM users WHERE id = ${id}`;
  if (!u || u.role !== 'employer' || !u.team_id) return null;
  return u;
}

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const conn = await getConnection(u.team_id);
  if (!conn) return NextResponse.json({ connected: false, products: [], recipes: [], unmapped: [] });

  let products: any[] = [];
  try { products = await menuProducts(conn); }
  catch { return NextResponse.json({ connected: true, products: [], recipes: [], unmapped: [], error: 'Menu se nepodařilo načíst.' }); }

  // Recipes grouped per product.
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT m.product_id AS "productId", m.product_name AS "productName",
             m.item_id AS "itemId", m.amount_per_sale AS "amountPerSale",
             i.name AS "itemName", COALESCE(i.content_unit, i.unit) AS "itemUnit", i.package_size AS "packageSize"
      FROM pos_product_map m
      LEFT JOIN inventory_items i ON i.id = m.item_id
      WHERE m.team_id = ${u.team_id}`;
  } catch { /* not migrated */ }
  const grouped = new Map<string, any>();
  for (const r of rows) {
    const g = grouped.get(r.productId) ?? { productId: r.productId, productName: r.productName, ingredients: [] };
    g.ingredients.push({
      itemId: r.itemId, amount: Number(r.amountPerSale) || 1,
      itemName: r.itemName, itemUnit: r.itemUnit, packageSize: r.packageSize != null ? Number(r.packageSize) : null,
    });
    grouped.set(r.productId, g);
  }

  // "Map me" queue: best sellers without a recipe first.
  let unmapped: any[] = [];
  try {
    unmapped = await sql`
      SELECT product_id AS "productId", product_name AS "productName", sold_count AS "soldCount"
      FROM pos_unmapped
      WHERE team_id = ${u.team_id} AND product_id NOT IN (
        SELECT product_id FROM pos_product_map WHERE team_id = ${u.team_id})
      ORDER BY sold_count DESC LIMIT 20`;
  } catch { /* not migrated */ }

  return NextResponse.json({
    connected: true, products,
    recipes: Array.from(grouped.values()),
    unmapped,
  });
}

// Replace the whole recipe of one product: { productId, productName, ingredients: [{itemId, amount}] }.
// Empty ingredients = remove the recipe.
export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const productId = String(b.productId ?? '').trim();
  if (!productId) return NextResponse.json({ error: 'Chybí produkt' }, { status: 400 });
  const raw = Array.isArray(b.ingredients) ? b.ingredients : [];
  const ingredients: { itemId: number; amount: number }[] = [];
  for (const ing of raw.slice(0, 12)) {
    const itemId = parseInt(ing?.itemId);
    const amount = Number(ing?.amount);
    if (!Number.isFinite(itemId)) continue;
    ingredients.push({ itemId, amount: Number.isFinite(amount) && amount > 0 ? amount : 1 });
  }
  try {
    await sql`DELETE FROM pos_product_map WHERE team_id = ${u.team_id} AND product_id = ${productId}`;
    for (const ing of ingredients) {
      const [item] = await sql`SELECT id FROM inventory_items WHERE id = ${ing.itemId} AND team_id = ${u.team_id}`;
      if (!item) continue;
      await sql`
        INSERT INTO pos_product_map (team_id, product_id, product_name, item_id, amount_per_sale)
        VALUES (${u.team_id}, ${productId}, ${b.productName ? String(b.productName).slice(0, 160) : null}, ${ing.itemId}, ${ing.amount})
        ON CONFLICT DO NOTHING`;
    }
    if (ingredients.length) {
      try { await sql`DELETE FROM pos_unmapped WHERE team_id = ${u.team_id} AND product_id = ${productId}`; } catch {}
    }
    audit(u.team_id, u.id, 'pos.recipe', 'pos', null,
      `${b.productName ?? productId}: ${ingredients.length} ingrediencí`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Receptura není dostupná — spusť /api/init.' }, { status: 400 });
  }
}
