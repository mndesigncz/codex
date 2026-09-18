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
import { pragueToday, pragueHM } from './pragueTime';
import type { TierId } from './clientSlots';

export const BENEFITS = ['text', 'percent', 'amount', 'free_item', 'xy'] as const;
export type BenefitKind = typeof BENEFITS[number];

export const TIER_LABELS: Record<string, string> = {
  bronze: 'Člen', silver: 'Stříbrný host', gold: 'Zlatý host', platinum: 'Platinový host',
};
const TIER_RANK: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

function intList(raw: any): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => Number(x)).filter(n => Number.isFinite(n) && n > 0).slice(0, 50);
}
function tierList(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter(t => t in TIER_RANK).slice(0, 4);
}

/** Krátký popisek výhody pro obsluhu i hosta: „Sleva 15 %", „−50 Kč", „2+1". */
export function benefitLabel(c: any): string {
  const kind = String(c.benefit_kind ?? 'text');
  if (kind === 'percent' && Number(c.percent_off) > 0) return `Sleva ${Number(c.percent_off)} %`;
  if (kind === 'amount' && Number(c.amount_off) > 0) return `Sleva ${Number(c.amount_off)} Kč`;
  if (kind === 'free_item') return 'Položka zdarma';
  if (kind === 'xy' && Number(c.xy_buy) > 0) return `${Number(c.xy_buy)}+${Math.max(1, Number(c.xy_free) || 1)} zdarma`;
  return '';
}

/** Štítky podmínek, které mají viset na kartě kuponu (host i obsluha). */
export function conditionBadges(c: any): string[] {
  const out: string[] = [];
  if (Number(c.min_order_value) > 0) out.push(`od ${Number(c.min_order_value)} Kč útraty`);
  const tiers = tierList(c.target_tiers);
  if (tiers.length) out.push(`jen ${tiers.map(t => TIER_LABELS[t]).join(' / ')}`);
  const days = intList(c.days_of_week);
  if (days.length && days.length < 7) {
    const NAMES = ['', 'po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
    out.push(days.map(d => NAMES[d] ?? '').filter(Boolean).join(', '));
  }
  if (c.hour_from && c.hour_till) out.push(`${c.hour_from}–${c.hour_till}`);
  if (c.adult_only === true) out.push('18+');
  return out;
}

/** Veřejný tvar kuponu pro editor i stránku hosta (camelCase, bez balastu). */
export function shapeCoupon(r: any) {
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
    validSince: r.valid_since ?? null, validUntil: r.valid_until ?? null,
    benefit: benefitLabel(r), badges: conditionBadges(r),
  };
}

/** Den v týdnu 1–7 (po = 1) pro pražské datum YYYY-MM-DD. */
export function pragueDow(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/** Věk z data narození (YYYY-MM-DD) k dnešku; null když datum chybí. */
export function ageFrom(birthday: string | null | undefined, today: string): number | null {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(String(birthday))) return null;
  const b = String(birthday);
  let age = Number(today.slice(0, 4)) - Number(b.slice(0, 4));
  if (today.slice(5) < b.slice(5)) age -= 1;
  return age;
}

/** Platí kupon právě teď (datum, den v týdnu, hodiny)? Vrací důvod, když ne. */
export function windowOk(c: any, now: { today: string; hm: string } = { today: pragueToday(), hm: pragueHM() }): string | null {
  if (c.valid_since && String(c.valid_since) > now.today) return `Platí až od ${String(c.valid_since)}.`;
  if (c.valid_until && String(c.valid_until) < now.today) return 'Kupon už neplatí.';
  const days = intList(c.days_of_week);
  if (days.length && !days.includes(pragueDow(now.today))) return 'Dnes kupon neplatí.';
  if (c.hour_from && c.hour_till && (now.hm < String(c.hour_from) || now.hm > String(c.hour_till))) {
    return `Kupon platí jen ${c.hour_from}–${c.hour_till}.`;
  }
  return null;
}

/**
 * Smí si tenhle člen kupon vzít? Kontroluje okno, cílení (úrovně + skupiny),
 * limity na hosta, cooldown a 18+. Vrací null (smí), nebo lidský důvod.
 */
export async function claimBlocker(
  c: any, teamId: number, customerId: number,
  ctx: { tierId: TierId; birthday: string | null },
): Promise<string | null> {
  const win = windowOk(c);
  if (win) return win;
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
 * Uvítací balíček: nový člen dostane kódy všech aktivních welcome kuponů.
 * Volá se z join() při PRVNÍM vstupu do podniku; chyba nesmí vstup shodit.
 */
export async function grantWelcomeCoupons(teamId: number, customerId: number, makeCode: () => string): Promise<number> {
  const today = pragueToday();
  const rows = await sql`
    SELECT * FROM client_coupons
    WHERE team_id = ${teamId} AND active = TRUE AND welcome = TRUE AND kind = 'offer'
      AND (valid_until IS NULL OR valid_until >= ${today})` as any[];
  let granted = 0;
  for (const c of rows) {
    const [dup] = await sql`SELECT id FROM client_coupon_claims WHERE coupon_id = ${c.id} AND customer_id = ${customerId}`;
    if (dup) continue;
    await sql`
      INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code)
      VALUES (${c.id}, ${customerId}, ${teamId}, ${makeCode()})`;
    granted += 1;
  }
  return granted;
}
