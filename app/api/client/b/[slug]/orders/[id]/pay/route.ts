// Host platí objednávku od stolu online: Checkout Session přímo na účtu
// podniku (direct charge). Částka i položky se berou z uložené objednávky,
// nikdy z prohlížeče. Zaplaceno je až po webhooku /api/stripe/connect/webhook.
import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug } from '@/lib/client';
import { getStripe, stripeConfigured, appUrl, platformFeePercent } from '@/lib/stripe';
import { checkoutLines, linesTotalMinor, platformFeeMinor, integrationId, MIN_CHARGE_MINOR } from '@/lib/stripeBilling';
import { connectStateOf, refreshConnect } from '@/lib/stripeSync';
import { hit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(_req: Request, { params }: { params: { slug: string; id: string } }) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  if (!stripeConfigured() || !p.online_payments_on) {
    return NextResponse.json({ error: 'Podnik online platby nepřijímá. Zaplať u obsluhy.' }, { status: 400 });
  }
  const gate = await hit(`client-pay:${me.id}`, 10, 10 * 60);
  if (!gate.ok) return NextResponse.json({ error: 'Moc pokusů za sebou. Chvilku počkej.' }, { status: 429 });

  const teamId = Number(p.team_id);
  const orderId = parseInt(params.id, 10);
  const [o] = await sql`SELECT id, items, total, status, payment_status, stripe_session_id FROM client_orders WHERE id = ${orderId} AND team_id = ${teamId} AND customer_id = ${me.id}`;
  if (!o) return NextResponse.json({ error: 'Objednávka nenalezena' }, { status: 404 });
  if (o.payment_status === 'paid') return NextResponse.json({ error: 'Objednávka už je zaplacená.' }, { status: 409 });
  if (o.status !== 'new' && o.status !== 'confirmed') return NextResponse.json({ error: 'Tahle objednávka už se zaplatit nedá.' }, { status: 409 });

  let acct = await connectStateOf(teamId);
  if (acct.accountId && !acct.ready) {
    // Stav se mohl změnit od poslední návštěvy nastavení — jeden dotaz navíc.
    try { acct = await refreshConnect(teamId); } catch {}
  }
  if (!acct.accountId || !acct.ready) {
    return NextResponse.json({ error: 'Podnik ještě nemá online platby aktivní. Zaplať u obsluhy.' }, { status: 400 });
  }

  const lines = checkoutLines(o.items);
  const amount = linesTotalMinor(lines);
  if (!lines.length || amount <= 0) return NextResponse.json({ error: 'Objednávka nemá co zaplatit.' }, { status: 400 });
  if (amount < MIN_CHARGE_MINOR) return NextResponse.json({ error: `Online jde zaplatit od ${MIN_CHARGE_MINOR / 100} Kč. Zaplať u obsluhy.` }, { status: 400 });

  const stripe = getStripe();
  const opts = { stripeAccount: acct.accountId };
  try {
    // Rozdělaná session z minulého kliknutí se použije znovu (ať host neplatí dvakrát).
    if (o.stripe_session_id) {
      try {
        const prev = await stripe.checkout.sessions.retrieve(o.stripe_session_id, undefined, opts);
        if (prev.status === 'open' && prev.url) return NextResponse.json({ url: prev.url });
        if (prev.status === 'complete' && prev.payment_status === 'paid') {
          return NextResponse.json({ error: 'Platba už proběhla, potvrzení dorazí za chvíli.' }, { status: 409 });
        }
      } catch { /* stará session nedohledatelná — založí se nová */ }
    }
    const fee = platformFeeMinor(amount, platformFeePercent());
    const back = `${appUrl()}/client/${encodeURIComponent(p.slug)}`;
    const s = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Bez payment_method_types: způsoby platby řídí Dashboard podniku.
      line_items: lines.map(l => ({
        quantity: l.quantity,
        price_data: { currency: 'czk', unit_amount: l.unitAmount, product_data: { name: l.name } },
      })),
      client_reference_id: String(o.id),
      customer_email: me.email,
      metadata: { orderId: String(o.id), teamId: String(teamId), customerId: String(me.id) },
      payment_intent_data: {
        metadata: { orderId: String(o.id), teamId: String(teamId) },
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
      },
      locale: 'cs',
      // Stripe chce aspoň 30 minut od přijetí požadavku; 35 dává rezervu na síť.
      expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
      success_url: `${back}?tab=order&paid=${o.id}`,
      cancel_url: `${back}?tab=order`,
      integration_identifier: integrationId('managero_order'),
    }, { ...opts, idempotencyKey: `managero-order-${o.id}-${Date.now()}` });
    await sql`UPDATE client_orders SET stripe_session_id = ${s.id}, payment_status = 'pending', updated_at = NOW() WHERE id = ${o.id} AND payment_status <> 'paid'`;
    return NextResponse.json({ url: s.url });
  } catch (e: any) {
    console.error('stripe order pay', e?.message ?? e);
    return NextResponse.json({ error: 'Platbu se nepodařilo připravit. Zaplať u obsluhy nebo to zkus za chvíli.' }, { status: 502 });
  }
}
