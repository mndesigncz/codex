// Razítkové kampaně (po vzoru Kartičky). Podnik jich má libovolně vedle sebe
// — „10+1 dýmka", „5+1 čaj" — každá s vlastním pravidlem:
//   · visit      … jedno razítko za návštěvu (nejvýš jedno denně na kampaň)
//   · products   … razítko za každý kus vybrané položky nabídky na účtence
//   · min_value  … razítko za útratu nad částku (volitelně za každý násobek)
// Plná karta se promění v kupon s kódem (stejný mechanismus jako dosud) a
// karta se točí dál podle repeat_mode. Zdrojem položek je účtenka ze Storyous
// (billDetail) — produkty se poznávají přes párování nabídky (pos_product_id).

import { sql, couponCode } from './client';

export interface StampCampaign {
  id: number; team_id: number; name: string; description: string; conditions: string;
  active: boolean; valid_since: string | null; valid_till: string | null;
  required_stamps: number; rule_type: 'visit' | 'products' | 'min_value';
  stamp_items: { itemId: number }[]; min_value: number | null; min_value_multiple: boolean;
  one_per_order: boolean; reward_title: string; reward_items: { itemId: number }[];
  days_to_finish: number; days_to_redeem: number;
  repeat_mode: 'immediately' | 'one_day' | 'one_week' | 'one_month' | 'one_time';
  stack_cards: boolean; position: number;
}

export function normalizeItemRefs(raw: any): { itemId: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => ({ itemId: Number(x?.itemId) }))
    .filter(x => Number.isFinite(x.itemId) && x.itemId > 0)
    .slice(0, 200);
}

export function shapeCampaign(r: any): StampCampaign {
  return {
    id: Number(r.id), team_id: Number(r.team_id), name: String(r.name),
    description: String(r.description ?? ''), conditions: String(r.conditions ?? ''),
    active: r.active !== false, valid_since: r.valid_since ?? null, valid_till: r.valid_till ?? null,
    required_stamps: Math.max(1, Number(r.required_stamps) || 1),
    rule_type: ['visit', 'products', 'min_value'].includes(r.rule_type) ? r.rule_type : 'visit',
    stamp_items: normalizeItemRefs(r.stamp_items), min_value: r.min_value == null ? null : Number(r.min_value),
    min_value_multiple: r.min_value_multiple === true, one_per_order: r.one_per_order === true,
    reward_title: String(r.reward_title ?? ''), reward_items: normalizeItemRefs(r.reward_items),
    days_to_finish: Math.max(0, Number(r.days_to_finish) || 0),
    days_to_redeem: Math.max(0, Number(r.days_to_redeem) || 0),
    repeat_mode: ['immediately', 'one_day', 'one_week', 'one_month', 'one_time'].includes(r.repeat_mode) ? r.repeat_mode : 'immediately',
    stack_cards: r.stack_cards !== false, position: Number(r.position) || 0,
  };
}

/** Kampaně platné právě teď (aktivní + v případném okně od–do). */
export async function activeCampaigns(teamId: number, today: string): Promise<StampCampaign[]> {
  try {
    const rows = await sql`
      SELECT * FROM client_stamp_campaigns
      WHERE team_id = ${teamId} AND active = TRUE
        AND (valid_since IS NULL OR valid_since <= ${today})
        AND (valid_till IS NULL OR valid_till >= ${today})
      ORDER BY position, id`;
    return (rows as any[]).map(shapeCampaign);
  } catch { return []; }
}

/** Průběhy člena napříč kampaněmi (mapa campaign_id → progress). */
export async function progressFor(teamId: number, customerId: number): Promise<Map<number, any>> {
  try {
    const rows = await sql`
      SELECT * FROM client_stamp_progress WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
    return new Map((rows as any[]).map(r => [Number(r.campaign_id), r]));
  } catch { return new Map(); }
}

const REPEAT_DAYS: Record<string, number> = { immediately: 0, one_day: 1, one_week: 7, one_month: 30 };

/**
 * Připíše kampani `count` razítek jednomu členovi. Řeší vypršení rozdělané
 * karty (days_to_finish), cooldown po dokončení (repeat_mode), překlopení plné
 * karty na kupon a — při stack_cards — víc dokončení z jedné dávky.
 * Vrací, co se stalo, ať to obsluha vidí lidsky.
 */
export async function addStamps(
  c: StampCampaign, customerId: number, count: number, ref: string,
): Promise<{ added: number; stamps: number; completions: number; skipped?: string }> {
  if (count <= 0) return { added: 0, stamps: 0, completions: 0 };
  const [curRow] = await sql`
    INSERT INTO client_stamp_progress (campaign_id, customer_id, team_id)
    VALUES (${c.id}, ${customerId}, ${c.team_id})
    ON CONFLICT (campaign_id, customer_id) DO UPDATE SET campaign_id = EXCLUDED.campaign_id
    RETURNING *`;
  let stamps = Number(curRow?.stamps ?? 0);
  let started = curRow?.started_at ? new Date(curRow.started_at) : new Date();
  const completedBefore = Number(curRow?.completed ?? 0);

  // one_time: po prvním dokončení už karta znovu neběží.
  if (c.repeat_mode === 'one_time' && completedBefore > 0) {
    return { added: 0, stamps, completions: 0, skipped: 'Karta je jednorázová a už byla dokončena.' };
  }
  // Cooldown po posledním dokončení.
  const cd = REPEAT_DAYS[c.repeat_mode] ?? 0;
  if (cd > 0 && curRow?.last_completed_at) {
    const since = (Date.now() - new Date(curRow.last_completed_at).getTime()) / 86400000;
    if (since < cd) return { added: 0, stamps, completions: 0, skipped: `Další karta jde sbírat za ${Math.ceil(cd - since)} d.` };
  }
  // Rozdělaná karta vypršela → začíná se znovu.
  if (c.days_to_finish > 0 && stamps > 0 && curRow?.last_stamp_at) {
    const age = (Date.now() - new Date(curRow.last_stamp_at).getTime()) / 86400000;
    if (age > c.days_to_finish) { stamps = 0; started = new Date(); }
  }

  let toAdd = count;
  if (!c.stack_cards) toAdd = Math.min(toAdd, Math.max(0, c.required_stamps - stamps));
  let total = stamps + toAdd;
  let completions = Math.floor(total / c.required_stamps);
  if (!c.stack_cards) completions = Math.min(completions, 1);
  if (c.repeat_mode === 'one_time') completions = Math.min(completions, 1);
  const rest = completions > 0 ? total - completions * c.required_stamps : total;

  // Dva kroky místo skládání SQL fragmentů — neon je neumí.
  await sql`
    UPDATE client_stamp_progress SET
      stamps = ${rest},
      completed = completed + ${completions},
      started_at = ${started.toISOString()},
      last_stamp_at = NOW()
    WHERE campaign_id = ${c.id} AND customer_id = ${customerId}`;
  if (completions > 0) {
    await sql`
      UPDATE client_stamp_progress SET last_completed_at = NOW()
      WHERE campaign_id = ${c.id} AND customer_id = ${customerId}`;
  }

  // Každé dokončení = kupon s kódem (host ho ukáže u kasy).
  for (let i = 0; i < completions; i++) {
    const validUntil = c.days_to_redeem > 0
      ? new Date(Date.now() + c.days_to_redeem * 86400000).toISOString().slice(0, 10) : null;
    const [coupon] = await sql`
      INSERT INTO client_coupons (team_id, title, description, cost_points, active, kind, valid_until)
      VALUES (${c.team_id}, ${c.reward_title || `Odměna — ${c.name}`}, ${'Za plnou kartu „' + c.name + '“.'}, 0, TRUE, 'stamps', ${validUntil})
      RETURNING id`;
    await sql`
      INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code)
      VALUES (${coupon.id}, ${customerId}, ${c.team_id}, ${couponCode()})`;
  }
  await sql`
    INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note)
    VALUES (${c.team_id}, ${customerId}, 0, 'visit', ${ref},
      ${completions > 0 ? `${c.name}: +${toAdd} razítek, karta dokončena${completions > 1 ? ` ${completions}×` : ''}` : `${c.name}: +${toAdd} ${toAdd === 1 ? 'razítko' : toAdd < 5 ? 'razítka' : 'razítek'} (${rest}/${c.required_stamps})`})`;
  return { added: toAdd, stamps: rest, completions };
}

/**
 * Razítka z účtenky: spočítá zásah pravidel všech produktových kampaní podle
 * položek účtenky (productId, qty, celková cena) a připíše je. Párování jde
 * přes nabídku podniku (menu_items.pos_product_id).
 */
export async function applyBillToCampaigns(
  teamId: number, customerId: number, today: string,
  bill: { billId: string; total: number; items: { productId: string | null; qty: number }[] },
): Promise<{ lines: string[]; anything: boolean }> {
  const campaigns = (await activeCampaigns(teamId, today)).filter(c => c.rule_type !== 'visit');
  if (!campaigns.length) return { lines: [], anything: false };

  // Jedním dotazem: které itemId nabídky odpovídají produktům z účtenky.
  const wanted = Array.from(new Set(campaigns.flatMap(c => c.stamp_items.map(i => i.itemId))));
  let posByItem = new Map<number, string>();
  if (wanted.length) {
    try {
      const rows = await sql`
        SELECT mi.id, mi.pos_product_id FROM menu_items mi
        JOIN menu_sections ms ON ms.id = mi.section_id
        JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${teamId}
        WHERE mi.id = ANY(${wanted}) AND mi.pos_product_id IS NOT NULL`;
      posByItem = new Map((rows as any[]).map(r => [Number(r.id), String(r.pos_product_id)]));
    } catch { /* nabídka bez migrace */ }
  }
  const qtyByProduct = new Map<string, number>();
  for (const it of bill.items) {
    if (!it.productId) continue;
    qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + Math.max(0, Math.round(it.qty)));
  }

  const lines: string[] = [];
  let anything = false;
  for (const c of campaigns) {
    let count = 0;
    if (c.rule_type === 'products') {
      for (const ref2 of c.stamp_items) {
        const pos = posByItem.get(ref2.itemId);
        if (pos) count += qtyByProduct.get(pos) ?? 0;
      }
      if (c.one_per_order) count = Math.min(count, 1);
    } else if (c.rule_type === 'min_value') {
      const min = Math.max(1, Number(c.min_value) || 0);
      if (min > 0 && bill.total >= min) count = c.min_value_multiple ? Math.floor(bill.total / min) : 1;
    }
    if (count <= 0) continue;
    const r = await addStamps(c, customerId, count, `bill:${bill.billId}`);
    if (r.skipped) { lines.push(`${c.name}: ${r.skipped}`); continue; }
    anything = true;
    lines.push(r.completions > 0
      ? `${c.name}: karta dokončena${r.completions > 1 ? ` ${r.completions}×` : ''} — odměna je v kuponech`
      : `${c.name}: +${r.added} (${r.stamps}/${c.required_stamps})`);
  }
  return { lines, anything };
}
