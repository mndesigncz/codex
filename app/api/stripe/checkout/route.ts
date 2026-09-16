// Přechod na Pro: založí zákazníka ve Stripe (jednou na podnik) a otevře
// hostovaný Checkout s měsíčním předplatným. Plán se přepne až z webhooku
// (/api/stripe/webhook) — stránka „úspěch" nic nerozhoduje.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { getStripe, stripeConfigured, proPriceId, appUrl, taxEnabled } from '@/lib/stripe';
import { integrationId, subscriptionLive } from '@/lib/stripeBilling';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const me = { id: parseInt((session.user as any).id), role: (session.user as any).role as string };
  if (me.role !== 'employer') return NextResponse.json({ error: 'Předplatné spravuje vedení.' }, { status: 403 });
  if (!stripeConfigured() || !proPriceId()) {
    return NextResponse.json({ configured: false, error: 'Online platba za Pro zatím není zapnutá.' }, { status: 503 });
  }

  const [u] = await sql`SELECT team_id, email, name FROM users WHERE id = ${me.id}`;
  if (!u?.team_id) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });
  const teamId = Number(u.team_id);
  const [team] = await sql`SELECT id, name, stripe_customer_id, stripe_subscription_status FROM teams WHERE id = ${teamId}`;
  if (!team) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  if (subscriptionLive(team.stripe_subscription_status)) {
    return NextResponse.json({ error: 'Pro už máte. Předplatné spravujete přes „Spravovat předplatné".', portal: true }, { status: 409 });
  }

  const stripe = getStripe();
  try {
    let customerId: string | null = team.stripe_customer_id ?? null;
    if (!customerId) {
      const c = await stripe.customers.create({
        email: u.email,
        name: team.name,
        preferred_locales: ['cs'],
        metadata: { teamId: String(teamId), app: 'managero' },
      }, { idempotencyKey: `managero-customer-${teamId}` });
      customerId = c.id;
      await sql`UPDATE teams SET stripe_customer_id = ${customerId} WHERE id = ${teamId}`;
    }

    const back = `${appUrl()}/employer/overview?view=settings`;
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      // Bez payment_method_types: způsoby platby řídí Dashboard (karta, Link, …).
      line_items: [{ price: proPriceId()!, quantity: 1 }],
      client_reference_id: String(teamId),
      metadata: { teamId: String(teamId) },
      subscription_data: { metadata: { teamId: String(teamId) } },
      locale: 'cs',
      allow_promotion_codes: true,
      // Faktura pro podnik potřebuje název firmy, adresu a DIČ.
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      customer_update: { name: 'auto', address: 'auto' },
      // Daň počítá Stripe Tax až po registraci k DPH v Dashboardu; do té doby
      // je cena 249 Kč konečná (viz docs/stripe.md).
      ...(taxEnabled() ? { automatic_tax: { enabled: true } } : {}),
      success_url: `${back}&billing=success`,
      cancel_url: `${back}&billing=cancel`,
      integration_identifier: integrationId('managero_pro'),
    });
    await audit(teamId, me.id, 'billing.checkout_started', 'team', teamId, checkout.id);
    return NextResponse.json({ url: checkout.url });
  } catch (e: any) {
    console.error('stripe checkout', e?.message ?? e);
    return NextResponse.json({ error: 'Platbu se nepodařilo připravit. Zkuste to za chvíli.' }, { status: 502 });
  }
}
