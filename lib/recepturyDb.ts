// Receptury z kasy — zápis s historií (kolo 8, R8-5). Server-side, pro routy
// /api/pos/products (uložení) a /api/pos/recipe-proposals (schválení návrhu).
//
// Dřív uložení smazalo a znovu vložilo řádky pos_product_map a do auditu šlo
// „Latte: 4 ingrediencí". Teď jde výměna řádků a zápis verze (pos_recipe_versions)
// v JEDNÉ transakci a audit nese rozdíl („Káva 18 g → 22 g") — spočítaný tady
// proti snímku, který platil před uložením (lib/recepturyVerze).

import { neon } from '@neondatabase/serverless';
import { audit } from './audit';
import { nactiBaleniKategorii, baleniRadku } from './baleniKategorii';
import { jednotkaMnozstvi } from './jednotky';
import { popisRozdilu, rozdilVerzi, type RozdilVerzi, type SurovinaVerze } from './recepturyVerze';

const sql = neon(process.env.DATABASE_URL!);

/** Snímek současné receptury produktu: suroviny v jednotce položky, s názvem a jednotkou z dnešního skladu. */
export async function snimekReceptury(teamId: number, productId: string): Promise<SurovinaVerze[]> {
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT m.item_id AS "itemId", m.amount_per_sale AS "amount",
             i.name AS "itemName", i.unit AS "unit", i.content_unit AS "contentUnit", i.package_size AS "packageSize",
             i.category AS "category", i.category_id AS "categoryId"
      FROM pos_product_map m LEFT JOIN inventory_items i ON i.id = m.item_id
      WHERE m.team_id = ${teamId} AND m.product_id = ${productId}
      ORDER BY m.id`;
  } catch { return []; }
  if (!rows.length) return [];
  const baleniKat = await nactiBaleniKategorii(teamId);
  return rows.map(r => ({
    itemId: Number(r.itemId),
    itemName: r.itemName == null ? null : String(r.itemName),
    amount: Number(r.amount) || 1,
    unit: r.itemName == null ? null : jednotkaMnozstvi({ unit: r.unit, ...baleniRadku(r, baleniKat) }),
  }));
}

/** Suroviny k uložení doplněné o název a jednotku (snímek do verze); neznámé položky podniku se vynechají. */
export async function doplnSuroviny(teamId: number, ingredients: { itemId: number; amount: number }[]): Promise<SurovinaVerze[]> {
  const ids = Array.from(new Set(ingredients.map(i => i.itemId)));
  if (!ids.length) return [];
  const rows = await sql`
    SELECT id, name, unit, content_unit AS "contentUnit", package_size AS "packageSize", category, category_id AS "categoryId"
    FROM inventory_items WHERE id = ANY(${ids}) AND team_id = ${teamId}` as any[];
  const baleniKat = await nactiBaleniKategorii(teamId);
  const podleId = new Map(rows.map(r => [Number(r.id), r]));
  const out: SurovinaVerze[] = [];
  for (const ing of ingredients) {
    const r = podleId.get(ing.itemId);
    if (!r) continue;
    out.push({ itemId: ing.itemId, itemName: String(r.name ?? ''), amount: ing.amount, unit: jednotkaMnozstvi({ unit: r.unit, ...baleniRadku(r, baleniKat) }) });
  }
  return out;
}

export interface UlozeniReceptury {
  productId: string;
  productName: string | null;
  ingredients: { itemId: number; amount: number }[];
  /** Náklad porce z editoru (snímek do historie); null = nešlo spočítat. */
  costPerPortion: number | null;
  /** Odkud změna přišla („Vráceno na verzi z 3. 10.", „Schválen návrh Petry"). */
  note?: string | null;
}

export interface PripravenaReceptura { predtim: SurovinaVerze[]; ted: SurovinaVerze[]; jmeno: string | null; /** DELETE + INSERTy řádků + verze — do jedné transakce. */ writes: any[] }

/**
 * Připraví uložení receptury: ověří suroviny (snímek s názvy a jednotkami), přečte, co platí teď,
 * a sestaví zápisy — výměnu řádků pos_product_map a verzi do historie. Volající je pošle v JEDNÉ
 * transakci (`sql.transaction(writes)`) a pak zavolá `poUlozeniReceptury`.
 */
export async function pripravReceptuRu(teamId: number, meId: number, u: UlozeniReceptury): Promise<PripravenaReceptura> {
  const predtim = await snimekReceptury(teamId, u.productId);
  const ted = await doplnSuroviny(teamId, u.ingredients);
  const jmeno = u.productName ? String(u.productName).slice(0, 160) : null;
  const writes: any[] = [sql`DELETE FROM pos_product_map WHERE team_id = ${teamId} AND product_id = ${u.productId}`];
  for (const ing of ted) {
    writes.push(sql`
      INSERT INTO pos_product_map (team_id, product_id, product_name, item_id, amount_per_sale)
      VALUES (${teamId}, ${u.productId}, ${jmeno}, ${ing.itemId}, ${ing.amount})
      ON CONFLICT DO NOTHING`);
  }
  writes.push(sql`
    INSERT INTO pos_recipe_versions (team_id, product_id, product_name, ingredients, cost_per_portion, created_by, note)
    VALUES (${teamId}, ${u.productId}, ${jmeno}, ${JSON.stringify(ted)}::jsonb, ${u.costPerPortion}, ${meId}, ${u.note ? String(u.note).slice(0, 160) : null})`);
  return { predtim, ted, jmeno, writes };
}

/** Po transakci: produkt zmizí z fronty „bez receptury", audit s rozdílem („Káva 18 g → 22 g"). */
export async function poUlozeniReceptury(teamId: number, meId: number, u: UlozeniReceptury, p: PripravenaReceptura): Promise<RozdilVerzi> {
  if (p.ted.length) {
    try { await sql`DELETE FROM pos_unmapped WHERE team_id = ${teamId} AND product_id = ${u.productId}`; } catch { /* fronta „bez receptury" je bonus */ }
  }
  const rozdil = rozdilVerzi(p.predtim, p.ted);
  audit(teamId, meId, 'pos.recipe', 'pos', null, `${p.jmeno ?? u.productId}: ${p.ted.length ? popisRozdilu(rozdil) : 'receptura smazána'}${u.note ? ` (${u.note})` : ''}`);
  return rozdil;
}

/**
 * Uloží recepturu produktu: výměna řádků a verze v jedné transakci, audit s rozdílem.
 * Prázdné suroviny = smazání receptury (verze s prázdným snímkem). Vyhazuje chybu databáze dál.
 */
export async function ulozRecepturu(teamId: number, meId: number, u: UlozeniReceptury): Promise<{ predtim: SurovinaVerze[]; ted: SurovinaVerze[]; rozdil: RozdilVerzi }> {
  const p = await pripravReceptuRu(teamId, meId, u);
  await sql.transaction(p.writes);
  const rozdil = await poUlozeniReceptury(teamId, meId, u, p);
  return { predtim: p.predtim, ted: p.ted, rozdil };
}

/** Tělo požadavku → suroviny k uložení (nejvýš 12, kladné množství). */
export function surovinyZTela(raw: unknown): { itemId: number; amount: number }[] {
  const out: { itemId: number; amount: number }[] = [];
  for (const ing of (Array.isArray(raw) ? raw : []).slice(0, 12)) {
    const itemId = parseInt((ing as any)?.itemId);
    const amount = Number((ing as any)?.amount);
    if (!Number.isFinite(itemId)) continue;
    out.push({ itemId, amount: Number.isFinite(amount) && amount > 0 ? amount : 1 });
  }
  return out;
}

/** Náklad porce z těla: číslo ≥ 0, jinak null. */
export function nakladZTela(raw: unknown): number | null {
  const n = Number(raw);
  return raw == null || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100) / 100;
}

/** Jedna osoba pro odpověď API (jméno a avatar z users). */
export async function osobyPodleId(ids: number[]): Promise<Map<number, { id: number; name: string; avatar: string | null }>> {
  const m = new Map<number, { id: number; name: string; avatar: string | null }>();
  const cista = [...new Set(ids.filter(id => Number.isFinite(id) && id > 0))];
  if (!cista.length) return m;
  try {
    for (const u of await sql`SELECT id, name, avatar FROM users WHERE id = ANY(${cista})` as any[]) m.set(Number(u.id), { id: Number(u.id), name: String(u.name ?? ''), avatar: u.avatar ?? null });
  } catch { /* jména jsou doplněk */ }
  return m;
}
