// Popisky kuponů — čistá část bez databáze, ať ji načte `npm test` přímo Nodem.
// Rozhodování o tom, kdo si kupon smí vzít, a tvar pro stránku hosta je v lib/coupons.ts.

import { fmtDenVTydnu } from './i18n/format.ts';
import { jeJazyk, type Jazyk } from './i18n/config.ts';

export const TIER_LABELS: Record<string, string> = {
  bronze: 'Člen', silver: 'Stříbrný host', gold: 'Zlatý host', platinum: 'Platinový host',
};
export const TIER_RANK: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

/**
 * Překladač z lib/i18n (`useT`) pro popisky ve správě v jazyce uživatele (kolo 93). Bez něj zůstávají
 * popisky česky — tak je skládá server do odpovědí API (benefit, badges) i e-mailů.
 */
export type PrekladacPopisku = ((klic: string, hodnoty?: Record<string, string | number>) => string) & { jazyk?: string };
const urovenT = (t: PrekladacPopisku, u: string) => (u === 'silver' ? t('Stříbrný host') : u === 'gold' ? t('Zlatý host') : u === 'platinum' ? t('Platinový host') : t('Člen'));

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
export const VCH_KORUNY: FormatCastky = n => `${n} Kč`;

/** Odkazy na položky a kategorie nabídky z JSONB sloupce: jen platná čísla, s názvem (když ho řádek nese). */
export function odkazyList(raw: any, klic: 'itemId' | 'sectionId'): { id: number; name: string }[] {
  const pole = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : raw;
  if (!Array.isArray(pole)) return [];
  const videno = new Set<number>(); const out: { id: number; name: string }[] = [];
  for (const x of pole) {
    const id = Math.round(Number(x?.[klic]));
    if (!Number.isInteger(id) || id <= 0 || videno.has(id)) continue;
    videno.add(id); out.push({ id, name: String(x?.name ?? '').slice(0, 120) });
    if (out.length >= 50) break;
  }
  return out;
}

/**
 * Krátký popisek výhody pro obsluhu i hosta: „Sleva 15 %", „−50 Kč", „2+1". Kupon vázaný na položku
 * nabídky (`menu_item_name` z JOINu) jmenuje položku: „Zdarma: Dezert dne", „Sleva 20 % na Dezert dne".
 */
export function benefitLabel(c: any, castka: FormatCastky = VCH_KORUNY, t?: PrekladacPopisku): string {
  const kind = String(c.benefit_kind ?? 'text');
  const polozka = c.menu_item_name ? String(c.menu_item_name) : '';
  if (t) {
    if (kind === 'percent' && Number(c.percent_off) > 0) return polozka ? t('Sleva {n} % na {polozka}', { n: Number(c.percent_off), polozka }) : t('Sleva {n} %', { n: Number(c.percent_off) });
    if (kind === 'amount' && Number(c.amount_off) > 0) return polozka ? t('Sleva {castka} na {polozka}', { castka: castka(Number(c.amount_off)), polozka }) : t('Sleva {castka}', { castka: castka(Number(c.amount_off)) });
    if (kind === 'free_item') return polozka ? t('Zdarma: {polozka}', { polozka }) : t('Položka zdarma');
    if (kind === 'xy' && Number(c.xy_buy) > 0) return polozka ? t('{x}+{y} zdarma: {polozka}', { x: Number(c.xy_buy), y: Math.max(1, Number(c.xy_free) || 1), polozka }) : t('{x}+{y} zdarma', { x: Number(c.xy_buy), y: Math.max(1, Number(c.xy_free) || 1) });
    return '';
  }
  const na = polozka ? ` na ${polozka}` : '';
  if (kind === 'percent' && Number(c.percent_off) > 0) return `Sleva ${Number(c.percent_off)} %${na}`;
  if (kind === 'amount' && Number(c.amount_off) > 0) return `Sleva ${castka(Number(c.amount_off))}${na}`;
  if (kind === 'free_item') return polozka ? `Zdarma: ${polozka}` : 'Položka zdarma';
  if (kind === 'xy' && Number(c.xy_buy) > 0) return `${Number(c.xy_buy)}+${Math.max(1, Number(c.xy_free) || 1)} zdarma${polozka ? `: ${polozka}` : ''}`;
  return '';
}

/** Štítky podmínek, které mají viset na kartě kuponu (host i obsluha). */
export function conditionBadges(c: any, castka: FormatCastky = VCH_KORUNY, t?: PrekladacPopisku): string[] {
  if (t) return conditionBadgesT(c, castka, t);
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
  const vyloucene = [...odkazyList(c.excluded_items, 'itemId'), ...odkazyList(c.excluded_sections, 'sectionId')].map(x => x.name).filter(Boolean);
  if (vyloucene.length) out.push(`mimo: ${vyloucene.slice(0, 3).join(', ')}${vyloucene.length > 3 ? ` a ${vyloucene.length - 3} dalších` : ''}`);
  return out;
}

/** Totéž co conditionBadges, v jazyce překladače (dny podle Intl, 1 = pondělí). */
function conditionBadgesT(c: any, castka: FormatCastky, t: PrekladacPopisku): string[] {
  const out: string[] = [];
  if (Number(c.min_order_value) > 0) out.push(t('od {castka} útraty', { castka: castka(Number(c.min_order_value)) }));
  const tiers = tierList(c.target_tiers);
  if (tiers.length) out.push(t('jen {urovne}', { urovne: tiers.map(u => urovenT(t, u)).join(' / ') }));
  const days = intList(c.days_of_week).filter(d => d >= 1 && d <= 7);
  if (days.length && days.length < 7) {
    const jazyk = (jeJazyk(t.jazyk) ? t.jazyk : 'cs') as Jazyk;
    out.push(days.map(d => fmtDenVTydnu(d - 1, { jazyk }).replace(/\.$/, '')).join(', '));
  }
  if (c.hour_from && c.hour_till) out.push(`${c.hour_from}–${c.hour_till}`);
  if (c.adult_only === true) out.push('18+');
  const vyloucene = [...odkazyList(c.excluded_items, 'itemId'), ...odkazyList(c.excluded_sections, 'sectionId')].map(x => x.name).filter(Boolean);
  if (vyloucene.length) out.push(`${t('mimo: {co}', { co: vyloucene.slice(0, 3).join(', ') })}${vyloucene.length > 3 ? ` ${t('a {n} další', { n: vyloucene.length - 3 })}` : ''}`);
  return out;
}
