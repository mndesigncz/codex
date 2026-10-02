// Kupony: databázová část úplnosti — sloupce navíc (lazy ALTER, stejné jsou i v
// app/api/init/route.ts), položky nabídky pro kupony vázané na položku, a atomické
// počítadlo vydaných kusů a denních uplatnění. Pravidla bez databáze jsou
// v lib/kuponyPravidla.ts.
//
// Souběh: limit kusů a denní limit se hlídají jedním UPDATE na řádku kuponu
// (řádek se zamkne), ne čtením a zápisem zvlášť. Dva hosté, kteří vezmou poslední
// kus naráz, ho tedy nevezmou oba. Selže-li po rezervaci vložení kódu, kus se vrátí.

import { sql } from './client';

let pripraveno: Promise<void> | null = null;

/** Doplní sloupce kuponů, pokud chybí. Jednou za běh procesu; při chybě se příští volání zkusí znovu. */
export function zajistiKupony(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      // Jeden ALTER na tabulku (tři dotazy místo patnácti): běží jednou za proces při prvním použití.
      await sql`
        ALTER TABLE client_coupons
          ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'live',
          ADD COLUMN IF NOT EXISTS total_limit INTEGER,
          ADD COLUMN IF NOT EXISTS daily_limit INTEGER,
          ADD COLUMN IF NOT EXISTS issued INTEGER,
          ADD COLUMN IF NOT EXISTS redeem_day TEXT,
          ADD COLUMN IF NOT EXISTS redeem_count INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS menu_item_id INTEGER,
          ADD COLUMN IF NOT EXISTS excluded_items JSONB NOT NULL DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS excluded_categories JSONB NOT NULL DEFAULT '[]'`;
      await sql`
        ALTER TABLE client_coupon_claims
          ADD COLUMN IF NOT EXISTS redeemed_by INTEGER,
          ADD COLUMN IF NOT EXISTS redeemed_amount INTEGER,
          ADD COLUMN IF NOT EXISTS source TEXT,
          ADD COLUMN IF NOT EXISTS sent_by INTEGER,
          ADD COLUMN IF NOT EXISTS promo_id INTEGER`;
      await sql`ALTER TABLE client_promos ADD COLUMN IF NOT EXISTS valid_since TEXT`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

export interface PolozkaNabidky { id: number; name: string; category: string }

/** Položky nabídky podniku (pro kupon vázaný na položku a pro vyloučené položky). */
export async function polozkyNabidky(teamId: number): Promise<PolozkaNabidky[]> {
  try {
    const rows = await sql`
      SELECT i.id, i.name, s.title AS category
      FROM menu_items i JOIN menu_sections s ON s.id = i.section_id JOIN menu_boards b ON b.id = s.board_id
      WHERE b.team_id = ${teamId} ORDER BY s.title, i.position, i.id LIMIT 600` as any[];
    return rows.map(r => ({ id: Number(r.id), name: String(r.name), category: String(r.category ?? '') }));
  } catch { return []; }
}

/** Doplní řádkům kuponů název položky a názvy vyloučených položek (pro popisky). */
export function obohatKupony<T extends Record<string, any>>(rows: T[], polozky: PolozkaNabidky[]): (T & { item_name: string | null; excluded_item_names: string[] })[] {
  const jmeno = new Map(polozky.map(p => [p.id, p.name]));
  return rows.map(r => ({
    ...r,
    item_name: r.menu_item_id != null ? jmeno.get(Number(r.menu_item_id)) ?? null : null,
    excluded_item_names: (Array.isArray(r.excluded_items) ? r.excluded_items : []).map((id: any) => jmeno.get(Number(id))).filter(Boolean) as string[],
  }));
}

/** Rezervuje jeden kus (limit kusů). false = vyčerpáno. */
export async function rezervujKus(couponId: number): Promise<boolean> {
  const r = await sql`
    UPDATE client_coupons
    SET issued = COALESCE(issued, (SELECT COUNT(*)::int FROM client_coupon_claims WHERE coupon_id = ${couponId})) + 1
    WHERE id = ${couponId}
      AND (total_limit IS NULL OR COALESCE(issued, (SELECT COUNT(*)::int FROM client_coupon_claims WHERE coupon_id = ${couponId})) < total_limit)
    RETURNING id`;
  return r.length > 0;
}

/** Vrátí rezervovaný kus (vložení kódu se nepovedlo). */
export async function vratKus(couponId: number): Promise<void> {
  await sql`UPDATE client_coupons SET issued = GREATEST(COALESCE(issued, 1) - 1, 0) WHERE id = ${couponId}`;
}

/** Rezervuje jedno uplatnění dnes (denní limit). false = dnešní limit je vyčerpaný. */
export async function rezervujUplatneni(couponId: number, dnes: string): Promise<boolean> {
  const r = await sql`
    UPDATE client_coupons
    SET redeem_count = CASE WHEN redeem_day = ${dnes} THEN redeem_count + 1 ELSE 1 END, redeem_day = ${dnes}
    WHERE id = ${couponId}
      AND (daily_limit IS NULL OR redeem_day IS DISTINCT FROM ${dnes} OR redeem_count < daily_limit)
    RETURNING id`;
  return r.length > 0;
}

export async function vratUplatneni(couponId: number, dnes: string): Promise<void> {
  await sql`UPDATE client_coupons SET redeem_count = GREATEST(redeem_count - 1, 0) WHERE id = ${couponId} AND redeem_day = ${dnes}`;
}

export type ZdrojKodu = 'points' | 'welcome' | 'promo' | 'send';

/**
 * Vydá hostovi kód kuponu: rezervuje kus, vloží kód, a když vložení nevyjde,
 * kus vrátí. `bezOtevreneho`: nevydá druhý kód, když host jeden neuplatněný drží.
 * Vrací kód, nebo důvod odmítnutí.
 */
export async function vydejKod(o: {
  teamId: number; couponId: number; customerId: number; kod: string; zdroj: ZdrojKodu;
  poslal?: number | null; promoId?: number | null; bezOtevreneho?: boolean;
}): Promise<{ ok: true; kod: string } | { ok: false; duvod: 'vycerpano' | 'drzi' }> {
  if (!(await rezervujKus(o.couponId))) return { ok: false, duvod: 'vycerpano' };
  try {
    const vlozeno = o.bezOtevreneho
      ? await sql`
          INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code, source, sent_by, promo_id)
          SELECT ${o.couponId}, ${o.customerId}, ${o.teamId}, ${o.kod}, ${o.zdroj}, ${o.poslal ?? null}, ${o.promoId ?? null}
          WHERE NOT EXISTS (SELECT 1 FROM client_coupon_claims WHERE coupon_id = ${o.couponId} AND customer_id = ${o.customerId} AND redeemed_at IS NULL)
          RETURNING id`
      : await sql`
          INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code, source, sent_by, promo_id)
          VALUES (${o.couponId}, ${o.customerId}, ${o.teamId}, ${o.kod}, ${o.zdroj}, ${o.poslal ?? null}, ${o.promoId ?? null})
          RETURNING id`;
    if (!vlozeno.length) { await vratKus(o.couponId); return { ok: false, duvod: 'drzi' }; }
    return { ok: true, kod: o.kod };
  } catch (e) {
    await vratKus(o.couponId).catch(() => {});
    throw e;
  }
}
