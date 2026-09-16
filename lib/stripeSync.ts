// Zápis stavu ze Stripe do naší databáze. Volá se z webhooků a z návratů
// z Checkoutu / onboardingu. Zdroj pravdy je Stripe: my si jen ukládáme,
// co nám řekl, a z toho odvozujeme plán podniku a stav objednávky.

import { neon } from '@neondatabase/serverless';
import type Stripe from 'stripe';
import { getStripe } from './stripe';
import {
  planForSubscription, periodEndOf, idOf, intOf, merchantReady, requirementsDue, sessionPaid,
} from './stripeBilling';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Idempotence webhooků: Stripe stejnou událost klidně pošle dvakrát.
 * Vrací true, když ji vidíme poprvé a máme ji zpracovat.
 */
export async function firstTime(eventId: string, type: string): Promise<boolean> {
  const rows = await sql`
    INSERT INTO stripe_events (id, type) VALUES (${eventId}, ${type})
    ON CONFLICT (id) DO NOTHING RETURNING id`;
  return rows.length > 0;
}

/** Podnik podle zákazníka ve Stripe. */
export async function teamByCustomer(customerId: string | null): Promise<number | null> {
  if (!customerId) return null;
  const [t] = await sql`SELECT id FROM teams WHERE stripe_customer_id = ${customerId}`;
  return t ? Number(t.id) : null;
}

export async function linkCustomer(teamId: number, customerId: string): Promise<void> {
  await sql`UPDATE teams SET stripe_customer_id = ${customerId} WHERE id = ${teamId} AND (stripe_customer_id IS NULL OR stripe_customer_id <> ${customerId})`;
}

/**
 * Promítne předplatné do plánu podniku.
 *
 * Ochrana proti pořadí událostí: zrušení STARÉHO předplatného nesmí
 * shodit podnik, který si mezitím koupil nové — downgrade se proto
 * zapisuje jen tehdy, když jde o předplatné, které máme uložené.
 */
export async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const teamId = intOf(sub.metadata?.teamId) ?? (await teamByCustomer(idOf(sub.customer)));
  if (!teamId) { console.warn('stripe: předplatné bez podniku', sub.id); return; }
  const plan = planForSubscription(sub.status);
  const periodEnd = periodEndOf(sub);
  const customerId = idOf(sub.customer);
  if (plan === 'pro') {
    await sql`
      UPDATE teams SET
        plan = 'pro',
        trial_ends_at = NULL,
        stripe_customer_id = COALESCE(${customerId}, stripe_customer_id),
        stripe_subscription_id = ${sub.id},
        stripe_subscription_status = ${sub.status},
        stripe_current_period_end = ${periodEnd ? periodEnd.toISOString() : null}
      WHERE id = ${teamId}`;
  } else {
    await sql`
      UPDATE teams SET
        plan = 'free',
        stripe_subscription_status = ${sub.status},
        stripe_current_period_end = ${periodEnd ? periodEnd.toISOString() : null}
      WHERE id = ${teamId} AND (stripe_subscription_id IS NULL OR stripe_subscription_id = ${sub.id})`;
  }
}

/** Stáhne předplatné ze Stripe a promítne ho (po Checkoutu a po faktuře). */
export async function syncSubscriptionById(subscriptionId: string): Promise<void> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId);
  await applySubscription(sub);
}

// ---- Online platby hostů (Connect) ----------------------------------------

/** Uložený stav propojeného účtu podniku. */
export interface ConnectState { accountId: string | null; ready: boolean; due: number }

export async function connectStateOf(teamId: number): Promise<ConnectState> {
  try {
    const [t] = await sql`SELECT stripe_account_id, stripe_payments_ready FROM teams WHERE id = ${teamId}`;
    return { accountId: t?.stripe_account_id ?? null, ready: !!t?.stripe_payments_ready, due: 0 };
  } catch {
    return { accountId: null, ready: false, due: 0 };
  }
}

/** Zeptá se Stripe na stav účtu a uloží, jestli už může přijímat platby. */
export async function refreshConnectByAccount(accountId: string): Promise<ConnectState> {
  const acct = await getStripe().v2.core.accounts.retrieve(accountId, { include: ['configuration.merchant', 'requirements'] });
  const ready = merchantReady(acct);
  const due = requirementsDue(acct);
  await sql`UPDATE teams SET stripe_payments_ready = ${ready} WHERE stripe_account_id = ${accountId}`;
  return { accountId, ready, due };
}

export async function refreshConnect(teamId: number): Promise<ConnectState> {
  const cur = await connectStateOf(teamId);
  if (!cur.accountId) return cur;
  return refreshConnectByAccount(cur.accountId);
}

/**
 * Zaplacená Checkout Session z propojeného účtu → objednávka uhrazená.
 * Objednávka se hledá podle `client_reference_id` a hlídá se, že patří
 * podniku s tímhle účtem (cizí účet nemůže „zaplatit" cizí objednávku).
 */
export async function markOrderPaid(session: Stripe.Checkout.Session, accountId: string | null): Promise<number | null> {
  if (!sessionPaid(session)) return null;
  const orderId = intOf(session.client_reference_id) ?? intOf(session.metadata?.orderId);
  if (!orderId || !accountId) return null;
  const rows = await sql`
    UPDATE client_orders o SET
      payment_status = 'paid',
      paid_at = COALESCE(o.paid_at, NOW()),
      stripe_session_id = ${session.id},
      stripe_payment_intent = ${idOf(session.payment_intent)},
      updated_at = NOW()
    FROM teams t
    WHERE o.id = ${orderId} AND t.id = o.team_id AND t.stripe_account_id = ${accountId}
    RETURNING o.id, o.team_id, o.total, o.customer_id`;
  return rows.length ? Number(rows[0].id) : null;
}

export async function markOrderPaymentFailed(session: Stripe.Checkout.Session, accountId: string | null): Promise<void> {
  const orderId = intOf(session.client_reference_id) ?? intOf(session.metadata?.orderId);
  if (!orderId || !accountId) return;
  await sql`
    UPDATE client_orders o SET payment_status = 'failed', updated_at = NOW()
    FROM teams t
    WHERE o.id = ${orderId} AND t.id = o.team_id AND t.stripe_account_id = ${accountId} AND o.payment_status <> 'paid'`;
}
