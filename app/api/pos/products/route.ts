// Product catalog from the POS + the team's stock mappings. Employer only —
// this is where "Sencha 70 g" learns that one sold pot costs 7 g of stock.

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
  if (!conn) return NextResponse.json({ connected: false, products: [], mappings: [] });
  let products: any[] = [];
  try { products = await menuProducts(conn); }
  catch { return NextResponse.json({ connected: true, products: [], mappings: [], error: 'Menu se nepodařilo načíst.' }); }
  let mappings: any[] = [];
  try {
    mappings = await sql`
      SELECT m.product_id AS "productId", m.product_name AS "productName",
             m.item_id AS "itemId", m.amount_per_sale AS "amountPerSale",
             i.name AS "itemName", i.unit AS "itemUnit"
      FROM pos_product_map m
      LEFT JOIN inventory_items i ON i.id = m.item_id
      WHERE m.team_id = ${u.team_id}`;
  } catch { /* not migrated */ }
  return NextResponse.json({ connected: true, products, mappings });
}

// Upsert / remove one mapping: { productId, productName, itemId|null, amountPerSale }
export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const productId = String(b.productId ?? '').trim();
  if (!productId) return NextResponse.json({ error: 'Chybí produkt' }, { status: 400 });
  try {
    if (b.itemId == null) {
      await sql`DELETE FROM pos_product_map WHERE team_id = ${u.team_id} AND product_id = ${productId}`;
      return NextResponse.json({ ok: true });
    }
    const itemId = parseInt(b.itemId);
    const amount = Math.max(0.001, Number(b.amountPerSale) || 1);
    const [item] = await sql`SELECT id FROM inventory_items WHERE id = ${itemId} AND team_id = ${u.team_id}`;
    if (!item) return NextResponse.json({ error: 'Položka skladu nenalezena' }, { status: 404 });
    await sql`
      INSERT INTO pos_product_map (team_id, product_id, product_name, item_id, amount_per_sale)
      VALUES (${u.team_id}, ${productId}, ${b.productName ? String(b.productName).slice(0, 160) : null}, ${itemId}, ${amount})
      ON CONFLICT (team_id, product_id) DO UPDATE SET
        item_id = ${itemId}, amount_per_sale = ${amount},
        product_name = ${b.productName ? String(b.productName).slice(0, 160) : null}`;
    audit(u.team_id, u.id, 'pos.map', 'pos', itemId, `${b.productName ?? productId} → sklad #${itemId} (${amount}/prodej)`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Mapování není dostupné — spusť /api/init.' }, { status: 400 });
  }
}
