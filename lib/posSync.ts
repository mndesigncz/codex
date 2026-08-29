// Sales → stock write-off engine. Separate from the route so the evening
// digest can run the same sync server-side.

import { neon } from '@neondatabase/serverless';
import { getConnection, listBills, billItems } from './storyous';
import { audit } from './audit';

const sql = neon(process.env.DATABASE_URL!);

/** Open-package arithmetic: spend the open package first, crack sealed ones as
 *  needed, never below zero. Pure — the caller decides how to persist. */
function consume(qty: number, open: number, pkg: number, amount: number) {
  if (pkg > 0) {
    open -= amount;
    while (open < 0 && qty > 0) { qty -= 1; open += pkg; }
    if (open < 0) open = 0;
    // Three decimals: a 0,7 l bottle minus 0,02 l has to stay 0,68 — rounding
    // to a tenth here would give the shop back 0,02 l on every drink.
    open = Math.round(open * 1000) / 1000;
  } else {
    qty = Math.max(0, Math.round((qty - amount) * 1000) / 1000);
  }
  return { qty, open };
}

export async function runPosSync(teamId: number, userId: number | null, force = false) {
  const conn = await getConnection(teamId);
  if (!conn) return { connected: false as const };

  // Throttle + concurrency lock in one atomic claim: only the caller who moves
  // last_sync_at forward gets to run. Two syncs at once (digest cron + a manual
  // press) would otherwise both see the same bills and write stock off twice.
  // force shortens the window but still refuses to run beside another sync.
  try {
    const claimed = force
      ? await sql`
          UPDATE pos_connections SET last_sync_at = NOW()
          WHERE team_id = ${teamId}
            AND (last_sync_at IS NULL OR last_sync_at < NOW() - INTERVAL '30 seconds')
          RETURNING team_id`
      : await sql`
          UPDATE pos_connections SET last_sync_at = NOW()
          WHERE team_id = ${teamId}
            AND (last_sync_at IS NULL OR last_sync_at < NOW() - INTERVAL '10 minutes')
          RETURNING team_id`;
    if (!claimed.length) return { connected: true as const, throttled: true as const };
  } catch { /* column missing — sync anyway */ }

  let mappings: any[] = [];
  try {
    mappings = await sql`SELECT product_id, item_id, amount_per_sale FROM pos_product_map WHERE team_id = ${teamId}`;
  } catch { return { connected: true as const, error: 'Mapování není dostupné — spusť /api/init.' }; }
  // A product's recipe = every ingredient row it has.
  const mapByProduct = new Map<string, { item_id: number; amount_per_sale: number }[]>();
  for (const m of mappings) {
    const key = String(m.product_id);
    (mapByProduct.get(key) ?? mapByProduct.set(key, []).get(key)!).push(m);
  }

  // Yesterday + today (Prague-ish via UTC date is fine for a day window).
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const till = new Date(today); till.setDate(till.getDate() + 1);
  const from = new Date(today); from.setDate(from.getDate() - 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const bills = await listBills(conn, iso(from), iso(till));
  const unprocessed: string[] = [];
  for (const b of bills) {
    try {
      const [seen] = await sql`SELECT 1 FROM pos_processed_bills WHERE team_id = ${teamId} AND bill_id = ${b.billId}`;
      if (!seen) unprocessed.push(b.billId);
    } catch { return { connected: true as const, error: 'Chybí tabulka zpracovaných účtenek — spusť /api/init.' }; }
  }

  const totals = new Map<number, number>();
  const unmapped = new Map<string, { name: string; count: number }>();
  const fetched: string[] = [];
  // What sold, per product — recorded for every product, mapped or not, so the
  // margin analysis has a history without asking the POS again.
  const sales = new Map<string, { name: string; qty: number }>();

  for (const billId of unprocessed.slice(0, 120)) {
    let items;
    try { items = await billItems(conn, billId); }
    catch { continue; } // leave unmarked — next sync retries
    for (const it of items) {
      // Negative/zero lines are corrections and refunds — stock never grows
      // from those, and a negative "sale" must not inflate the open package.
      const sold = Number(it.amount);
      if (!(sold > 0)) continue;
      if (it.productId) {
        const rec = sales.get(it.productId) ?? { name: it.name, qty: 0 };
        rec.qty += sold;
        sales.set(it.productId, rec);
      }
      const recipe = it.productId ? mapByProduct.get(it.productId) : null;
      if (recipe && recipe.length) {
        for (const ing of recipe) {
          const add = (Number(ing.amount_per_sale) || 1) * sold;
          totals.set(Number(ing.item_id), (totals.get(Number(ing.item_id)) ?? 0) + add);
        }
      } else if (it.productId) {
        const u2 = unmapped.get(it.productId) ?? { name: it.name, count: 0 };
        u2.count += sold;
        unmapped.set(it.productId, u2);
      }
    }
    fetched.push(billId);
  }

  // Compute every stock change up front, then land deductions and the
  // processed-bill marks in ONE transaction — a crash mid-run must not leave
  // bills marked as written-off when the stock never moved (or vice versa).
  const deducted: { name: string; amount: number }[] = [];
  const writes: any[] = [];
  for (const [itemId, rawAmount] of Array.from(totals.entries())) {
    // Millilitre / gram precision. One decimal used to be enough for „150 ml
    // z lahve", but a cocktail takes 0,02 l of vodka — that rounded to 0.0 and
    // the sale was silently written off as nothing at all.
    const amount = Math.round(rawAmount * 1000) / 1000;
    if (!(amount > 0)) continue;
    const [it] = await sql`
      SELECT id, name, quantity, open_amount, package_size
      FROM inventory_items WHERE id = ${itemId} AND team_id = ${teamId}`;
    if (!it) continue;
    const pkg = Number(it.package_size) || 0;
    const oldQty = Number(it.quantity) || 0;
    const oldOpen = Number(it.open_amount) || 0;
    const next = consume(oldQty, oldOpen, pkg, amount);
    if (next.qty === oldQty && next.open === oldOpen) continue;
    writes.push(sql`
      UPDATE inventory_items SET quantity = ${next.qty},
        open_amount = ${pkg > 0 ? next.open : it.open_amount}, updated_at = NOW()
      WHERE id = ${itemId} AND team_id = ${teamId}`);
    writes.push(sql`
      INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, old_open, new_open, note, created_at)
      VALUES (${itemId}, ${userId}, ${oldQty}, ${next.qty}, ${oldOpen}, ${pkg > 0 ? next.open : null}, ${'Prodej (Storyous)'}, NOW())`);
    deducted.push({ name: it.name, amount });
  }
  for (const billId of fetched) {
    writes.push(sql`
      INSERT INTO pos_processed_bills (team_id, bill_id)
      VALUES (${teamId}, ${billId}) ON CONFLICT DO NOTHING`);
  }

  let processed = 0;
  if (writes.length) {
    try {
      await sql.transaction(writes);
      processed = fetched.length;
    } catch {
      return { connected: true as const, error: 'Zápis odpisů selhal — zkus to znovu.' };
    }
  }

  if (deducted.length) {
    audit(teamId, userId, 'pos.sync', 'pos', null,
      deducted.map(d => `${d.name} −${d.amount}`).join(', ').slice(0, 280));
  }
  // The day's sales, per product. Attributed to today's date: the sync runs on
  // yesterday's and today's receipts, and for the margin view a day either way
  // does not change the month.
  const salesDay = iso(today);
  for (const [productId, v] of Array.from(sales.entries())) {
    try {
      await sql`
        INSERT INTO pos_sales (team_id, date, product_id, product_name, qty)
        VALUES (${teamId}, ${salesDay}, ${productId}, ${v.name}, ${v.qty})
        ON CONFLICT (team_id, date, product_id) DO UPDATE SET
          qty = pos_sales.qty + ${v.qty},
          product_name = COALESCE(EXCLUDED.product_name, pos_sales.product_name)`;
    } catch { /* table not migrated yet — analysis simply has less history */ }
  }

  // Remember what sold without a recipe — the mapping screen serves it first.
  for (const [productId, v] of Array.from(unmapped.entries())) {
    try {
      await sql`
        INSERT INTO pos_unmapped (team_id, product_id, product_name, sold_count, last_seen)
        VALUES (${teamId}, ${productId}, ${v.name}, ${v.count}, NOW())
        ON CONFLICT (team_id, product_id) DO UPDATE SET
          sold_count = pos_unmapped.sold_count + ${v.count},
          product_name = ${v.name}, last_seen = NOW()`;
    } catch { /* table not migrated yet */ }
  }

  return {
    connected: true as const,
    processed,
    deducted,
    unmapped: Array.from(unmapped.entries()).map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.count - a.count).slice(0, 15),
  };
}
