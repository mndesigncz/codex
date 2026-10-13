// Product recipes: which stock items one sold product consumes, and how much.
// A glass of wine = 150 ml from the bottle; svařák = 200 ml wine + spices.
// GET also serves the "map me" queue — what sold recently without a recipe.
//
// Kolo 67: katalog kasy čte i editor menu (výběr produktu z kasy, párování),
// takže GET pustí i toho, kdo menu upravuje — jen bez receptur a bez fronty
// prodaných kusů, které patří k recepturám. Zápis receptury má svůj klíč.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getConnection, menuProducts } from '@/lib/storyous';
import { productsFromMirror } from '@/lib/posMirror';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { nactiBaleniKategorii, baleniRadku } from '@/lib/baleniKategorii';
import { jednotkaMnozstvi } from '@/lib/jednotky';
import { nakladZTela, poUlozeniReceptury, pripravReceptuRu, surovinyZTela } from '@/lib/recepturyDb';
import { popisRozdilu } from '@/lib/recepturyVerze';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const c = await pozaduj(['receptury.zobrazit', 'menu.upravit']);
  if (jeOdpoved(c)) return c;
  const u = { id: c.meId, team_id: c.teamId };
  const sRecepturami = c.role.opravneni.has('receptury.zobrazit');
  const conn = await getConnection(u.team_id);
  if (!conn) return NextResponse.json({ connected: false, products: [], recipes: [], unmapped: [] });

  // Katalog ze zrcadla (rychlé); živě jen když zrcadlo ještě nic nemá.
  let products: any[] = [];
  const mirrored = await productsFromMirror(u.team_id);
  if (mirrored.size) {
    products = Array.from(mirrored.entries()).map(([productId, p]) => ({ productId, name: p.name, category: p.category ?? '', price: p.price, vatRate: p.vatRate }));
  } else {
    try { products = await menuProducts(conn); }
    catch { return NextResponse.json({ connected: true, products: [], recipes: [], unmapped: [], error: 'Menu se nepodařilo načíst.' }); }
  }

  if (!sRecepturami) return NextResponse.json({ connected: true, products, recipes: [], unmapped: [] });

  // Recipes grouped per product.
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT m.product_id AS "productId", m.product_name AS "productName",
             m.item_id AS "itemId", m.amount_per_sale AS "amountPerSale",
             i.name AS "itemName", i.unit AS "unit", i.content_unit AS "contentUnit", i.package_size AS "packageSize",
             i.category AS "category", i.category_id AS "categoryId"
      FROM pos_product_map m
      LEFT JOIN inventory_items i ON i.id = m.item_id
      WHERE m.team_id = ${u.team_id}`;
  } catch { /* not migrated */ }
  // Velikost balení a jednotka obsahu se dědí z kategorie, když je položka nemá vlastní.
  const baleniKat = await nactiBaleniKategorii(u.team_id);
  const grouped = new Map<string, any>();
  for (const r of rows) {
    const baleni = baleniRadku(r, baleniKat);
    const g = grouped.get(r.productId) ?? { productId: r.productId, productName: r.productName, ingredients: [] };
    g.ingredients.push({
      itemId: r.itemId, amount: Number(r.amountPerSale) || 1,
      itemName: r.itemName,
      itemUnit: r.itemName == null ? null : jednotkaMnozstvi({ unit: r.unit, ...baleni }),
      packageSize: baleni.packageSize,
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

// Replace the whole recipe of one product: { productId, productName, ingredients: [{itemId, amount}], costPerPortion?, note? }.
// Empty ingredients = remove the recipe. Kolo 8 (R8-5): zápis jde přes lib/recepturyDb —
// výměna řádků a verze do historie v jedné transakci, audit s rozdílem („Káva 18 g → 22 g").
export async function POST(req: NextRequest) {
  const c = await pozaduj('receptury.upravit');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const productId = String(b.productId ?? '').trim();
  if (!productId) return NextResponse.json({ error: 'Chybí produkt' }, { status: 400 });
  if (productId.length > 120) return NextResponse.json({ error: 'Neplatný produkt' }, { status: 400 });
  const ingredients = surovinyZTela(b.ingredients);
  try {
    // Suroviny se ověří dřív a celá výměna receptury (smazání starých řádků + vložení
    // nových + verze do historie) jde v JEDNÉ transakci: pád mezi DELETE a INSERTy dřív
    // smazal recepturu bez náhrady a produkt se přestal odepisovat.
    const u = {
      productId, productName: b.productName ? String(b.productName) : null, ingredients,
      costPerPortion: nakladZTela(b.costPerPortion), note: typeof b.note === 'string' ? b.note.trim() || null : null,
    };
    const p = await pripravReceptuRu(c.teamId, c.meId, u);
    await sql.transaction(p.writes);
    const rozdil = await poUlozeniReceptury(c.teamId, c.meId, u, p);
    return NextResponse.json({ ok: true, zmena: popisRozdilu(rozdil) });
  } catch (e) {
    // „Spusť /api/init" patří jen k chybějící tabulce (42P01). Při výpadku spojení
    // by ta rada člověka poslala špatným směrem — a stará receptura teď zůstala
    // beze změny, což se má říct.
    if ((e as any)?.code === '42P01') {
      return NextResponse.json({ error: 'Receptura není dostupná — spusť /api/init.' }, { status: 400 });
    }
    console.error('[pos/products] uložení receptury selhalo', e);
    return NextResponse.json({ error: 'Recepturu se nepodařilo uložit, původní zůstala beze změny. Zkus to za chvíli.' }, { status: 503 });
  }
}
