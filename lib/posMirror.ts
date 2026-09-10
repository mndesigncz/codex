// Zrcadlo pokladny v naší databázi.
//
// Dřív se každý pohled (uzávěrka, finance, měsíční přehled) ptal Storyous
// znovu — a stahoval celý měsíc účtenek při každém otevření. Teď se účtenky
// stáhnou jednou, přírůstkově podle `_lastModifiedAt`, a všechno ostatní čte
// z tabulek pos_bills / pos_bill_items / pos_products. Pokladna se volá jen
// pro to, co se od minula změnilo.
//
// Kdo synchronizaci spouští: každé otevření aplikace (tick, nejvýš jednou za
// pár minut), denní cron, večerní souhrn, ruční tlačítko v Nastavení a
// webhook od Storyous, když ho jejich podpora zapne. Všechny cesty vedou sem.

import { neon } from '@neondatabase/serverless';
import {
  getConnection, billsModifiedSince, billsInRange, billDetail, fetchMenu, stockForPlace,
  addToDay, emptyDay, roundDay, daySummary as apiDaySummary, StoryousError,
  type PosConnection, type BillHead, type DaySummary,
} from './storyous';
import { pragueToday, dayPlus } from './pragueTime';

const sql = neon(process.env.DATABASE_URL!);

/** Kolik dní zpět se stáhne při prvním připojení. */
export const DEFAULT_BACKFILL_DAYS = 60;
/** Kolik detailů účtenek se stihne v jednom běhu (každý je jeden dotaz). */
const ITEMS_PER_RUN = 150;
/**
 * Kolik času si běh dá, než uklidí a nechá zbytek na příště.
 *
 * Funkce na Vercelu má minutu. Testovací podnik má 77 účtenek a stihne se
 * celý; ostrá čajovna jich má za dva měsíce tisíce a jedním dechem se
 * stáhnout nedají. Proto se každý běh vejde do rozpočtu a co nestihne,
 * dobere ten další — historie se plní sama po kouscích.
 */
const RUN_BUDGET_MS = 35_000;
/** Po kolika dnech se historie dotahuje dozadu. */
const HISTORY_WINDOW_DAYS = 7;
/** Kolik zápisů účtenek jde do databáze najednou (jedna transakce = jedno kolo). */
const UPSERT_BATCH = 50;
/** Přesah přírůstkové synchronizace — hodiny na serveru a v pokladně nejsou stejné. */
const OVERLAP_MS = 2 * 60 * 60 * 1000;

export interface SyncStats {
  ok: boolean;
  skipped?: 'throttled' | 'locked' | 'not-connected';
  mode?: 'backfill' | 'incremental';
  billsSeen: number;
  billsChanged: number;
  itemsFetched: number;
  itemsPending: number;
  menuUpdated: boolean;
  /** Kam až se v tomto běhu stihla dotáhnout historie. */
  historyFrom?: string;
  /** True, když je historie kompletní až k cíli — dál se nic dotahovat nebude. */
  historyDone?: boolean;
  error?: string;
}

function upsertBillQuery(teamId: number, b: BillHead) {
  // Vrací dotaz; spouští se po dávkách v jedné transakci. Kdyby šla každá
  // účtenka zvlášť, znamenaly by tisíce účtenek tisíce kol do databáze.
  return sql`
    INSERT INTO pos_bills (
      team_id, bill_id, day, created_at, paid_at, modified_at, final_price, without_tax, tips, discount, rounding,
      currency, payment_method, cash, card, other, other_methods, refunded, deleted, refunded_bill_id,
      person_count, desk_id, created_by_id, created_by_name, paid_by_id, paid_by_name, order_provider,
      tax_summaries, fiscalized, items_synced, updated_at)
    VALUES (
      ${teamId}, ${b.billId}, ${b.day}, ${b.createdAt}, ${b.paidAt}, ${b.modifiedAt}, ${b.finalPrice}, ${b.withoutTax}, ${b.tips}, ${b.discount}, ${b.rounding},
      ${b.currency}, ${b.paymentMethod}, ${b.buckets.cash}, ${b.buckets.card}, ${b.buckets.other}, ${JSON.stringify(b.buckets.methods)}, ${b.refunded}, ${b.deleted}, ${b.refundedBillId},
      ${b.personCount}, ${b.deskId}, ${b.createdById}, ${b.createdByName}, ${b.paidById}, ${b.paidByName}, ${b.orderProvider},
      ${b.taxSummaries ? JSON.stringify(b.taxSummaries) : null}, ${b.fiscalized}, FALSE, NOW())
    ON CONFLICT (team_id, bill_id) DO UPDATE SET
      day = EXCLUDED.day, created_at = EXCLUDED.created_at, paid_at = EXCLUDED.paid_at, modified_at = EXCLUDED.modified_at,
      final_price = EXCLUDED.final_price, without_tax = EXCLUDED.without_tax, tips = EXCLUDED.tips, discount = EXCLUDED.discount,
      rounding = EXCLUDED.rounding, currency = EXCLUDED.currency, payment_method = EXCLUDED.payment_method,
      cash = EXCLUDED.cash, card = EXCLUDED.card, other = EXCLUDED.other, other_methods = EXCLUDED.other_methods,
      refunded = EXCLUDED.refunded, deleted = EXCLUDED.deleted, refunded_bill_id = EXCLUDED.refunded_bill_id,
      person_count = EXCLUDED.person_count, desk_id = EXCLUDED.desk_id,
      created_by_id = EXCLUDED.created_by_id, created_by_name = EXCLUDED.created_by_name,
      paid_by_id = EXCLUDED.paid_by_id, paid_by_name = EXCLUDED.paid_by_name, order_provider = EXCLUDED.order_provider,
      tax_summaries = EXCLUDED.tax_summaries, fiscalized = EXCLUDED.fiscalized,
      -- položky se stáhnou znovu jen když se účtenka opravdu změnila
      items_synced = CASE WHEN pos_bills.modified_at IS DISTINCT FROM EXCLUDED.modified_at THEN FALSE ELSE pos_bills.items_synced END,
      updated_at = NOW()
    RETURNING (xmax = 0) AS inserted, items_synced`;
}

/**
 * Zapíše účtenky po dávkách a spočítá, kolik se jich opravdu změnilo
 * (nová nebo jiný `_lastModifiedAt`) — jen u těch se pak stahují položky.
 */
async function upsertBills(teamId: number, bills: BillHead[]): Promise<number> {
  let changed = 0;
  for (let i = 0; i < bills.length; i += UPSERT_BATCH) {
    const chunk = bills.slice(i, i + UPSERT_BATCH);
    const res: any = await sql.transaction(chunk.map(b => upsertBillQuery(teamId, b)));
    for (const rows of (res ?? []) as any[]) {
      const r = Array.isArray(rows) ? rows[0] : rows;
      if (r && (r.inserted === true || r.items_synced === false)) changed++;
    }
  }
  return changed;
}

async function fetchPendingItems(conn: PosConnection, teamId: number, limit: number, budget?: () => boolean): Promise<{ fetched: number; pending: number }> {
  const pending = await sql`
    SELECT bill_id FROM pos_bills
    WHERE team_id = ${teamId} AND items_synced = FALSE AND deleted = FALSE
    ORDER BY modified_at DESC LIMIT ${limit + 1}`;
  const ids = (pending as any[]).map(r => String(r.bill_id));
  const todo = ids.slice(0, limit);
  let fetched = 0;
  for (const billId of todo) {
    if (budget && !budget()) break;
    let d;
    try { d = await billDetail(conn, billId); }
    catch (e) {
      // 429 = přestat, ať se to nezhorší; jiná chyba = ta účtenka počká na příště.
      if (e instanceof StoryousError && e.status === 429) break;
      continue;
    }
    const writes: any[] = [sql`DELETE FROM pos_bill_items WHERE team_id = ${teamId} AND bill_id = ${billId}`];
    for (const it of d.items) {
      writes.push(sql`
        INSERT INTO pos_bill_items (team_id, bill_id, product_id, name, amount, price, vat_rate, category_id, measure, discounts)
        VALUES (${teamId}, ${billId}, ${it.productId}, ${it.name}, ${it.amount}, ${it.price}, ${it.vatRate}, ${it.categoryId}, ${it.measure}, ${it.discounts ? JSON.stringify(it.discounts) : null})`);
    }
    writes.push(sql`UPDATE pos_bills SET items_synced = TRUE WHERE team_id = ${teamId} AND bill_id = ${billId}`);
    try { await sql.transaction(writes); fetched++; } catch { /* příště */ }
  }
  return { fetched, pending: Math.max(0, ids.length - fetched) };
}

/** Katalog produktů — jen když se v pokladně změnil (nebo je starší než 12 h). */
export async function syncMenu(teamId: number, conn: PosConnection, force = false): Promise<boolean> {
  const [c] = await sql`SELECT menu_modified_at, menu_synced_at FROM pos_connections WHERE team_id = ${teamId}`;
  const syncedAt = c?.menu_synced_at ? new Date(c.menu_synced_at).getTime() : 0;
  if (!force && syncedAt && Date.now() - syncedAt < 12 * 3600 * 1000) return false;
  const snap = await fetchMenu(conn);
  if (!force && snap.modifiedAt && c?.menu_modified_at === snap.modifiedAt) {
    await sql`UPDATE pos_connections SET menu_synced_at = NOW() WHERE team_id = ${teamId}`;
    return false;
  }
  const writes: any[] = [sql`UPDATE pos_products SET active = FALSE WHERE team_id = ${teamId}`];
  for (const p of snap.products) {
    writes.push(sql`
      INSERT INTO pos_products (team_id, product_id, name, category, price, vat_rate, measure, ean, image_url, show_in_pos, price_variable, type, active, updated_at)
      VALUES (${teamId}, ${p.productId}, ${p.name}, ${p.category}, ${p.price}, ${p.vatRate}, ${p.measure}, ${p.ean}, ${p.imageUrl}, ${p.showInPos}, ${p.priceVariable}, ${p.type}, TRUE, NOW())
      ON CONFLICT (team_id, product_id) DO UPDATE SET
        name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, vat_rate = EXCLUDED.vat_rate,
        measure = EXCLUDED.measure, ean = EXCLUDED.ean, image_url = EXCLUDED.image_url, show_in_pos = EXCLUDED.show_in_pos,
        price_variable = EXCLUDED.price_variable, type = EXCLUDED.type, active = TRUE, updated_at = NOW()`);
  }
  writes.push(sql`UPDATE pos_connections SET menu_modified_at = ${snap.modifiedAt}, menu_synced_at = NOW() WHERE team_id = ${teamId}`);
  // Po stovkách řádků — v dávkách, ať transakce nepřeteče.
  for (let i = 0; i < writes.length; i += 200) await sql.transaction(writes.slice(i, i + 200));
  return true;
}

/**
 * Přírůstková synchronizace účtenek. První běh stáhne historii, další jen
 * změny. Zámek v pos_connections zaručí, že dva běhy (cron + otevřená appka)
 * nepoběží vedle sebe.
 */
export async function syncBills(teamId: number, opts: { force?: boolean; backfillDays?: number } = {}): Promise<SyncStats> {
  const stats: SyncStats = { ok: true, billsSeen: 0, billsChanged: 0, itemsFetched: 0, itemsPending: 0, menuUpdated: false };
  const conn = await getConnection(teamId);
  if (!conn) return { ...stats, ok: false, skipped: 'not-connected' };

  // Hlídač času: každý krok se ptá, jestli ještě má cenu začínat další kolo.
  const started = Date.now();
  const left = () => RUN_BUDGET_MS - (Date.now() - started);
  const budget = () => left() > 6000;

  // Zámek: kdo posune sync_lock_at, běží; druhý čeká na příště.
  const throttleSec = opts.force ? 20 : 5 * 60;
  let claimed: any[] = [];
  try {
    claimed = await sql`
      UPDATE pos_connections SET sync_lock_at = NOW()
      WHERE team_id = ${teamId}
        AND (sync_lock_at IS NULL OR sync_lock_at < NOW() - (${throttleSec} || ' seconds')::interval)
      RETURNING bills_cursor, synced_from, backfill_until`;
  } catch { return { ...stats, ok: false, error: 'Tabulky zrcadla chybí — spusť migraci (/api/init).' }; }
  if (!claimed.length) return { ...stats, skipped: 'throttled' };
  const cursor: string | null = claimed[0].bills_cursor ? new Date(claimed[0].bills_cursor).toISOString() : null;

  try {
    // Menu první — ceny a názvy položek potřebuje všechno ostatní.
    try { stats.menuUpdated = await syncMenu(teamId, conn, false); } catch { /* menu zvlášť, účtenky jedou dál */ }

    let maxModified = cursor ? new Date(cursor).getTime() : 0;
    const batch: BillHead[] = [];
    const take = (b: BillHead) => {
      stats.billsSeen++;
      const t = new Date(b.modifiedAt).getTime();
      if (t > maxModified) maxModified = t;
      batch.push(b);
    };
    const flush = async () => { if (batch.length) stats.billsChanged += await upsertBills(teamId, batch.splice(0)); };

    // ---- 1. Čerstvé účtenky -------------------------------------------------
    // Nejdřív to, co je vidět na dashboardu: dnešek. Historie se doplní až
    // potom, takže po připojení jsou dnešní tržby na obrazovce hned a nečeká
    // se, než se prokoušeme dvěma měsíci dozadu.
    let complete: boolean;
    if (cursor) {
      stats.mode = 'incremental';
      const since = new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString();
      const r = await billsModifiedSince(conn, since, take, 40, budget);
      complete = r.complete;
    } else {
      stats.mode = 'backfill';
      const from = dayPlus(pragueToday(), -1);
      const r = await billsInRange(conn, from, dayPlus(pragueToday(), 2), take, 80, budget);
      complete = r.complete;
      if (complete) {
        await sql`
          UPDATE pos_connections SET synced_from = ${from}
          WHERE team_id = ${teamId} AND (synced_from IS NULL OR synced_from > ${from})`;
      }
    }
    await flush();

    // Kurzor se posune jen po úplném průchodu — jinak by se přeskočila stránka.
    if (complete && maxModified > 0) {
      await sql`UPDATE pos_connections SET bills_cursor = ${new Date(maxModified).toISOString()} WHERE team_id = ${teamId}`;
    }

    // ---- 2. Historie po týdnech dozadu -------------------------------------
    // Ostrý podnik má za dva měsíce tisíce účtenek; do jednoho běhu se
    // nevejdou. Každé dokončené okno se uloží (synced_from), takže další běh
    // plynule naváže a nic se nestahuje dvakrát.
    const target = claimed[0].backfill_until
      ?? dayPlus(pragueToday(), -Math.max(1, Math.min(400, opts.backfillDays ?? DEFAULT_BACKFILL_DAYS)));
    if (!claimed[0].backfill_until) {
      await sql`UPDATE pos_connections SET backfill_until = ${target} WHERE team_id = ${teamId} AND backfill_until IS NULL`;
    }
    let edge: string | null = complete
      ? ((await sql`SELECT synced_from FROM pos_connections WHERE team_id = ${teamId}`)[0] as any)?.synced_from ?? null
      : null;
    while (edge && edge > target && budget()) {
      const back = dayPlus(edge, -HISTORY_WINDOW_DAYS);
      const from = back < target ? target : back;
      const r = await billsInRange(conn, from, edge, take, 80, budget);
      await flush();
      if (!r.complete) break;           // okno nedoběhlo — hranice zůstává, dobere se příště
      await sql`UPDATE pos_connections SET synced_from = ${from} WHERE team_id = ${teamId}`;
      edge = from;
      stats.historyFrom = from;
    }
    stats.historyDone = !!edge && edge <= target;

    // ---- 3. Položky účtenek do zbytku času ---------------------------------
    const it = await fetchPendingItems(conn, teamId, ITEMS_PER_RUN, budget);
    stats.itemsFetched = it.fetched; stats.itemsPending = it.pending;

    await sql`UPDATE pos_connections SET last_sync_at = NOW(), last_error = NULL, last_error_at = NULL WHERE team_id = ${teamId}`;
    return stats;
  } catch (e) {
    const msg = e instanceof StoryousError ? e.message : 'Synchronizace selhala.';
    try { await sql`UPDATE pos_connections SET last_error = ${msg}, last_error_at = NOW() WHERE team_id = ${teamId}`; } catch { /* nic */ }
    return { ...stats, ok: false, error: msg };
  }
}
/** Stáhne znovu historii od zadaného počtu dní (např. při prvním nastavení nebo po výpadku). */
export async function backfill(teamId: number, days: number): Promise<SyncStats> {
  const until = dayPlus(pragueToday(), -Math.max(1, Math.min(400, days)));
  await sql`
    UPDATE pos_connections
    SET bills_cursor = NULL, synced_from = NULL, sync_lock_at = NULL, backfill_until = ${until}
    WHERE team_id = ${teamId}`;
  return syncBills(teamId, { force: true, backfillDays: days });
}

/** Celý cyklus: menu → účtenky → odpis skladu. Jedna cesta pro tick, cron, souhrn i webhook. */
export async function runFullSync(teamId: number, actorId: number | null, opts: { force?: boolean } = {}) {
  const bills = await syncBills(teamId, { force: opts.force });
  let writeOff: any = null;
  if (bills.ok && !bills.skipped) {
    try {
      const { runPosSync } = await import('./posSync');
      writeOff = await runPosSync(teamId, actorId, !!opts.force);
    } catch { /* odpis je best-effort */ }
  }
  return { bills, writeOff };
}

// ---- Čtení ze zrcadla --------------------------------------------------------------

function rowToHead(r: any): BillHead {
  return {
    billId: String(r.bill_id), createdAt: String(r.created_at), paidAt: r.paid_at ? String(r.paid_at) : null,
    modifiedAt: String(r.modified_at), day: String(r.day),
    finalPrice: Number(r.final_price) || 0, withoutTax: r.without_tax != null ? Number(r.without_tax) : null,
    tips: Number(r.tips) || 0, discount: Number(r.discount) || 0, rounding: Number(r.rounding) || 0,
    currency: String(r.currency ?? 'CZK'), paymentMethod: String(r.payment_method ?? ''),
    buckets: { cash: Number(r.cash) || 0, card: Number(r.card) || 0, other: Number(r.other) || 0,
      methods: (r.other_methods && typeof r.other_methods === 'object') ? r.other_methods : {} },
    refunded: !!r.refunded, deleted: !!r.deleted, refundedBillId: r.refunded_bill_id ?? null,
    personCount: r.person_count != null ? Number(r.person_count) : null, deskId: r.desk_id ?? null,
    createdById: r.created_by_id ?? null, createdByName: r.created_by_name ?? null,
    paidById: r.paid_by_id ?? null, paidByName: r.paid_by_name ?? null,
    orderProvider: r.order_provider ?? null,
    taxSummaries: (r.tax_summaries && typeof r.tax_summaries === 'object') ? r.tax_summaries : null,
    fiscalized: !!r.fiscalized,
  };
}

/** Má zrcadlo data pro tenhle den? (od kdy se synchronizuje) */
export async function mirrorCovers(teamId: number, date: string): Promise<boolean> {
  try {
    const [c] = await sql`SELECT synced_from, bills_cursor FROM pos_connections WHERE team_id = ${teamId}`;
    if (!c?.bills_cursor) return false;
    return !c.synced_from || String(c.synced_from) <= date;
  } catch { return false; }
}

/** Účtenky obchodního dne (nebo rozsahu dní) ze zrcadla. */
export async function billsOfDays(teamId: number, from: string, to: string): Promise<BillHead[]> {
  const rows = await sql`
    SELECT * FROM pos_bills WHERE team_id = ${teamId} AND day >= ${from} AND day <= ${to}
    ORDER BY created_at ASC`;
  return (rows as any[]).map(rowToHead);
}

/** Denní souhrn: ze zrcadla, když ho máme; jinak přímo z pokladny. */
export async function daySummaryFor(teamId: number, date: string): Promise<DaySummary & { source: 'mirror' | 'api' }> {
  if (await mirrorCovers(teamId, date)) {
    const out = emptyDay(date);
    for (const b of await billsOfDays(teamId, date, date)) addToDay(out, b);
    return { ...roundDay(out), source: 'mirror' };
  }
  const conn = await getConnection(teamId);
  if (!conn) throw new Error('not-connected');
  return { ...(await apiDaySummary(conn, date)), source: 'api' };
}

export interface MirrorHealth {
  connected: boolean;
  placeName: string | null;
  merchantId: string | null;
  clientIdMasked: string | null;
  lastSyncAt: string | null;
  billsCursor: string | null;
  syncedFrom: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  billsCount: number;
  itemsPending: number;
  productsCount: number;
  productsWithPrice: number;
  menuSyncedAt: string | null;
  webhookSecret: string | null;
  lastWebhookAt: string | null;
  stockId: string | null;
  firstDay: string | null;
  lastDay: string | null;
  /** Kam až má historie dosáhnout (nejstarší den, který chceme mít). */
  backfillUntil: string | null;
  /** Historie je stažená celá; už se nic nedotahuje na pozadí. */
  historyComplete: boolean;
}

export async function health(teamId: number): Promise<MirrorHealth> {
  const empty: MirrorHealth = {
    connected: false, placeName: null, merchantId: null, clientIdMasked: null, lastSyncAt: null, billsCursor: null,
    syncedFrom: null, lastError: null, lastErrorAt: null, billsCount: 0, itemsPending: 0, productsCount: 0,
    productsWithPrice: 0, menuSyncedAt: null, webhookSecret: null, lastWebhookAt: null, stockId: null, firstDay: null, lastDay: null, backfillUntil: null, historyComplete: false,
  };
  let c: any;
  try { [c] = await sql`SELECT * FROM pos_connections WHERE team_id = ${teamId}`; } catch { return empty; }
  if (!c) return empty;
  const out: MirrorHealth = {
    ...empty, connected: true, placeName: c.place_name ?? null, merchantId: c.merchant_id,
    clientIdMasked: String(c.client_id).slice(0, 4) + '…' + String(c.client_id).slice(-4),
    lastSyncAt: c.last_sync_at ?? null, billsCursor: c.bills_cursor ?? null, syncedFrom: c.synced_from ?? null,
    lastError: c.last_error ?? null, lastErrorAt: c.last_error_at ?? null, menuSyncedAt: c.menu_synced_at ?? null,
    backfillUntil: c.backfill_until ?? null,
    // Historie je hotová, když zrcadlo sahá až k cíli (nebo cíl ještě není znám).
    historyComplete: !!c.synced_from && !!c.backfill_until && String(c.synced_from) <= String(c.backfill_until),
    webhookSecret: c.webhook_secret ?? null, lastWebhookAt: c.last_webhook_at ?? null, stockId: c.stock_id ?? null,
  };
  try {
    const [b] = await sql`
      SELECT COUNT(*)::int AS n, SUM(CASE WHEN items_synced = FALSE AND deleted = FALSE THEN 1 ELSE 0 END)::int AS pending,
             MIN(day) AS first_day, MAX(day) AS last_day
      FROM pos_bills WHERE team_id = ${teamId}`;
    out.billsCount = Number(b?.n) || 0; out.itemsPending = Number(b?.pending) || 0;
    out.firstDay = b?.first_day ?? null; out.lastDay = b?.last_day ?? null;
    const [p] = await sql`
      SELECT COUNT(*)::int AS n, SUM(CASE WHEN price IS NOT NULL THEN 1 ELSE 0 END)::int AS priced
      FROM pos_products WHERE team_id = ${teamId} AND active = TRUE`;
    out.productsCount = Number(p?.n) || 0; out.productsWithPrice = Number(p?.priced) || 0;
  } catch { /* tabulky ještě nejsou */ }
  return out;
}

/** Ceny a názvy produktů ze zrcadla (rychlé, bez volání pokladny). */
export interface SoldLine { productId: string; name: string; qty: number; revenue: number; hasPrice: boolean }

/**
 * Co se prodalo v období, po produktech — z položek účtenek v zrcadle.
 * Tržba je ta skutečná z účtenky (cena × množství po slevách na řádku),
 * ne ceníková. Refundace a smazané účtenky se nepočítají.
 */
export async function soldLines(teamId: number, from: string, to: string): Promise<SoldLine[]> {
  const rows = await sql`
    SELECT i.product_id AS "productId", MAX(i.name) AS name,
           SUM(i.amount)::float AS qty,
           SUM(i.amount * COALESCE(i.price, 0))::float AS revenue,
           BOOL_OR(i.price IS NOT NULL) AS "hasPrice"
    FROM pos_bill_items i
    JOIN pos_bills b ON b.team_id = i.team_id AND b.bill_id = i.bill_id
    WHERE i.team_id = ${teamId} AND b.day >= ${from} AND b.day <= ${to}
      AND b.deleted = FALSE AND b.refunded = FALSE AND i.product_id IS NOT NULL
    GROUP BY i.product_id`;
  return (rows as any[]).map(r => ({
    productId: String(r.productId), name: String(r.name ?? r.productId),
    qty: Number(r.qty) || 0, revenue: Math.round(Number(r.revenue) || 0), hasPrice: !!r.hasPrice,
  }));
}

/** Kolik dní v období má v zrcadle položky účtenek (rozpis po produktech). */
export async function soldDays(teamId: number, from: string, to: string): Promise<number> {
  const [r] = await sql`
    SELECT COUNT(DISTINCT b.day)::int AS n
    FROM pos_bills b
    WHERE b.team_id = ${teamId} AND b.day >= ${from} AND b.day <= ${to}
      AND b.deleted = FALSE AND b.items_synced = TRUE`;
  return Number(r?.n) || 0;
}

export async function productsFromMirror(teamId: number): Promise<Map<string, { name: string; category: string | null; price: number | null; vatRate: number | null }>> {
  const map = new Map<string, { name: string; category: string | null; price: number | null; vatRate: number | null }>();
  try {
    const rows = await sql`SELECT product_id, name, category, price, vat_rate FROM pos_products WHERE team_id = ${teamId} AND active = TRUE`;
    for (const r of rows as any[]) {
      map.set(String(r.product_id), { name: String(r.name), category: r.category ?? null,
        price: r.price != null ? Number(r.price) : null, vatRate: r.vat_rate != null ? Number(r.vat_rate) : null });
    }
  } catch { /* prázdné */ }
  return map;
}

/** Zjistí a zapamatuje sklad provozovny ve Storyous (kvůli náhledu zásob). */
export async function rememberStock(teamId: number, conn: PosConnection): Promise<string | null> {
  try {
    const s = await stockForPlace(conn);
    await sql`UPDATE pos_connections SET stock_id = ${s?.stockId ?? null} WHERE team_id = ${teamId}`;
    return s?.stockId ?? null;
  } catch { return null; }
}
