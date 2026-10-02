// Kupony v plné síle (po vzoru Kartičky). Kupon nese:
//  · výhodu — procenta, koruny, X+Y, nebo volný text v názvu,
//  · komu platí — úrovně hosta a ruční skupiny (prázdné = všem),
//  · kdy platí — od–do, dny v týdnu, hodiny,
//  · jak často — limit na hosta a cooldown mezi vyzvednutími,
//  · 18+ — jen pro plnoleté (podle data narození v profilu hosta),
//  · welcome — uvítací kupon, nový člen ho dostane sám při vstupu.
// Tady je tvar, popisky a rozhodnutí „smí si ho tenhle host vzít?" — claim
// i stránka podniku se ptají stejné funkce, ať se pravidla nerozjedou.

import { sql } from './client';
import { rezervujKus, vratKus } from './kuponyKusy';
import { pragueToday } from './pragueTime';
import { pragueDow, ageFrom, windowOk, stavKuponu, kusyZbyva, jeVidetelnyHostum } from './kuponyPravidla';
export { pragueDow, ageFrom, windowOk };
import type { TierId } from './clientSlots';
import { TIER_LABELS, TIER_RANK, intList, tierList, benefitLabel, conditionBadges, type FormatCastky } from './kuponyPopisky';
export { TIER_LABELS, benefitLabel, conditionBadges };
export type { FormatCastky };

import { BENEFITS } from './kuponyPole';
export { BENEFITS };
export type BenefitKind = typeof BENEFITS[number];

/** Veřejný tvar kuponu pro editor i stránku hosta (camelCase, bez balastu). */
export function shapeCoupon(r: any, castka?: FormatCastky) {
  return {
    id: Number(r.id), title: String(r.title), description: String(r.description ?? ''),
    costPoints: Number(r.cost_points) || 0, active: r.active !== false,
    benefitKind: (BENEFITS as readonly string[]).includes(r.benefit_kind) ? r.benefit_kind : 'text',
    percentOff: r.percent_off == null ? null : Number(r.percent_off),
    amountOff: r.amount_off == null ? null : Number(r.amount_off),
    xyBuy: r.xy_buy == null ? null : Number(r.xy_buy),
    xyFree: r.xy_free == null ? null : Number(r.xy_free),
    minOrderValue: r.min_order_value == null ? null : Number(r.min_order_value),
    targetTiers: tierList(r.target_tiers), targetGroups: intList(r.target_groups),
    perCustomer: Number(r.per_customer) || 0, cooldownDays: Number(r.cooldown_days) || 0,
    daysOfWeek: intList(r.days_of_week), hourFrom: r.hour_from ?? null, hourTill: r.hour_till ?? null,
    adultOnly: r.adult_only === true, welcome: r.welcome === true,
    maxTotal: Number(r.max_total) > 0 ? Number(r.max_total) : null, issued: Number(r.issued) || 0, remaining: kusyZbyva(r),
    dailyLimit: Number(r.daily_limit) > 0 ? Number(r.daily_limit) : null,
    draft: r.draft === true, archived: !!r.archived_at, stav: stavKuponu(r, pragueToday()),
    validSince: r.valid_since ?? null, validUntil: r.valid_until ?? null,
    benefit: benefitLabel(r, castka), badges: conditionBadges(r, castka),
  };
}

/**
 * Smí si tenhle člen kupon vzít? Kontroluje okno, cílení (úrovně + skupiny),
 * limity na hosta, cooldown a 18+. Vrací null (smí), nebo lidský důvod.
 */
export async function claimBlocker(
  c: any, teamId: number, customerId: number,
  ctx: { tierId: TierId; birthday: string | null },
): Promise<string | null> {
  if (!jeVidetelnyHostum(c)) return 'Kupon už není k dispozici.';
  const win = windowOk(c);
  if (win) return win;
  if (kusyZbyva(c) === 0) return 'Kupony došly.';
  const tiers = tierList(c.target_tiers);
  if (tiers.length && !tiers.includes(ctx.tierId)) {
    return `Jen pro ${tiers.map(t => TIER_LABELS[t]).join(' / ')}.`;
  }
  const groups = intList(c.target_groups);
  if (groups.length) {
    const rows = await sql`
      SELECT 1 FROM client_group_members WHERE team_id = ${teamId} AND customer_id = ${customerId} AND group_id = ANY(${groups}) LIMIT 1`;
    if (!rows.length) return 'Kupon je jen pro vybranou skupinu hostů.';
  }
  if (c.adult_only === true) {
    const age = ageFrom(ctx.birthday, pragueToday());
    if (age == null) return 'Kupon je 18+ — doplň si datum narození v Moje → Účet.';
    if (age < 18) return 'Kupon je jen pro plnoleté.';
  }
  const per = Number(c.per_customer) || 0;
  const cd = Number(c.cooldown_days) || 0;
  if (per > 0 || cd > 0) {
    const [st] = await sql`
      SELECT COUNT(*)::int AS taken, MAX(claimed_at) AS last FROM client_coupon_claims
      WHERE coupon_id = ${c.id} AND customer_id = ${customerId}`;
    // czech-ok: „×“ se nesklňuje, tvar zůstává stejný pro všechny počty.
    if (per > 0 && Number(st?.taken ?? 0) >= per) return per === 1 ? 'Tenhle kupon jde vzít jen jednou.' : `Kupon jde vzít nejvýš ${per}×.`;
    if (cd > 0 && st?.last) {
      const since = (Date.now() - new Date(st.last).getTime()) / 86400000;
      if (since < cd) return `Další vyzvednutí až za ${Math.ceil(cd - since)} d.`;
    }
  }
  return null;
}

/**
 * Rozešle kupon vybraným členům (poslat konkrétnímu hostovi, skupině, segmentu,
 * uvítací kupon pro stávající členy). Respektuje cílení kuponu (úrovně, skupiny,
 * 18+), limit na hosta a limit kusů; kdo už drží neuplatněný kód, nedostane druhý.
 * Vrací, komu kód přibyl, a kolik jich a proč se přeskočilo.
 */
export async function rozesliKupon(
  teamId: number, c: any, customerIds: number[],
  o: { zdroj: 'send' | 'welcome'; poslal: number | null; makeCode: () => string },
): Promise<{ komu: number[]; preskoceno: PreskoceniKuponu }> {
  const skip: PreskoceniKuponu = { drzi: 0, cileni: 0, limit: 0, vycerpano: 0, neclen: 0 };
  const ids = Array.from(new Set(customerIds.filter(n => Number.isFinite(n) && n > 0))).slice(0, 5000);
  if (!ids.length) return { komu: [], preskoceno: skip };
  const [profil] = await sql`SELECT * FROM client_profiles WHERE team_id = ${teamId}`;
  const pravidla = tierRulesFromProfile(profil);
  const clenove = await sql`
    SELECT m.customer_id, m.visits, m.spend, us.birthday
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${teamId} AND m.customer_id = ANY(${ids})` as any[];
  const groups = intList(c.target_groups);
  const vSkupine = new Set<number>();
  if (groups.length) {
    const g = await sql`SELECT DISTINCT customer_id FROM client_group_members WHERE team_id = ${teamId} AND group_id = ANY(${groups}) AND customer_id = ANY(${ids})` as any[];
    for (const r of g) vSkupine.add(Number(r.customer_id));
  }
  const drzi = new Map<number, { taken: number; open: boolean }>();
  const st = await sql`
    SELECT customer_id, COUNT(*)::int AS taken, BOOL_OR(redeemed_at IS NULL) AS open
    FROM client_coupon_claims WHERE coupon_id = ${c.id} AND customer_id = ANY(${ids}) GROUP BY customer_id` as any[];
  for (const r of st) drzi.set(Number(r.customer_id), { taken: Number(r.taken), open: r.open === true });
  const jeClen = new Map(clenove.map(m => [Number(m.customer_id), m]));
  const per = Number(c.per_customer) || 0;
  const dnes = pragueToday();
  const komu: number[] = [];
  for (const id of ids) {
    const m = jeClen.get(id);
    if (!m) { skip.neclen += 1; continue; }
    const tier = tierForMember({ visits: Number(m.visits ?? 0), spend: Number(m.spend ?? 0) }, pravidla);
    if (cileniBlocker(c, { tierId: tier.id, birthday: m.birthday ?? null, today: dnes }) || (groups.length && !vSkupine.has(id))) { skip.cileni += 1; continue; }
    const h = drzi.get(id);
    // Uvítací kupon dostane člen jednou, i kdyby ten první už uplatnil.
    if (h?.open || (o.zdroj === 'welcome' && h)) { skip.drzi += 1; continue; }
    if (per > 0 && (h?.taken ?? 0) >= per) { skip.limit += 1; continue; }
    const r = await vydejKod({ teamId, couponId: Number(c.id), customerId: id, kod: o.makeCode(), zdroj: o.zdroj, poslal: o.poslal, bezOtevreneho: true });
    if (r.ok) komu.push(id);
    else if (r.duvod === 'vycerpano') { skip.vycerpano += 1; break; }
    else skip.drzi += 1;
  }
  return { komu, preskoceno: skip };
}

/**
 * Uvítací balíček: nový člen dostane kódy všech aktivních welcome kuponů, na které
 * má nárok (cílení na úrovně a skupiny, 18+, limit kusů, okno platnosti od–do).
 * Volá se z join() při PRVNÍM vstupu do podniku; chyba nesmí vstup shodit.
 */
export async function grantWelcomeCoupons(teamId: number, customerId: number, makeCode: () => string): Promise<number> {
  await zajistiKupony();
  const today = pragueToday();
  const rows = await sql`
    SELECT * FROM client_coupons
    WHERE team_id = ${teamId} AND active = TRUE AND welcome = TRUE AND kind = 'offer'
      AND draft = FALSE AND archived_at IS NULL
      AND (valid_until IS NULL OR valid_until >= ${today})` as any[];
  let granted = 0;
  for (const c of rows) {
    const [dup] = await sql`SELECT id FROM client_coupon_claims WHERE coupon_id = ${c.id} AND customer_id = ${customerId}`;
    if (dup) continue;
    // Kus se rezervuje atomicky (limit kusů); když došly, host ho nedostane.
    if (!(await rezervujKus(c.id))) continue;
    try {
      await sql`
        INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code, source)
        VALUES (${c.id}, ${customerId}, ${teamId}, ${makeCode()}, 'welcome')`;
    } catch { await vratKus(c.id); continue; }
    granted += 1;
  }
  return granted;
}
