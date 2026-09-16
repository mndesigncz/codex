// Jediné místo, kde vzniká Stripe klient. Klíč jde vždy z env (viz
// docs/stripe.md), nikdy z kódu; když chybí, integrace se tváří jako
// nenainstalovaná a UI nabídne původní „Mám zájem o Pro".
//
// Verze API se přibíjí natvrdo, aby ji tichá změna na účtu ve Stripe
// Dashboardu nemohla rozbít tvar webhooků a odpovědí.

import Stripe from 'stripe';

export const STRIPE_API_VERSION = '2026-08-26.dahlia' as const;

let client: Stripe | null = null;

/** Je Stripe vůbec nakonfigurovaný? (Bez klíče nic nevoláme.) */
export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY není nastavený.');
    client = new Stripe(key, {
      apiVersion: STRIPE_API_VERSION,
      appInfo: { name: 'Managero', url: 'https://managero.app' },
      // Vercel Hobby má na funkci ~10 s; jeden pokus navíc se ještě vejde.
      maxNetworkRetries: 1,
      timeout: 8000,
    });
  }
  return client;
}

/** Veřejná adresa aplikace pro návratové URL z Checkoutu a onboardingu. */
export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://managero.app';
  return raw.replace(/\/+$/, '');
}

/** ID ceny Pro (měsíčně) — vytvořená v Dashboardu, viz docs/stripe.md. */
export function proPriceId(): string | null {
  return process.env.STRIPE_PRICE_PRO_MONTHLY || null;
}

/**
 * Stripe Tax se zapíná až po registraci k DPH ve Stripe (Dashboard → Tax).
 * Bez registrace Stripe daň tiše nepočítá, tak se to nezapíná automaticky.
 */
export function taxEnabled(): boolean {
  const v = (process.env.STRIPE_TAX_ENABLED ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Provize platformy z online plateb hostů, v procentech (0 = bez provize). */
export function platformFeePercent(): number {
  const n = Number(process.env.STRIPE_PLATFORM_FEE_PERCENT ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 0;
}

export type { Stripe };
