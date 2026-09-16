// Čistá logika kolem Stripe: bez SDK a bez databáze, aby se dala testovat
// v `npm test`. Všechno, co rozhoduje o penězích nebo o tom, jestli má
// podnik Pro, je tady — routy a webhooky jen volají tyhle funkce.

import type { PlanId } from './plan';

/** Stavy předplatného, jak je posílá Stripe. */
export type SubscriptionStatus =
  | 'incomplete' | 'incomplete_expired' | 'trialing' | 'active'
  | 'past_due' | 'canceled' | 'unpaid' | 'paused';

/**
 * Jaký plán podniku ze stavu předplatného plyne.
 *
 * `past_due` zůstává Pro: Stripe platbu sám zkouší znovu (Smart Retries)
 * a podnik nemá přijít o kiosk uprostřed směny kvůli expirované kartě.
 * Teprve `unpaid` / `canceled` (konec dunningu) znamená Zdarma.
 */
export function planForSubscription(status: string | null | undefined): PlanId {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
      return 'pro';
    default:
      return 'free';
  }
}

/** Předplatné, které ještě žije (má smysl nabízet portál, ne nový nákup). */
export function subscriptionLive(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due' || status === 'paused';
}

/** Koruny → haléře. Stripe počítá v nejmenší jednotce měny. */
export function czkToMinor(czk: number | string | null | undefined): number {
  const n = Number(String(czk ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/** Stripe odmítne platbu v CZK pod 15 Kč. */
export const MIN_CHARGE_MINOR = 1500;

/**
 * Provize platformy z jedné platby (v haléřích). Nikdy víc než částka
 * sama a nikdy záporná — i když někdo do env napíše nesmysl.
 */
export function platformFeeMinor(amountMinor: number, percent: number): number {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0;
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  const fee = Math.round((amountMinor * Math.min(percent, 100)) / 100);
  return Math.max(0, Math.min(fee, amountMinor));
}

/** Řádky objednávky → položky Checkoutu. Cena vždy z DB řádku, ne z klienta. */
export interface OrderLineLike { name: string; price: number | string; count: number | string }
export interface CheckoutLine { name: string; unitAmount: number; quantity: number }

export function checkoutLines(items: OrderLineLike[] | null | undefined): CheckoutLine[] {
  if (!Array.isArray(items)) return [];
  const out: CheckoutLine[] = [];
  for (const l of items) {
    const quantity = Math.floor(Number(l?.count));
    const unitAmount = czkToMinor(l?.price);
    if (!Number.isFinite(quantity) || quantity <= 0 || unitAmount <= 0) continue;
    out.push({ name: String(l.name ?? 'Položka').slice(0, 120), unitAmount, quantity });
  }
  return out;
}

export function linesTotalMinor(lines: CheckoutLine[]): number {
  return lines.reduce((s, l) => s + l.unitAmount * l.quantity, 0);
}

/**
 * Štítek Checkout Session pro Dashboard (`integration_identifier`):
 * název + 8 náhodných písmen, jak chce Stripe.
 */
export function integrationId(label: string, rand: () => number = Math.random): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += letters[Math.floor(rand() * letters.length) % letters.length];
  return `${label.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}_${suffix}`;
}

/** Zaplacená Checkout Session — jen tehdy se objednávka bere jako uhrazená. */
export function sessionPaid(session: { payment_status?: string | null } | null | undefined): boolean {
  const s = session?.payment_status;
  return s === 'paid' || s === 'no_payment_required';
}

/**
 * Je propojený účet (Accounts v2) připravený přijímat platby kartou?
 * Rozhoduje stav capability, ne zastaralé `charges_enabled`.
 */
export function merchantReady(account: any): boolean {
  return account?.configuration?.merchant?.capabilities?.card_payments?.status === 'active';
}

/** Kolik požadavků ještě Stripe od propojeného účtu chce (0 = nic). */
export function requirementsDue(account: any): number {
  const entries = account?.requirements?.entries;
  return Array.isArray(entries) ? entries.length : 0;
}

/**
 * Konec aktuálního období předplatného. Od verze API 2025-03 (basil) je
 * na položce předplatného, dřív byl na předplatném samém — bereme obojí.
 */
export function periodEndOf(sub: any): Date | null {
  const raw = sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
}

/** ID předplatného z faktury (nový tvar `parent.subscription_details` i starý `subscription`). */
export function subscriptionIdOfInvoice(inv: any): string | null {
  const nested = inv?.parent?.subscription_details?.subscription;
  const raw = nested ?? inv?.subscription;
  if (!raw) return null;
  return typeof raw === 'string' ? raw : raw.id ?? null;
}

/** ID z objektu nebo rozbaleného objektu (Stripe posílá obojí). */
export function idOf(v: any): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : v.id ?? null;
}

/** Celé číslo z metadat / client_reference_id, jinak null. */
export function intOf(v: any): number | null {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
