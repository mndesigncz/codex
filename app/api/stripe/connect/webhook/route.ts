// Webhook pro události z PROPOJENÝCH účtů (Dashboard → Webhooks →
// „Listen to events on Connected accounts"), vlastní podpisový klíč.
// Míří na /api/stripe/connect/webhook a odebírá checkout.session.completed,
// checkout.session.async_payment_succeeded, checkout.session.async_payment_failed.
//
// Objednávka je zaplacená, až když to řekne tenhle webhook — stránka
// hosta po návratu z Checkoutu jen čeká.
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { firstTime, markOrderPaid, markOrderPaymentFailed } from '@/lib/stripeSync';
import { notifyTeamEmployers } from '@/lib/client';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!stripeConfigured() || !secret) {
    return NextResponse.json({ error: 'Webhook není nakonfigurovaný (chybí STRIPE_CONNECT_WEBHOOK_SECRET).' }, { status: 503 });
  }
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Chybí podpis' }, { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (e: any) {
    console.warn('stripe connect webhook: špatný podpis', e?.message);
    return NextResponse.json({ error: 'Neplatný podpis' }, { status: 400 });
  }
  const account = event.account ?? null;

  try {
    if (!(await firstTime(event.id, event.type))) return NextResponse.json({ ok: true, duplicate: true });
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s = event.data.object as Stripe.Checkout.Session;
        // U odložených metod přijde „completed" ještě nezaplacené; markOrderPaid
        // si payment_status hlídá a nezaplacené přeskočí.
        const orderId = await markOrderPaid(s, account);
        if (orderId) {
          const sql = neon(process.env.DATABASE_URL!);
          const [o] = await sql`SELECT team_id, total FROM client_orders WHERE id = ${orderId}`;
          if (o) {
            await notifyTeamEmployers(Number(o.team_id), {
              title: `Objednávka #${orderId} zaplacena online`,
              body: `${Number(o.total)} Kč přišlo kartou přes Stripe.`,
              link: '/employer/overview?mode=client&tab=orders',
              type: 'order',
            }).catch(() => {});
          }
        }
        break;
      }
      case 'checkout.session.async_payment_failed': {
        await markOrderPaymentFailed(event.data.object as Stripe.Checkout.Session, account);
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('stripe connect webhook', event.type, e?.message ?? e);
    try { await neon(process.env.DATABASE_URL!)`DELETE FROM stripe_events WHERE id = ${event.id}`; } catch {}
    return NextResponse.json({ error: 'Zpracování selhalo' }, { status: 500 });
  }
}
