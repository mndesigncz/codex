// Webhook platformy (účet Managero): předplatné Pro a jeho faktury.
//
// Stripe je zdroj pravdy o tom, kdo zaplatil. Tady se z jeho událostí
// odvozuje plán podniku; stránka po Checkoutu nic nepřepíná. Každá událost
// se ověří podpisem a zpracuje nejvýš jednou (tabulka stripe_events).
//
// V Dashboardu (Developers → Webhooks) míří na /api/stripe/webhook a
// odebírá: checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted,
// invoice.paid, invoice.payment_failed.
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { firstTime, linkCustomer, applySubscription, syncSubscriptionById, teamByCustomer } from '@/lib/stripeSync';
import { idOf, intOf, subscriptionIdOfInvoice } from '@/lib/stripeBilling';
import { notifyTeamEmployers } from '@/lib/client';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeConfigured() || !secret) {
    return NextResponse.json({ error: 'Webhook není nakonfigurovaný (chybí STRIPE_WEBHOOK_SECRET).' }, { status: 503 });
  }
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Chybí podpis' }, { status: 400 });

  // Surové tělo — podpis se počítá z bajtů, ne z rozparsovaného JSONu.
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (e: any) {
    console.warn('stripe webhook: špatný podpis', e?.message);
    return NextResponse.json({ error: 'Neplatný podpis' }, { status: 400 });
  }

  try {
    if (!(await firstTime(event.id, event.type))) return NextResponse.json({ ok: true, duplicate: true });

    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode !== 'subscription') break;
        const teamId = intOf(s.client_reference_id) ?? intOf(s.metadata?.teamId);
        const customerId = idOf(s.customer);
        if (teamId && customerId) await linkCustomer(teamId, customerId);
        const subId = idOf(s.subscription);
        if (subId) await syncSubscriptionById(subId);
        if (teamId) await audit(teamId, null, 'billing.subscribed', 'team', teamId, s.id);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case 'invoice.paid': {
        const subId = subscriptionIdOfInvoice(event.data.object);
        if (subId) await syncSubscriptionById(subId);
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const subId = subscriptionIdOfInvoice(inv);
        if (subId) await syncSubscriptionById(subId);
        const teamId = await teamByCustomer(idOf(inv.customer));
        if (teamId) {
          await audit(teamId, null, 'billing.payment_failed', 'team', teamId, inv.id ?? undefined);
          // Stripe platbu zkusí znovu sám; vedení má vědět, že má zkontrolovat kartu.
          await notifyTeamEmployers(teamId, {
            title: 'Platba za Pro se nepovedla',
            body: 'Stripe ji zkusí znovu. Zkontrolujte kartu v Nastavení → Předplatné → Spravovat předplatné.',
            link: '/employer/overview?view=settings',
            type: 'billing',
          }).catch(() => {});
        }
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // 500 ⇒ Stripe událost pošle znovu; idempotence ji pak nezahodí jen
    // proto, že první pokus spadl — proto se záznam maže.
    console.error('stripe webhook', event.type, e?.message ?? e);
    try { await neon(process.env.DATABASE_URL!)`DELETE FROM stripe_events WHERE id = ${event.id}`; } catch {}
    return NextResponse.json({ error: 'Zpracování selhalo' }, { status: 500 });
  }
}
