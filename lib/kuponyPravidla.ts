// Kupony a promo kódy — čistá logika bez databáze (testy: scripts/testy/k81-kupony.ts).
// Tady je to, co rozhoduje a počítá: okno platnosti (i přes půlnoc), cílení,
// stav kuponu (koncept / naplánováno / aktivní / archiv), kontrola uplatnění
// u kasy (útrata, 18+), popis změn pro historii, souhrn uplatnění s ROI,
// CSV exporty a náhled kuponu pohledem hosta. SQL je v lib/coupons.ts
// a v API pod app/api/client/admin/.

import { pragueToday, pragueHM, dayPlus } from './pragueTime.ts';
import { TIER_LABELS, VCH_KORUNY, intList, tierList, benefitLabel, conditionBadges, type FormatCastky } from './kuponyPopisky.ts';
import { casZDb, DEN_MS } from './segmenty.ts';
import { csvPole } from './poukazy.ts';

export const BENEFITS = ['text', 'percent', 'amount', 'free_item', 'xy'] as const;
export type BenefitKind = typeof BENEFITS[number];
export const STAVY_ULOZENE = ['draft', 'live', 'archived'] as const;
export type StavUlozeny = typeof STAVY_ULOZENE[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIERS = ['bronze', 'silver', 'gold', 'platinum'];

/** Veřejný tvar kuponu pro editor i stránku hosta (camelCase, bez balastu). */
export function shapeCoupon(r: any, castka?: FormatCastky) {
  return {
    id: Number(r.id), title: String(r.title), description: String(r.description ?? ''),
    costPoints: Number(r.cost_points) || 0, active: r.active !== false,
    status: (STAVY_ULOZENE as readonly string[]).includes(r.status) ? String(r.status) : 'live',
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
    totalLimit: r.total_limit == null ? null : Number(r.total_limit),
    dailyLimit: r.daily_limit == null ? null : Number(r.daily_limit),
    issued: r.issued == null ? null : Number(r.issued),
    menuItemId: r.menu_item_id == null ? null : Number(r.menu_item_id),
    itemName: r.item_name ? String(r.item_name) : null,
    excludedItems: intList(r.excluded_items),
    excludedCategories: textList(r.excluded_categories),
    benefit: benefitLabel(r, castka), badges: conditionBadges(r, castka),
  };
}

function textList(raw: any, max = 30): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((x: any) => String(x ?? '').trim().slice(0, 60)).filter(Boolean))).slice(0, max) as string[];
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

/** Hodiny „od–do" přes půlnoc (22:00–02:00)? */
export function presPulnoc(c: any): boolean {
  return !!(c.hour_from && c.hour_till && String(c.hour_from) > String(c.hour_till));
}

/**
 * Platí kupon právě teď (datum, den v týdnu, hodiny)? Vrací důvod, když ne.
 * Hodiny přes půlnoc (22:00–02:00) platí večer i po půlnoci; po půlnoci se
 * den v týdnu počítá ještě k večeru, kdy okno začalo.
 */
export function windowOk(c: any, now: { today: string; hm: string } = { today: pragueToday(), hm: pragueHM() }): string | null {
  if (c.valid_since && String(c.valid_since) > now.today) return `Platí až od ${String(c.valid_since)}.`;
  if (c.valid_until && String(c.valid_until) < now.today) return 'Kupon už neplatí.';
  const hf = c.hour_from ? String(c.hour_from) : '';
  const ht = c.hour_till ? String(c.hour_till) : '';
  const noc = presPulnoc(c);
  const ponoci = noc && now.hm <= ht;
  const days = intList(c.days_of_week);
  const denOkna = ponoci ? dayPlus(now.today, -1) : now.today;
  if (days.length && !days.includes(pragueDow(denOkna))) return ponoci ? 'Včerejší večer kupon neplatil.' : 'Dnes kupon neplatí.';
  if (hf && ht) {
    const uvnitr = noc ? (now.hm >= hf || now.hm <= ht) : (now.hm >= hf && now.hm <= ht);
    if (!uvnitr) return `Kupon platí jen ${hf}–${ht}.`;
  }
  return null;
}

/** Cílení bez databáze: úroveň a 18+. Skupiny a limity řeší claimBlocker v lib/coupons.ts. */
export function urovenBlocker(c: any, tierId: string): string | null {
  const tiers = tierList(c.target_tiers);
  if (tiers.length && !tiers.includes(tierId)) return `Jen pro ${tiers.map(t => TIER_LABELS[t]).join(' / ')}.`;
  return null;
}

export function cileniBlocker(c: any, ctx: { tierId: string; birthday: string | null; today?: string }): string | null {
  const uroven = urovenBlocker(c, ctx.tierId);
  if (uroven) return uroven;
  if (c.adult_only === true) {
    const age = ageFrom(ctx.birthday, ctx.today ?? pragueToday());
    if (age == null) return 'Kupon je 18+ — doplň si datum narození v Moje → Účet.';
    if (age < 18) return 'Kupon je jen pro plnoleté.';
  }
  return null;
}

// ---- Stav kuponu ---------------------------------------------------------------------

export type StavKuponu = 'koncept' | 'naplanovano' | 'aktivni' | 'pozastaveno' | 'prosly' | 'vycerpano' | 'archiv';
export const STAV_KUPONU_POPISEK: Record<StavKuponu, string> = {
  koncept: 'Koncept', naplanovano: 'Naplánováno', aktivni: 'Aktivní', pozastaveno: 'Pozastaveno',
  prosly: 'Prošlý', vycerpano: 'Vyčerpáno', archiv: 'Archiv',
};

/** Stav kuponu pro správu: koncept a archiv jsou uložené, ostatní se odvodí z dat. */
export function stavKuponu(c: any, today: string = pragueToday()): StavKuponu {
  if (c.status === 'draft') return 'koncept';
  if (c.status === 'archived') return 'archiv';
  if (c.valid_until && String(c.valid_until) < today) return 'prosly';
  if (c.active === false) return 'pozastaveno';
  if (Number(c.total_limit) > 0 && Number(c.issued) >= Number(c.total_limit)) return 'vycerpano';
  if (c.valid_since && String(c.valid_since) > today) return 'naplanovano';
  return 'aktivni';
}

/** Vidí kupon host (stránka podniku, uvítací balíček)? Jen živý a zapnutý; koncept a archiv ne. */
export function jeVeVerejne(c: any): boolean {
  return (c.status == null || c.status === 'live') && c.active !== false;
}

// ---- Vstup z editoru ---------------------------------------------------------------

function pos(v: any, max: number): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : null;
}

/** Normalizované hodnoty kuponu z těla požadavku (snake_case jako sloupce). */
export function hodnotyKuponu(b: any) {
  const days = Array.isArray(b.daysOfWeek)
    ? Array.from(new Set(b.daysOfWeek.map((x: any) => Math.round(Number(x))).filter((n: number) => n >= 1 && n <= 7))).sort() as number[]
    : [];
  const stav = (STAVY_ULOZENE as readonly string[]).includes(b.status) ? String(b.status) as StavUlozeny : 'live';
  return {
    title: String(b.title ?? '').trim().slice(0, 80),
    description: String(b.description ?? '').trim().slice(0, 200),
    cost_points: Math.max(0, Math.min(100000, Math.round(Number(b.costPoints ?? b.cost_points)) || 0)),
    active: b.active !== false,
    status: stav,
    benefit_kind: (BENEFITS as readonly string[]).includes(b.benefitKind) ? String(b.benefitKind) : 'text',
    percent_off: pos(b.percentOff, 100),
    amount_off: pos(b.amountOff, 100000),
    xy_buy: pos(b.xyBuy, 50),
    xy_free: pos(b.xyFree, 50),
    min_order_value: pos(b.minOrderValue, 100000),
    target_tiers: Array.isArray(b.targetTiers) ? b.targetTiers.map(String).filter((t: string) => TIERS.includes(t)).slice(0, 4) : [] as string[],
    target_groups: Array.isArray(b.targetGroups) ? b.targetGroups.map((x: any) => Math.round(Number(x))).filter((n: number) => n > 0).slice(0, 50) : [] as number[],
    per_customer: Math.max(0, Math.min(100, Math.round(Number(b.perCustomer)) || 0)),
    cooldown_days: Math.max(0, Math.min(365, Math.round(Number(b.cooldownDays)) || 0)),
    days_of_week: days.length && days.length < 7 ? days : null,
    hour_from: HM_RE.test(String(b.hourFrom)) ? String(b.hourFrom) : null,
    hour_till: HM_RE.test(String(b.hourTill)) ? String(b.hourTill) : null,
    adult_only: b.adultOnly === true,
    welcome: b.welcome === true,
    valid_since: DATE_RE.test(String(b.validSince)) ? String(b.validSince) : null,
    valid_until: DATE_RE.test(String(b.validUntil ?? b.valid_until)) ? String(b.validUntil ?? b.valid_until) : null,
    total_limit: pos(b.totalLimit, 1000000),
    daily_limit: pos(b.dailyLimit, 100000),
    menu_item_id: pos(b.menuItemId, 2147483000),
    excluded_items: Array.isArray(b.excludedItems) ? Array.from(new Set(b.excludedItems.map((x: any) => Math.round(Number(x))).filter((n: number) => n > 0))).slice(0, 100) as number[] : [] as number[],
    excluded_categories: textList(b.excludedCategories),
  };
}
export type HodnotyKuponu = ReturnType<typeof hodnotyKuponu>;

/** Chyba v hodnotách kuponu, nebo null. Hodiny přes půlnoc jsou v pořádku, shodné ne. */
export function kontrolaKuponu(f: HodnotyKuponu): string | null {
  if (!f.title) return 'Kupon potřebuje název.';
  if (f.benefit_kind === 'percent' && !f.percent_off) return 'Zadej, kolik procent slevy kupon dává.';
  if (f.benefit_kind === 'amount' && !f.amount_off) return 'Zadej slevu v měně podniku.';
  if (f.benefit_kind === 'xy' && !f.xy_buy) return 'Zadej, kolik kusů host kupuje (X z X+Y).';
  if (f.hour_from && f.hour_till && f.hour_from === f.hour_till) return 'Hodiny „od" a „do" jsou stejné. Pro celý den je nech prázdné.';
  if ((f.hour_from && !f.hour_till) || (!f.hour_from && f.hour_till)) return 'Vyplň hodiny „od" i „do", nebo obě nech prázdné.';
  if (f.valid_since && f.valid_until && f.valid_since > f.valid_until) return 'Kupon nemůže platit „do" dřív než „od".';
  if (f.menu_item_id && f.excluded_items.includes(f.menu_item_id)) return 'Položka, na kterou kupon platí, nemůže být zároveň vyloučená.';
  return null;
}

// ---- Historie změn ------------------------------------------------------------------

const DNY_NAZVY = ['', 'po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
const POLE_ZMEN: { k: string; label: string; fmt?: (v: any) => string }[] = [
  { k: 'title', label: 'název' },
  { k: 'description', label: 'popis' },
  { k: 'cost_points', label: 'cena', fmt: v => `${Number(v) || 0} b.` },
  { k: 'status', label: 'stav', fmt: v => (v === 'draft' ? 'koncept' : v === 'archived' ? 'archiv' : 'živý') },
  { k: 'active', label: 'zapnutý', fmt: v => (v === false ? 'ne' : 'ano') },
  { k: 'benefit_kind', label: 'typ výhody', fmt: v => ({ text: 'vlastní', percent: 'sleva %', amount: 'sleva v měně', free_item: 'zdarma', xy: 'X+Y' } as Record<string, string>)[String(v)] ?? String(v) },
  { k: 'percent_off', label: 'sleva %', fmt: v => (v == null ? '—' : `${v} %`) },
  { k: 'amount_off', label: 'sleva', fmt: v => (v == null ? '—' : String(v)) },
  { k: 'xy_buy', label: 'X' }, { k: 'xy_free', label: 'Y' },
  { k: 'min_order_value', label: 'min. útrata' },
  { k: 'target_tiers', label: 'úrovně', fmt: v => (tierList(v).map(t => TIER_LABELS[t]).join(', ') || 'všem') },
  { k: 'target_groups', label: 'skupiny', fmt: v => (intList(v).length ? `${intList(v).length}` : 'všem') },
  { k: 'per_customer', label: 'limit na hosta' },
  { k: 'cooldown_days', label: 'cooldown (dní)' },
  { k: 'days_of_week', label: 'dny', fmt: v => (intList(v).map(d => DNY_NAZVY[d]).join(', ') || 'každý') },
  { k: 'hour_from', label: 'od hodiny' }, { k: 'hour_till', label: 'do hodiny' },
  { k: 'adult_only', label: '18+', fmt: v => (v === true ? 'ano' : 'ne') },
  { k: 'welcome', label: 'uvítací', fmt: v => (v === true ? 'ano' : 'ne') },
  { k: 'valid_since', label: 'platí od' }, { k: 'valid_until', label: 'platí do' },
  { k: 'total_limit', label: 'limit kusů' }, { k: 'daily_limit', label: 'limit uplatnění za den' },
  { k: 'menu_item_id', label: 'položka nabídky', fmt: v => (v == null ? 'žádná' : `č. ${v}`) },
  { k: 'excluded_items', label: 'vyloučené položky', fmt: v => `${intList(v).length}` },
  { k: 'excluded_categories', label: 'vyloučené kategorie', fmt: v => (textList(v).join(', ') || 'žádné') },
];

function hodnotaProPorovnani(k: string, v: any): string {
  if (v === undefined || v === null || v === '') return '';
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  return String(v);
}

/** Co se na kuponu změnilo (stará řádka z databáze × nové hodnoty). Prázdné pole = beze změny. */
export function popisZmen(stary: any, novy: Record<string, any>): string[] {
  const out: string[] = [];
  for (const p of POLE_ZMEN) {
    if (!(p.k in novy)) continue;
    if (hodnotaProPorovnani(p.k, stary?.[p.k]) === hodnotaProPorovnani(p.k, novy[p.k])) continue;
    const f = p.fmt ?? ((v: any) => (v == null || v === '' ? '—' : String(v)));
    out.push(`${p.label}: ${f(stary?.[p.k])} → ${f(novy[p.k])}`);
  }
  return out;
}

/** Důvody, proč kupon někomu při rozeslání nešel dát (počty pro obsluhu). */
export interface PreskoceniKuponu { drzi: number; cileni: number; limit: number; vycerpano: number; neclen: number }

/** Věta o výsledku rozeslání pro obsluhu: „Odesláno 12. Přeskočeno 3: 2 už kupon drží, 1 mimo cílení." */
export function vetaORozeslani(komu: number, p: PreskoceniKuponu): string {
  const dvody = [
    p.drzi ? `${p.drzi} už kupon drží` : '', p.cileni ? `${p.cileni} mimo cílení kuponu` : '',
    p.limit ? `${p.limit} má vyčerpaný limit na hosta` : '', p.vycerpano ? 'došly kusy kuponu' : '', p.neclen ? `${p.neclen} není člen` : '',
  ].filter(Boolean);
  return dvody.length ? `Odesláno: ${komu}. Přeskočeno: ${dvody.join(', ')}.` : `Odesláno: ${komu}.`;
}

// ---- Uplatnění u kasy -----------------------------------------------------------------

export type VysledekKontroly = { ok: true } | { ok: false; kod: 'castka' | 'min' | 'vek' | 'nezletily' | 'vycerpanyDen'; zprava: string };

/**
 * Kontrola před uplatněním: minimální útrata (obsluha ji zadá) a 18+.
 * U 18+ s datem narození rozhoduje datum; bez něj musí obsluha potvrdit občanku.
 */
export function kontrolaUplatneni(
  c: any,
  v: { amount: number | null; vekOvereny: boolean; birthday: string | null; today?: string },
  castka: FormatCastky = VCH_KORUNY,
): VysledekKontroly {
  const min = Number(c.min_order_value) || 0;
  if (min > 0) {
    if (v.amount == null) return { ok: false, kod: 'castka', zprava: `Zadej útratu hosta. Kupon platí od ${castka(min)}.` };
    if (v.amount < min) return { ok: false, kod: 'min', zprava: `Útrata ${castka(v.amount)} nestačí, kupon platí od ${castka(min)}.` };
  }
  if (c.adult_only === true) {
    const age = ageFrom(v.birthday, v.today ?? pragueToday());
    if (age != null && age < 18) return { ok: false, kod: 'nezletily', zprava: 'Host je nezletilý, kupon je jen 18+.' };
    if (age == null && !v.vekOvereny) return { ok: false, kod: 'vek', zprava: 'Kupon je 18+. Zkontroluj občanku a potvrď věk.' };
  }
  return { ok: true };
}

/** Částka z těla požadavku: celé nezáporné číslo, jinak null (nezadáno). */
export function castkaZTela(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Math.round(Number(String(v).replace(',', '.').replace(/\s/g, '')));
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : null;
}

/** Odhad slevy z útraty, kterou obsluha zadala (jen % a pevná částka; ostatní nelze spočítat). */
export function odhadSlevy(c: any, amount: number | null): number {
  if (amount == null || amount <= 0) return 0;
  if (c.benefit_kind === 'percent' && Number(c.percent_off) > 0) return Math.round(amount * Number(c.percent_off) / 100);
  if (c.benefit_kind === 'amount' && Number(c.amount_off) > 0) return Math.min(amount, Number(c.amount_off));
  return 0;
}

// ---- Souhrn uplatnění (K5) -----------------------------------------------------------------

export interface RadekUplatneni {
  coupon_id?: number; claimed_at: any; redeemed_at: any; redeemed_amount?: number | null;
  valid_until?: string | null; source?: string | null; staff_name?: string | null;
  benefit_kind?: string | null; percent_off?: number | null; amount_off?: number | null;
}

export const ZDROJ_POPISEK: Record<string, string> = {
  points: 'Za body', welcome: 'Uvítací', promo: 'Promo kód', send: 'Poslal podnik', stamps: 'Za razítka', unknown: 'Neznámý',
};

export function souhrnUplatneni(rows: RadekUplatneni[], today: string = pragueToday()) {
  let uplatneno = 0, propadlo = 0, otevrene = 0, utrata = 0, sUtratou = 0, sleva = 0, dnuSum = 0, dnuN = 0;
  const obsluha = new Map<string, number>();
  const zdroje = new Map<string, number>();
  for (const r of rows) {
    const zdroj = r.source && r.source in ZDROJ_POPISEK ? r.source : 'unknown';
    zdroje.set(zdroj, (zdroje.get(zdroj) ?? 0) + 1);
    if (r.redeemed_at) {
      uplatneno += 1;
      const a = r.redeemed_amount == null ? null : Number(r.redeemed_amount);
      if (a != null && Number.isFinite(a)) { utrata += a; sUtratou += 1; sleva += odhadSlevy(r, a); }
      const jmeno = r.staff_name ? String(r.staff_name) : 'Neznámá obsluha';
      obsluha.set(jmeno, (obsluha.get(jmeno) ?? 0) + 1);
      const z = casZDb(r.claimed_at), u = casZDb(r.redeemed_at);
      if (z && u) { dnuSum += Math.max(0, (u.getTime() - z.getTime()) / DEN_MS); dnuN += 1; }
    } else if (r.valid_until && String(r.valid_until) < today) propadlo += 1;
    else otevrene += 1;
  }
  const vydano = rows.length;
  return {
    vydano, uplatneno, propadlo, otevrene,
    miraUplatneni: vydano ? Math.round(uplatneno / vydano * 100) : null,
    utrata, sUtratou, prumUtrata: sUtratou ? Math.round(utrata / sUtratou) : null,
    sleva,
    // Kolik útraty přišlo na každou jednotku slevy; bez spočítatelné slevy (X+Y, zdarma) se neukazuje.
    roi: sleva > 0 ? Math.round(utrata / sleva * 10) / 10 : null,
    prumDnuDoUplatneni: dnuN ? Math.round(dnuSum / dnuN * 10) / 10 : null,
    obsluha: Array.from(obsluha, ([jmeno, pocet]) => ({ jmeno, pocet })).sort((a, b) => b.pocet - a.pocet || a.jmeno.localeCompare(b.jmeno, 'cs')),
    zdroje: Array.from(zdroje, ([id, pocet]) => ({ id, popisek: ZDROJ_POPISEK[id], pocet })).sort((a, b) => b.pocet - a.pocet),
  };
}

// ---- Promo kódy ---------------------------------------------------------------------------

export const cistyKod = (v: any, max = 16) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max);
export const MAX_DAVKA_KODU = 200;

/** Důvod, proč promo kód nejde použít (null = jde). */
export function promoBlocker(p: any, today: string = pragueToday()): string | null {
  if (!p || p.active === false) return 'Tenhle kód neplatí.';
  if (p.valid_since && String(p.valid_since) > today) return `Kód platí až od ${String(p.valid_since)}.`;
  if (p.valid_until && String(p.valid_until) < today) return 'Tenhle kód neplatí.';
  if (p.max_uses && Number(p.uses) >= Number(p.max_uses)) return 'Kód už je vyčerpaný.';
  return null;
}

export type StavPromo = 'aktivni' | 'pozastaveno' | 'naplanovano' | 'prosly' | 'vycerpano';
export const STAV_PROMO_POPISEK: Record<StavPromo, string> = {
  aktivni: 'Aktivní', pozastaveno: 'Pozastaveno', naplanovano: 'Naplánováno', prosly: 'Prošlý', vycerpano: 'Vyčerpáno',
};
export function stavPromo(p: any, today: string = pragueToday()): StavPromo {
  if (p.valid_until && String(p.valid_until) < today) return 'prosly';
  if (p.active === false) return 'pozastaveno';
  if (p.max_uses && Number(p.uses) >= Number(p.max_uses)) return 'vycerpano';
  if (p.valid_since && String(p.valid_since) > today) return 'naplanovano';
  return 'aktivni';
}

const ABC_KODU = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Dávka unikátních kódů: předpona + náhodný zbytek bez zaměnitelných znaků. `rnd` vrací číslo 0–1 (v testu pevné). */
export function davkaKodu(o: { prefix: string; pocet: number; delka?: number }, obsazene: Set<string>, rnd: () => number = Math.random): string[] {
  const prefix = cistyKod(o.prefix, 8);
  const delka = Math.max(prefix.length + 3, Math.min(16, Math.round(o.delka ?? prefix.length + 5)));
  const pocet = Math.max(0, Math.min(MAX_DAVKA_KODU, Math.round(o.pocet)));
  const out: string[] = [];
  const videne = new Set(obsazene);
  let pokusy = 0;
  while (out.length < pocet && pokusy < pocet * 50 + 200) {
    pokusy += 1;
    let s = prefix;
    while (s.length < delka) s += ABC_KODU[Math.floor(rnd() * ABC_KODU.length) % ABC_KODU.length];
    if (videne.has(s)) continue;
    videne.add(s); out.push(s);
  }
  return out;
}

export interface HodnotyPromo {
  title: string; points: number; coupon_id: number | null; max_uses: number | null;
  valid_since: string | null; valid_until: string | null; active: boolean;
}

/** Hodnoty promo kódu z těla (kód samotný se řeší zvlášť). */
export function hodnotyPromo(b: any): HodnotyPromo {
  const cid = pos(b.coupon_id ?? b.couponId, 2147483000);
  return {
    title: String(b.title ?? '').trim().slice(0, 80),
    points: Math.max(0, Math.min(10000, Math.round(Number(b.points)) || 0)),
    coupon_id: cid,
    max_uses: pos(b.max_uses ?? b.maxUses, 1000000),
    valid_since: DATE_RE.test(String(b.valid_since ?? b.validSince ?? '')) ? String(b.valid_since ?? b.validSince) : null,
    valid_until: DATE_RE.test(String(b.valid_until ?? b.validUntil ?? '')) ? String(b.valid_until ?? b.validUntil) : null,
    active: b.active !== false,
  };
}

export function kontrolaPromo(h: HodnotyPromo): string | null {
  if (!h.title) return 'Promo kód potřebuje název.';
  if (!h.points && !h.coupon_id) return 'Kód musí dávat body, kupon, nebo obojí.';
  if (h.valid_since && h.valid_until && h.valid_since > h.valid_until) return 'Kód nemůže platit „do" dřív než „od".';
  return null;
}

// ---- CSV exporty ---------------------------------------------------------------------------

const BOM = '﻿';
const radky = (hlavicka: string[], data: unknown[][]) =>
  BOM + [hlavicka, ...data].map(r => r.map(csvPole).join(';')).join('\r\n') + '\r\n';
const den = (v: any) => (v ? String(v).slice(0, 10) : '');

export function kuponyCsv(kupony: any[], today: string = pragueToday(), castka: FormatCastky = VCH_KORUNY): string {
  return radky(
    ['Název', 'Stav', 'Výhoda', 'Cena (body)', 'Min. útrata', 'Platí od', 'Platí do', 'Pro úrovně', 'Limit kusů', 'Limit uplatnění za den', 'Vydáno', 'Uplatněno', 'Uvítací', '18+', 'Položka'],
    kupony.map(c => [
      c.title, STAV_KUPONU_POPISEK[stavKuponu(c, today)], benefitLabel(c, castka), Number(c.cost_points) || 0, c.min_order_value ?? '',
      den(c.valid_since), den(c.valid_until), tierList(c.target_tiers).map(t => TIER_LABELS[t]).join(' / '),
      c.total_limit ?? '', c.daily_limit ?? '', Number(c.claimed) || 0, Number(c.redeemed) || 0,
      c.welcome === true ? 'ano' : 'ne', c.adult_only === true ? 'ano' : 'ne', c.item_name ?? '',
    ]),
  );
}

export function claimyCsv(rows: any[], today: string = pragueToday()): string {
  return radky(
    ['Kupon', 'Kód', 'Host', 'Vydáno', 'Uplatněno', 'Útrata', 'Obsluha', 'Původ', 'Dnů do uplatnění', 'Stav'],
    rows.map(r => {
      const z = casZDb(r.claimed_at), u = casZDb(r.redeemed_at);
      const stav = r.redeemed_at ? 'uplatněno' : (r.valid_until && String(r.valid_until) < today ? 'propadlo' : 'čeká');
      return [
        r.title, r.code, r.customer_name ?? '', den(r.claimed_at), den(r.redeemed_at), r.redeemed_amount ?? '', r.staff_name ?? '',
        ZDROJ_POPISEK[r.source && r.source in ZDROJ_POPISEK ? r.source : 'unknown'],
        z && u ? Math.round(Math.max(0, (u.getTime() - z.getTime()) / DEN_MS) * 10) / 10 : '', stav,
      ];
    }),
  );
}

export function promoCsv(promos: any[], today: string = pragueToday()): string {
  return radky(
    ['Kód', 'Název', 'Stav', 'Body', 'Kupon', 'Použito', 'Limit použití', 'Platí od', 'Platí do'],
    promos.map(p => [
      p.code, p.title, STAV_PROMO_POPISEK[stavPromo(p, today)], Number(p.points) || 0, p.coupon_title ?? '',
      Number(p.uses) || 0, p.max_uses ?? '', den(p.valid_since), den(p.valid_until),
    ]),
  );
}

export function promoPouzitiCsv(rows: any[]): string {
  return radky(['Kód', 'Host', 'Kdy'], rows.map(r => [r.code, r.customer_name ?? '', den(r.used_at)]));
}

// ---- Náhled pohledem hosta (K7) -----------------------------------------------------------------

export interface NahledKuponu {
  title: string; description: string; benefit: string; badges: string[]; cost: number; costText: string; blocked: string | null;
}

/** Kupon tak, jak ho uvidí host dané úrovně právě teď. Stejné funkce jako stránka podniku. */
export function nahledKuponuHosta(
  c: any,
  host: { tierId: string; birthday?: string | null; member?: boolean },
  now: { today: string; hm: string } = { today: pragueToday(), hm: pragueHM() },
  castka?: FormatCastky,
): NahledKuponu {
  const s = shapeCoupon(c, castka);
  let blocked: string | null = null;
  const stav = stavKuponu(c, now.today);
  if (stav === 'koncept' || stav === 'archiv') blocked = 'Host kupon nevidí (koncept nebo archiv).';
  else if (stav === 'pozastaveno') blocked = 'Host kupon nevidí (je vypnutý).';
  else if (stav === 'vycerpano') blocked = 'Kupon je vyčerpaný.';
  else blocked = windowOk(c, now) ?? (host.member === false ? null : cileniBlocker(c, { tierId: host.tierId, birthday: host.birthday ?? '2000-01-01', today: now.today }));
  return {
    title: s.title, description: s.description, benefit: s.benefit, badges: s.badges,
    cost: s.costPoints, costText: s.costPoints === 0 ? 'zdarma' : `${s.costPoints} b.`, blocked,
  };
}

/** Co dostane host po zadání promo kódu (text pro náhled). */
export function nahledPromo(p: { points: number; title: string; coupon_title?: string | null }): string {
  const casti = [Number(p.points) > 0 ? `+${Number(p.points)} bodů` : '', p.coupon_title ? `kupon ${p.coupon_title}` : ''].filter(Boolean);
  return `${p.title || 'Promo kód'}: ${casti.join(' a ') || 'nic'}.`;
}
