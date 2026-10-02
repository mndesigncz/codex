// Pole kuponu: normalizace těla požadavku a kontrola pravidel. Čistá logika —
// stejnou kontrolu volá server (app/api/client/admin/coupons) i editor v UI,
// takže správce chybu uvidí dřív, než formulář odešle, a server ji stejně neprojde.

export const BENEFITS = ['text', 'percent', 'amount', 'free_item', 'xy'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIERS = ['bronze', 'silver', 'gold', 'platinum'];

const pos = (v: any, max: number): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : null;
};

export function normalizujKupon(b: any) {
  const days = Array.isArray(b.daysOfWeek)
    ? Array.from(new Set(b.daysOfWeek.map((x: any) => Math.round(Number(x))).filter((n: number) => n >= 1 && n <= 7))).sort() as number[]
    : [];
  return {
    title: String(b.title ?? '').trim().slice(0, 80),
    description: String(b.description ?? '').trim().slice(0, 200),
    cost_points: Math.max(0, Math.min(100000, Math.round(Number(b.costPoints ?? b.cost_points)) || 0)),
    active: b.active !== false,
    draft: b.draft === true,
    benefit_kind: (BENEFITS as readonly string[]).includes(b.benefitKind) ? b.benefitKind as string : 'text',
    percent_off: pos(b.percentOff, 100),
    amount_off: pos(b.amountOff, 100000),
    xy_buy: pos(b.xyBuy, 50),
    xy_free: pos(b.xyFree, 50),
    min_order_value: pos(b.minOrderValue, 100000),
    max_total: pos(b.maxTotal, 1000000),
    daily_limit: pos(b.dailyLimit, 100000),
    target_tiers: Array.isArray(b.targetTiers) ? b.targetTiers.map(String).filter((t: string) => TIERS.includes(t)).slice(0, 4) as string[] : [] as string[],
    target_groups: Array.isArray(b.targetGroups) ? b.targetGroups.map((x: any) => Math.round(Number(x))).filter((n: number) => n > 0).slice(0, 50) as number[] : [] as number[],
    per_customer: Math.max(0, Math.min(100, Math.round(Number(b.perCustomer)) || 0)),
    cooldown_days: Math.max(0, Math.min(365, Math.round(Number(b.cooldownDays)) || 0)),
    days_of_week: days.length && days.length < 7 ? days : null,
    hour_from: HM_RE.test(String(b.hourFrom)) ? String(b.hourFrom) : null,
    hour_till: HM_RE.test(String(b.hourTill)) ? String(b.hourTill) : null,
    adult_only: b.adultOnly === true,
    welcome: b.welcome === true,
    valid_since: DATE_RE.test(String(b.validSince)) ? String(b.validSince) : null,
    valid_until: DATE_RE.test(String(b.validUntil ?? b.valid_until)) ? String(b.validUntil ?? b.valid_until) : null,
  };
}
export type PoleKuponu = ReturnType<typeof normalizujKupon>;

/** Chyba pravidel (věta pro člověka), nebo null. `surove` je původní tělo: text, který se nepodařilo přečíst, se nesmí tiše zahodit. */
export function zkontrolujKupon(f: PoleKuponu, surove?: any): string | null {
  if (!f.title) return 'Kupon potřebuje název.';
  if (f.benefit_kind === 'percent' && !f.percent_off) return 'Zadej, kolik procent slevy kupon dává.';
  if (f.benefit_kind === 'amount' && !f.amount_off) return 'Zadej výši slevy.';
  if (f.benefit_kind === 'xy' && !f.xy_buy) return 'Zadej, kolik kusů host kupuje (X z X+Y).';
  // Půlku okna zadat nejde: „od 22:00" bez „do" by se tiše ignorovalo.
  if (!!f.hour_from !== !!f.hour_till) return 'Vyplň obě hodiny, nebo žádnou.';
  if (f.hour_from && f.hour_from === f.hour_till) return 'Hodiny „od" a „do" se nesmí rovnat. Okno přes půlnoc (22:00–02:00) je v pořádku.';
  if (surove) {
    if (String(surove.hourFrom ?? '') && !f.hour_from) return 'Hodina „od" nemá platný tvar (HH:MM).';
    if (String(surove.hourTill ?? '') && !f.hour_till) return 'Hodina „do" nemá platný tvar (HH:MM).';
    if (String(surove.validSince ?? '') && !f.valid_since) return 'Datum „platí od" nemá platný tvar.';
    if (String(surove.validUntil ?? '') && !f.valid_until) return 'Datum „platí do" nemá platný tvar.';
  }
  if (f.valid_since && f.valid_until && f.valid_since > f.valid_until) return 'Kupon nemůže začít platit po svém konci. Zkontroluj „platí od" a „platí do".';
  if (f.benefit_kind === 'amount' && f.amount_off && f.min_order_value && f.amount_off > f.min_order_value) {
    return 'Sleva je vyšší než minimální útrata. Zvyš minimum, nebo sniž slevu.';
  }
  if (f.max_total && f.daily_limit && f.daily_limit > f.max_total) return 'Denní limit uplatnění je vyšší než celkový počet kusů.';
  if (f.welcome && f.cost_points > 0) return 'Uvítací kupon dostane člen zdarma. Nastav cenu na 0 bodů.';
  return null;
}
