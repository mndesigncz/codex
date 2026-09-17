import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { handleEvent, stripe } from '@/lib/billing';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Webhook ze Stripe — jediný zdroj pravdy o stavu předplatného. Ověřuje
// podpis, každou událost zpracuje nejvýš jednou (billing_events).
export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return NextResponse.json({ error: 'Webhook není nastavený.' }, { status: 503 });
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Chybí podpis.' }, { status: 400 });
  const raw = await req.text();
  let event;
  try {
    event = s.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: 'Neplatný podpis.' }, { status: 400 });
  }
  try {
    const rows = await sql`
      INSERT INTO billing_events (id, type) VALUES (${event.id}, ${event.type})
      ON CONFLICT (id) DO NOTHING RETURNING id`;
    if (rows.length === 0) return NextResponse.json({ ok: true, duplicate: true });
  } catch { /* před migrací: zpracuj i tak */ }
  try {
    await handleEvent(event);
  } catch (e) {
    // 500 → Stripe událost pošle znovu; záznam smažeme, aby se nepřeskočila.
    try { await sql`DELETE FROM billing_events WHERE id = ${event.id}`; } catch { /* ignore */ }
    return NextResponse.json({ error: 'Zpracování selhalo.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
