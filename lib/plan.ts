// Plans and (future) billing — the single source of truth for what each plan
// includes, so the pricing page, settings and future enforcement all agree.
// Payments themselves (Stripe) come later; until PLAN_ENFORCED flips, nothing
// is actually blocked — the matrix is shown, not enforced.

export type PlanId = 'free' | 'pro';

export interface PlanInfo {
  /** Stored plan on the team row. */
  plan: PlanId;
  /** What the team actually gets right now (an active trial ⇒ pro). */
  effective: PlanId;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  trialing: boolean;
}

export const TRIAL_DAYS = 30;

/** Hard numbers for future enforcement; null = unlimited. */
export const LIMITS: Record<PlanId, { members: number | null; shareLinks: number | null }> = {
  free: { members: 3, shareLinks: 1 },
  pro: { members: null, shareLinks: null },
};

/**
 * Freemium is ON: the Free plan is fully usable forever (shifts, closings,
 * tasks, chat, basic stock), Pro features lock after the trial with an
 * upgrade prompt. Existing teams were grandfathered to Pro by the migration.
 */
export const PLAN_ENFORCED = true;

export const PRO_PRICE = { monthly: 249, currency: 'Kč', per: 'měsíčně za podnik' };

/** true/false = has it or not; a string shows as the cell text. */
export const PLAN_FEATURES: { label: string; free: string | boolean; pro: string | boolean }[] = [
  { label: 'Členů týmu', free: 'Až 3', pro: 'Neomezeně' },
  { label: 'Směny, docházka a žádosti', free: true, pro: true },
  { label: 'Úkoly, návody a týmový chat', free: true, pro: true },
  { label: 'Uzávěrky s pohyby a počítáním bankovek', free: true, pro: true },
  { label: 'Sklad s hlídáním zásob a baleními', free: true, pro: true },
  { label: 'Sdílené menu pro zákazníky', free: '1 odkaz', pro: 'Neomezeně + vlastní vzhled' },
  { label: 'Kiosk režim pro tablet na prodejně', free: false, pro: true },
  { label: 'Hodnocení směn, odměny a úrovně', free: false, pro: true },
  { label: 'CSV exporty', free: false, pro: true },
  { label: 'Měsíční přehled podniku (tržby × mzdy × nákupy)', free: false, pro: true },
];

/**
 * The team's plan, resolved from the raw row. Rows from before the migration
 * (plan missing/NULL) count as grandfathered Pro — an existing shop must never
 * wake up locked out.
 */
export function planInfoOf(
  row: { plan?: string | null; trial_ends_at?: string | Date | null } | null | undefined,
  now = Date.now(),
): PlanInfo {
  const stored: PlanId = row?.plan === 'free' ? 'free' : 'pro';
  const t = row?.trial_ends_at ? new Date(row.trial_ends_at).getTime() : null;
  const trialing = stored === 'free' && t != null && Number.isFinite(t) && t > now;
  const effective: PlanId = stored === 'pro' || trialing ? 'pro' : 'free';
  const trialDaysLeft = trialing && t ? Math.max(0, Math.ceil((t - now) / 86400000)) : 0;
  return {
    plan: stored,
    effective,
    trialEndsAt: t && Number.isFinite(t) ? new Date(t).toISOString() : null,
    trialDaysLeft,
    trialing,
  };
}

export function czDays(n: number): string {
  return `${n} ${n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní'}`;
}

export function planLabel(p: PlanInfo): string {
  if (p.trialing) return `Pro — zkušební, zbývá ${czDays(p.trialDaysLeft)}`;
  return p.effective === 'pro' ? 'Pro' : 'Zdarma';
}

export function isPro(p: PlanInfo | null | undefined): boolean {
  return !p || p.effective === 'pro';
}

/** Server-side: may the team add another (non-kiosk) member? */
export function canAddMember(p: PlanInfo, currentCount: number): boolean {
  if (!PLAN_ENFORCED || p.effective === 'pro') return true;
  const limit = LIMITS.free.members;
  return limit == null || currentCount < limit;
}

export const MEMBER_LIMIT_MSG =
  `Plán Zdarma má až ${LIMITS.free.members} členy týmu. Pro neomezený tým přejděte na Pro v Nastavení → Předplatné.`;
export const SHARE_LIMIT_MSG =
  'Plán Zdarma má 1 aktivní sdílený odkaz. Více odkazů a vlastní vzhled odemyká Pro.';
