// Tenké události v2 (Event Destination) o propojených účtech: když Stripe
// změní stav capability card_payments, přepočítáme „připraveno přijímat
// platby" bez čekání na to, až se podnik podívá do nastavení.
//
// Dashboard → Webhooks → Event destination s typy
// v2.core.account[configuration.merchant].capability_status_updated a
// v2.core.account[requirements].updated, URL /api/stripe/connect/events.
import { NextResponse } from 'next/server';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { firstTime, refreshConnectByAccount } from '@/lib/stripeSync';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.STRIPE_V2_WEBHOOK_SECRET;
  if (!stripeConfigured() || !secret) {
    return NextResponse.json({ error: 'Webhook není nakonfigurovaný (chybí STRIPE_V2_WEBHOOK_SECRET).' }, { status: 503 });
  }
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Chybí podpis' }, { status: 400 });
  const body = await req.text();
  let note;
  try {
    note = getStripe().parseEventNotification(body, sig, secret);
  } catch (e: any) {
    console.warn('stripe v2 events: špatný podpis', e?.message);
    return NextResponse.json({ error: 'Neplatný podpis' }, { status: 400 });
  }
  try {
    if (!(await firstTime(note.id, note.type))) return NextResponse.json({ ok: true, duplicate: true });
    // Účet, kterého se událost týká: u account událostí je to related_object.
    const related = (note as any).related_object as { id?: string; type?: string } | null;
    const accountId = related?.type === 'v2.core.account' ? related.id : (note as any).context ?? null;
    if (accountId && String(note.type).startsWith('v2.core.account')) {
      await refreshConnectByAccount(String(accountId));
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('stripe v2 events', note.type, e?.message ?? e);
    return NextResponse.json({ error: 'Zpracování selhalo' }, { status: 500 });
  }
}
