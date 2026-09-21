// Plans and (future) billing — the single source of truth for what each plan
// includes, so the pricing page, settings and future enforcement all agree.
// Payments themselves (Stripe) come later; until PLAN_ENFORCED flips, nothing
// is actually blocked — the matrix is shown, not enforced.

export type PlanId = 'free' | 'pro' | 'max';
export type Interval = 'month' | 'year';

/** Stav předplatného ve Stripe, tak jak ho zrcadlí webhook. */
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused';

export interface PlanInfo {
  /** Stored plan on the team row. */
  plan: PlanId;
  /** What the team actually gets right now (an active trial ⇒ the trialed plan). */
  effective: PlanId;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  trialing: boolean;
  /** Platba selhala, Stripe ji zkouší znovu; přístup zatím zůstává. */
  pastDue: boolean;
  /** Předplatné končí k datu (zrušeno, ale ještě zaplacené období). */
  cancelAt: string | null;
  interval: Interval | null;
  subscriptionStatus: SubscriptionStatus | null;
  /** Do kdy platí nabídka Max −30 % po koupi Pro. */
  maxOfferUntil: string | null;
  /** Tým někdy měl předplatné (trial se nabízí jen jednou). */
  hadSubscription: boolean;
  /** Tarif nastavený ručně správcem platformy; přebíjí Stripe i trial. */
  override: PlanId | null;
}

export const TRIAL_DAYS = 30;
export const MAX_OFFER_DAYS = 7;
export const MAX_OFFER_PCT = 30;
export const REFERRALS_PER_MONTH = 3;

/** Hard numbers for enforcement; null = unlimited. */
export const LIMITS: Record<PlanId, { members: number | null; shareLinks: number | null }> = {
  free: { members: 3, shareLinks: 1 },
  pro: { members: null, shareLinks: null },
  max: { members: null, shareLinks: null },
};

/** Ceny v Kč. Roční má přeškrtnutou „srovnávací“ cenu (12 × měsíc, u Pro 4 990 dle zadání). */
export const PRICES: Record<Exclude<PlanId, 'free'>, { month: number; year: number; yearCompare: number }> = {
  pro: { month: 499, year: 3990, yearCompare: 4990 },
  max: { month: 999, year: 7990, yearCompare: 9988 },
};
export const PLAN_NAMES: Record<PlanId, string> = { free: 'Zdarma', pro: 'Pro', max: 'Max' };
export function priceLabel(plan: Exclude<PlanId, 'free'>, interval: Interval): string {
  const p = PRICES[plan];
  return interval === 'year' ? `${p.year.toLocaleString('cs-CZ')} Kč ročně` : `${p.month} Kč měsíčně`;
}

/**
 * Freemium is ON: the Free plan is fully usable forever (shifts, closings,
 * tasks, chat, basic stock), Pro features lock after the trial with an
 * upgrade prompt. Existing teams were grandfathered to Pro by the migration.
 */
export const PLAN_ENFORCED = true;

export const PRO_PRICE = { monthly: PRICES.pro.month, currency: 'Kč', per: 'měsíčně za podnik' };

/** true/false = has it or not; a string shows as the cell text. */
export const PLAN_FEATURES: { label: string; free: string | boolean; pro: string | boolean; max: string | boolean }[] = [
  { label: 'Členů týmu', free: 'Až 3', pro: 'Neomezeně', max: 'Neomezeně' },
  { label: 'Směny, docházka a žádosti', free: true, pro: true, max: true },
  { label: 'Úkoly, návody a týmový chat', free: true, pro: true, max: true },
  { label: 'Uzávěrky s pohyby a počítáním bankovek', free: true, pro: true, max: true },
  { label: 'Sklad s hlídáním zásob a baleními', free: true, pro: true, max: true },
  { label: 'Sdílené menu pro zákazníky', free: '1 odkaz', pro: 'Neomezeně + vlastní vzhled', max: 'Neomezeně + vlastní vzhled' },
  { label: 'Kiosk režim pro tablet na prodejně', free: false, pro: true, max: true },
  { label: 'Hodnocení směn, odměny a úrovně', free: false, pro: true, max: true },
  { label: 'CSV exporty', free: false, pro: true, max: true },
  { label: 'Měsíční přehled podniku (tržby × mzdy × nákupy)', free: false, pro: true, max: true },
  { label: 'Managero client: věrnost, rezervace, objednávky od stolu', free: false, pro: false, max: true },
  { label: 'Napojení na pokladnu Storyous (tržby, odpisy, receptury)', free: false, pro: false, max: true },
  { label: 'Výroba vlastních produktů z receptur', free: false, pro: false, max: true },
];

/** Jen to, co Max přidává nad Pro — pro nabídku po koupi Pro. */
export const MAX_EXTRAS = PLAN_FEATURES.filter(f => f.pro === false && f.max === true).map(f => f.label);

/**
 * The team's plan, resolved from the raw row. Rows from before the migration
 * (plan missing/NULL) count as grandfathered Pro — an existing shop must never
 * wake up locked out.
 */
export function planInfoOf(
  row: {
    plan?: string | null; trial_ends_at?: string | Date | null;
    subscription_status?: string | null; subscription_interval?: string | null;
    current_period_end?: string | Date | null; cancel_at_period_end?: boolean | null;
    trial_end?: string | Date | null; max_offer_until?: string | Date | null;
    stripe_subscription_id?: string | null; had_subscription?: boolean | null;
    plan_override?: string | null;
  } | null | undefined,
  now = Date.now(),
): PlanInfo {
  const stored: PlanId = row?.plan === 'free' ? 'free' : row?.plan === 'max' ? 'max' : 'pro';
  // Ruční tarif od správce platformy (podpora, partner, náhrada za výpadek).
  // Přebíjí Stripe i zkušební dobu, ale `plan` (co platí ze Stripe) zůstává
  // uložený, aby se dalo kdykoli vrátit zpět.
  const override: PlanId | null = row?.plan_override === 'free' || row?.plan_override === 'pro' || row?.plan_override === 'max'
    ? row.plan_override : null;
  const status = (row?.subscription_status ?? null) as SubscriptionStatus | null;
  const ms = (v: any) => { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? t : null; };
  const iso = (t: number | null) => (t != null ? new Date(t).toISOString() : null);

  // Trial ze Stripe (s kartou) má přednost; starý trial bez karty (plan free +
  // trial_ends_at) platí dál pro týmy z doby před platbami.
  const stripeTrialEnd = status === 'trialing' ? ms(row?.trial_end) : null;
  const legacyTrialEnd = stored === 'free' ? ms(row?.trial_ends_at) : null;
  const trialEnd = stripeTrialEnd ?? legacyTrialEnd;
  const trialing = trialEnd != null && trialEnd > now;

  let effective: PlanId;
  if (override) effective = override;
  else if (status === 'trialing' && trialing) effective = stored === 'free' ? 'pro' : stored;
  else if (stored === 'free') effective = trialing ? 'pro' : 'free';
  else effective = stored;

  const trialDaysLeft = trialing && trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / 86400000)) : 0;
  const offer = ms(row?.max_offer_until);
  return {
    plan: stored,
    effective,
    override,
    trialEndsAt: iso(trialEnd),
    trialDaysLeft,
    trialing,
    pastDue: status === 'past_due',
    cancelAt: row?.cancel_at_period_end ? iso(ms(row?.current_period_end)) : null,
    interval: row?.subscription_interval === 'year' ? 'year' : row?.subscription_interval === 'month' ? 'month' : null,
    subscriptionStatus: status,
    maxOfferUntil: offer != null && offer > now && stored === 'pro' ? iso(offer) : null,
    hadSubscription: !!row?.had_subscription || !!row?.stripe_subscription_id,
  };
}

export function czDays(n: number): string {
  return `${n} ${n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní'}`;
}

export function planLabel(p: PlanInfo): string {
  if (p.trialing) return `${PLAN_NAMES[p.effective]} — zkušební, zbývá ${czDays(p.trialDaysLeft)}`;
  return PLAN_NAMES[p.effective];
}

/** Pro nebo výš. */
export function isPro(p: PlanInfo | null | undefined): boolean {
  return !p || p.effective === 'pro' || p.effective === 'max';
}
export function isMax(p: PlanInfo | null | undefined): boolean {
  return !p || p.effective === 'max';
}

/** Server-side: may the team add another (non-kiosk) member? */
export function canAddMember(p: PlanInfo, currentCount: number): boolean {
  if (!PLAN_ENFORCED || p.effective !== 'free') return true;
  const limit = LIMITS.free.members;
  return limit == null || currentCount < limit;
}

export const MEMBER_LIMIT_MSG =
  `Plán Zdarma má až ${LIMITS.free.members} členy týmu. Pro neomezený tým přejděte na Pro v Nastavení → Předplatné.`;
export const SHARE_LIMIT_MSG =
  'Plán Zdarma má 1 aktivní sdílený odkaz. Více odkazů a vlastní vzhled odemyká Pro.';
export const MAX_ONLY_MSG =
  'Tahle funkce je součástí plánu Max (Managero client, pokladna, výroba). Odemkneš ji v Nastavení → Předplatné.';
