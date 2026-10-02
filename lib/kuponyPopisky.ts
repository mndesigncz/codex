// Popisky kuponů — čistá část bez databáze, ať ji načte `npm test` přímo Nodem.
// Rozhodování o tom, kdo si kupon smí vzít, a tvar pro stránku hosta je v lib/coupons.ts.

export const TIER_LABELS: Record<string, string> = {
  bronze: 'Člen', silver: 'Stříbrný host', gold: 'Zlatý host', platinum: 'Platinový host',
};
export const TIER_RANK: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

export function intList(raw: any): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => Number(x)).filter(n => Number.isFinite(n) && n > 0).slice(0, 50);
}
export function tierList(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter(t => t in TIER_RANK).slice(0, 4);
}

/**
 * Jak se v popiscích ukáže částka. Výchozí jsou koruny jako dřív; volající, který
 * zná podnik, předá formátovač v jeho měně (`menaPodniku(...).money`), ať host
 * eurové kavárny nečte „Sleva 50 Kč".
 */
export type FormatCastky = (n: number) => string;
const VCH_KORUNY: FormatCastky = n => `${n} Kč`;

/** Krátký popisek výhody pro obsluhu i hosta: „Sleva 15 %", „−50 Kč", „2+1". */
export function benefitLabel(c: any, castka: FormatCastky = VCH_KORUNY): string {
  const kind = String(c.benefit_kind ?? 'text');
  if (kind === 'percent' && Number(c.percent_off) > 0) return `Sleva ${Number(c.percent_off)} %`;
  if (kind === 'amount' && Number(c.amount_off) > 0) return `Sleva ${castka(Number(c.amount_off))}`;
  if (kind === 'free_item') return 'Položka zdarma';
  if (kind === 'xy' && Number(c.xy_buy) > 0) return `${Number(c.xy_buy)}+${Math.max(1, Number(c.xy_free) || 1)} zdarma`;
  return '';
}

/** Štítky podmínek, které mají viset na kartě kuponu (host i obsluha). */
export function conditionBadges(c: any, castka: FormatCastky = VCH_KORUNY): string[] {
  const out: string[] = [];
  if (Number(c.min_order_value) > 0) out.push(`od ${castka(Number(c.min_order_value))} útraty`);
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
