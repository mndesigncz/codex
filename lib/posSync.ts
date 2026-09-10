// Prodeje → odpis skladu. Bere položky účtenek ze zrcadla (pos_bill_items),
// ne z pokladny — pokladna se volá jen v synchronizaci (lib/posMirror.ts).
// Oddělené od route, aby stejný odpis pustil i večerní souhrn a cron.

import { neon } from '@neondatabase/serverless';
import { getConnection } from './storyous';
import { audit } from './audit';
import { pragueToday, dayPlus } from './pragueTime';

const sql = neon(process.env.DATABASE_URL!);

/** Kolik dní zpět se odepisují neprocesované účtenky — starší se nechají být,
 *  ať zapnutí receptury dnes neodepíše sklad za půl roku zpětně. */
const WRITE_OFF_WINDOW_DAYS = 7;

/** Odečet z načatého balení: nejdřív načaté, pak se načne nové, nikdy pod nulu. */
function consume(qty: number, open: number, pkg: number, amount: number) {
  if (pkg > 0) {
    open -= amount;
    while (open < 0 && qty > 0) { qty -= 1; open += pkg; }
    if (open < 0) open = 0;
    // Tři desetinná místa: 0,7 l minus 0,02 l musí zůstat 0,68 — zaokrouhlení
    // na desetiny by podniku vracelo 0,02 l při každém drinku.
    open = Math.round(open * 1000) / 1000;
  } else {
    qty = Math.max(0, Math.round((qty - amount) * 1000) / 1000);
  }
  return { qty, open };
}

export async function runPosSync(teamId: number, userId: number | null, force = false) {
  const conn = await getConnection(teamId);
  if (!conn) return { connected: false as const };

  // Večerní souhrn synchronizuje bez přihlášeného člověka. Historie skladu si
  // radši vezme vedoucího týmu, ať u pohybu někdo stojí.
  let actor = userId;
  if (actor == null) {
    try {
      const [owner] = await sql`
        SELECT id FROM users WHERE team_id = ${teamId} AND role = 'employer' ORDER BY id ASC LIMIT 1`;
      if (owner?.id) actor = Number(owner.id);
    } catch { /* zůstane null */ }
  }

  // Zámek + škrticí klapka v jednom atomickém kroku: běží jen ten, kdo posune
  // last_sync_at. Dva odpisy vedle sebe by tytéž účtenky odepsaly dvakrát.
  try {
    const claimed = force
      ? await sql`
          UPDATE pos_connections SET last_sync_at = NOW()
          WHERE team_id = ${teamId}
            AND (last_sync_at IS NULL OR last_sync_at < NOW() - INTERVAL '15 seconds')
          RETURNING team_id`
      : await sql`
          UPDATE pos_connections SET last_sync_at = NOW()
          WHERE team_id = ${teamId}
            AND (last_sync_at IS NULL OR last_sync_at < NOW() - INTERVAL '3 minutes')
          RETURNING team_id`;
    if (!claimed.length) return { connected: true as const, throttled: true as const };
  } catch { /* sloupec chybí — jede se dál */ }

  let mappings: any[] = [];
  try {
    mappings = await sql`SELECT product_id, item_id, amount_per_sale FROM pos_product_map WHERE team_id = ${teamId}`;
  } catch { return { connected: true as const, error: 'Mapování není dostupné — spusť /api/init.' }; }
  const mapByProduct = new Map<string, { item_id: number; amount_per_sale: number }[]>();
  for (const m of mappings) {
    const key = String(m.product_id);
    (mapByProduct.get(key) ?? mapByProduct.set(key, []).get(key)!).push(m);
  }

  // Účtenky ze zrcadla, které mají stažené položky a ještě se neodepsaly.
  const since = dayPlus(pragueToday(), -WRITE_OFF_WINDOW_DAYS);
  let bills: any[] = [];
  try {
    bills = await sql`
      SELECT b.bill_id, b.day FROM pos_bills b
      WHERE b.team_id = ${teamId} AND b.items_synced = TRUE AND b.refunded = FALSE AND b.deleted = FALSE
        AND b.day >= ${since}
        AND NOT EXISTS (SELECT 1 FROM pos_processed_bills p WHERE p.team_id = ${teamId} AND p.bill_id = b.bill_id)
      ORDER BY b.day ASC LIMIT 400`;
  } catch { return { connected: true as const, error: 'Zrcadlo účtenek chybí — spusť /api/init.' }; }
  if (!bills.length) return { connected: true as const, processed: 0, deducted: [], unmapped: [] };

  const ids = bills.map(b => String(b.bill_id));
  const dayOf = new Map(bills.map(b => [String(b.bill_id), String(b.day)]));
  const items = await sql`
    SELECT bill_id, product_id, name, amount FROM pos_bill_items
    WHERE team_id = ${teamId} AND bill_id = ANY(${ids})`;

  const totals = new Map<number, number>();
  const unmapped = new Map<string, { name: string; count: number }>();
  // Co se prodalo, po produktu A po obchodním dni účtenky — účtenka po půlnoci
  // patří k předchozímu večeru, jinak by poslední den měsíce utekl do dalšího.
  const sales = new Map<string, { day: string; productId: string; name: string; qty: number }>();

  for (const it of items as any[]) {
    // Záporné a nulové řádky jsou opravy — sklad z nich nikdy neroste.
    const sold = Number(it.amount);
    if (!(sold > 0)) continue;
    const productId = it.product_id ? String(it.product_id) : null;
    const day = dayOf.get(String(it.bill_id)) ?? pragueToday();
    if (productId) {
      const key = `${day}|${productId}`;
      const rec = sales.get(key) ?? { day, productId, name: String(it.name ?? ''), qty: 0 };
      rec.qty += sold;
      sales.set(key, rec);
    }
    const recipe = productId ? mapByProduct.get(productId) : null;
    if (recipe && recipe.length) {
      for (const ing of recipe) {
        const add = (Number(ing.amount_per_sale) || 1) * sold;
        totals.set(Number(ing.item_id), (totals.get(Number(ing.item_id)) ?? 0) + add);
      }
    } else if (productId) {
      const u2 = unmapped.get(productId) ?? { name: String(it.name ?? ''), count: 0 };
      u2.count += sold;
      unmapped.set(productId, u2);
    }
  }

  // Všechny změny skladu se spočítají dopředu a zapíšou v JEDNÉ transakci
  // spolu se značkou „zpracováno" — pád uprostřed nesmí nechat účtenku
  // označenou jako odepsanou, když se sklad nepohnul (ani naopak).
  const deducted: { name: string; amount: number }[] = [];
  const writes: any[] = [];
  for (const [itemId, rawAmount] of Array.from(totals.entries())) {
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
      VALUES (${itemId}, ${actor}, ${oldQty}, ${next.qty}, ${oldOpen}, ${pkg > 0 ? next.open : null}, ${'Prodej (Storyous)'}, NOW())`);
    deducted.push({ name: it.name, amount });
  }
  for (const billId of ids) {
    writes.push(sql`
      INSERT INTO pos_processed_bills (team_id, bill_id)
      VALUES (${teamId}, ${billId}) ON CONFLICT DO NOTHING`);
  }

  let processed = 0;
  try {
    for (let i = 0; i < writes.length; i += 150) await sql.transaction(writes.slice(i, i + 150));
    processed = ids.length;
  } catch {
    return { connected: true as const, error: 'Zápis odpisů selhal — zkus to znovu.' };
  }

  if (deducted.length) {
    audit(teamId, actor, 'pos.sync', 'pos', null,
      deducted.map(d => `${d.name} −${d.amount}`).join(', ').slice(0, 280));
  }
  for (const v of Array.from(sales.values())) {
    try {
      await sql`
        INSERT INTO pos_sales (team_id, date, product_id, product_name, qty)
        VALUES (${teamId}, ${v.day}, ${v.productId}, ${v.name}, ${v.qty})
        ON CONFLICT (team_id, date, product_id) DO UPDATE SET
          qty = pos_sales.qty + ${v.qty},
          product_name = COALESCE(EXCLUDED.product_name, pos_sales.product_name)`;
    } catch { /* tabulka ještě není */ }
  }
  for (const [productId, v] of Array.from(unmapped.entries())) {
    try {
      await sql`
        INSERT INTO pos_unmapped (team_id, product_id, product_name, sold_count, last_seen)
        VALUES (${teamId}, ${productId}, ${v.name}, ${v.count}, NOW())
        ON CONFLICT (team_id, product_id) DO UPDATE SET
          sold_count = pos_unmapped.sold_count + ${v.count},
          product_name = ${v.name}, last_seen = NOW()`;
    } catch { /* tabulka ještě není */ }
  }

  return {
    connected: true as const,
    processed,
    deducted,
    unmapped: Array.from(unmapped.entries()).map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.count - a.count).slice(0, 15),
  };
}
