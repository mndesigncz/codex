// Sales → stock write-off engine. Separate from the route so the evening
// digest can run the same sync server-side.

import { neon } from '@neondatabase/serverless';
import { getConnection, listBills, billItems } from './storyous';
import { audit } from './audit';

const sql = neon(process.env.DATABASE_URL!);

/** Deduct `amount` from an item, spending the open package first and cracking
 *  sealed ones as needed. Never goes below zero. Returns what changed. */
async function deduct(teamId: number, userId: number | null, itemId: number, amount: number, note: string) {
  const [it] = await sql`
    SELECT id, name, quantity, open_amount, package_size
    FROM inventory_items WHERE id = ${itemId} AND team_id = ${teamId}`;
  if (!it) return null;
  const pkg = Number(it.package_size) || 0;
  let qty = Number(it.quantity) || 0;
  let open = Number(it.open_amount) || 0;
  const oldQty = qty, oldOpen = open;

  if (pkg > 0) {
    open -= amount;
    while (open < 0 && qty > 0) { qty -= 1; open += pkg; }
    if (open < 0) open = 0;
    open = Math.round(open * 10) / 10;
  } else {
    qty = Math.max(0, Math.round((qty - amount) * 10) / 10);
  }
  if (qty === oldQty && open === oldOpen) return null;

  try {
    await sql`
      UPDATE inventory_items SET quantity = ${qty}, open_amount = ${pkg > 0 ? open : it.open_amount},
        updated_at = NOW()
      WHERE id = ${itemId}`;
  } catch {
    await sql`UPDATE inventory_items SET quantity = ${qty}, updated_at = NOW() WHERE id = ${itemId}`;
  }
  try {
    await sql`
      INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, old_open, new_open, note, created_at)
      VALUES (${itemId}, ${userId}, ${oldQty}, ${qty}, ${oldOpen}, ${pkg > 0 ? open : null}, ${note}, NOW())`;
  } catch {
    try {
      await sql`
        INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note, created_at)
        VALUES (${itemId}, ${userId}, ${oldQty}, ${qty}, ${note}, NOW())`;
    } catch { /* log best-effort */ }
  }
  return { name: it.name, amount };
}

export async function runPosSync(teamId: number, userId: number | null, force = false) {
  const conn = await getConnection(teamId);
  if (!conn) return { connected: false as const };

  // Throttle: a sync touches the POS API a lot; once per 10 minutes is plenty.
  try {
    const [row] = await sql`SELECT last_sync_at FROM pos_connections WHERE team_id = ${teamId}`;
    if (!force && row?.last_sync_at && Date.now() - new Date(row.last_sync_at).getTime() < 10 * 60_000) {
      return { connected: true as const, throttled: true as const };
    }
    await sql`UPDATE pos_connections SET last_sync_at = NOW() WHERE team_id = ${teamId}`;
  } catch { /* column missing — sync anyway */ }

  let mappings: any[] = [];
  try {
    mappings = await sql`SELECT product_id, item_id, amount_per_sale FROM pos_product_map WHERE team_id = ${teamId}`;
  } catch { return { connected: true as const, error: 'Mapování není dostupné — spusť /api/init.' }; }
  const mapByProduct = new Map(mappings.map((m: any) => [String(m.product_id), m]));

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

  const totals = new Map<number, { amount: number; note: string }>();
  const unmapped = new Map<string, { name: string; count: number }>();
  let processed = 0;

  for (const billId of unprocessed.slice(0, 120)) {
    let items;
    try { items = await billItems(conn, billId); }
    catch { continue; } // leave unmarked — next sync retries
    for (const it of items) {
      const m = it.productId ? mapByProduct.get(it.productId) : null;
      if (m) {
        const cur = totals.get(Number(m.item_id)) ?? { amount: 0, note: 'Prodej (Storyous)' };
        cur.amount += (Number(m.amount_per_sale) || 1) * it.amount;
        totals.set(Number(m.item_id), cur);
      } else if (it.productId) {
        const u2 = unmapped.get(it.productId) ?? { name: it.name, count: 0 };
        u2.count += it.amount;
        unmapped.set(it.productId, u2);
      }
    }
    await sql`
      INSERT INTO pos_processed_bills (team_id, bill_id)
      VALUES (${teamId}, ${billId}) ON CONFLICT DO NOTHING`;
    processed++;
  }

  const deducted: { name: string; amount: number }[] = [];
  const entries = Array.from(totals.entries());
  for (const [itemId, t] of entries) {
    const r = await deduct(teamId, userId, itemId, Math.round(t.amount * 10) / 10, t.note);
    if (r) deducted.push(r);
  }
  if (deducted.length) {
    audit(teamId, userId, 'pos.sync', 'pos', null,
      deducted.map(d => `${d.name} −${d.amount}`).join(', ').slice(0, 280));
  }
  return {
    connected: true as const,
    processed,
    deducted,
    unmapped: Array.from(unmapped.entries()).map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.count - a.count).slice(0, 15),
  };
}

