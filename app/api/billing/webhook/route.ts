import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import type Stripe from 'stripe';
import { handleEvent, stripe } from '@/lib/billing';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Podpis se ověřuje proti každému secretu ze STRIPE_WEBHOOK_SECRET (oddělené
 * čárkou nebo mezerou). Hodí se při přechodu na živý účet: sandbox i živý
 * endpoint míří na stejnou adresu a každý má svůj secret. Událost z
 * druhého režimu pak projde podpisem a handleEvent ji podle `livemode`
 * potichu přeskočí — místo aby Stripe týden opakoval „neplatný podpis".
 */
function overUdalost(s: Stripe, raw: string, sig: string, secret: string): Stripe.Event | null {
  for (const kandidat of secret.split(/[\s,]+/).filter(Boolean)) {
    try { return s.webhooks.constructEvent(raw, sig, kandidat); } catch { /* zkusí další */ }
  }
  return null;
}

/**
 * Zabere událost pro zpracování. Odpověď:
 *  - `zpracovat` — je naše (nová, nebo zabraná a pět minut opuštěná — funkci zabil timeout),
 *  - `hotovo`    — už byla zpracována, nic se nedělá,
 *  - `probiha`   — jiné doručení ji právě zpracovává; Stripe zkusí později.
 * Před migrací (tabulka nebo sloupec chybí) se zpracuje vždy — obslužné
 * funkce jsou idempotentní, takže dvojí zpracování nevadí.
 */
async function zabratUdalost(id: string, typ: string): Promise<'zpracovat' | 'hotovo' | 'probiha'> {
  try {
    const nova = await sql`
      INSERT INTO billing_events (id, type) VALUES (${id}, ${typ})
      ON CONFLICT (id) DO NOTHING RETURNING id`;
    if (nova.length > 0) return 'zpracovat';
    const [e] = await sql`SELECT done_at FROM billing_events WHERE id = ${id}`;
    if (e?.done_at) return 'hotovo';
    const opustena = await sql`
      UPDATE billing_events SET created_at = NOW()
      WHERE id = ${id} AND done_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes'
      RETURNING id`;
    return opustena.length > 0 ? 'zpracovat' : 'probiha';
  } catch {
    return 'zpracovat';
  }
}

// Webhook ze Stripe — jediný zdroj pravdy o stavu předplatného. Ověřuje
// podpis, každou událost zpracuje nejvýš jednou (billing_events) a označí
// ji jako hotovou až po zpracování: kdyby funkce padla uprostřed, událost se
// po pár minutách zpracuje znovu, ne navždy přeskočí.
export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return NextResponse.json({ error: 'Webhook není nastavený.' }, { status: 503 });
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Chybí podpis.' }, { status: 400 });
  const raw = await req.text();
  const event = overUdalost(s, raw, sig, secret);
  if (!event) return NextResponse.json({ error: 'Neplatný podpis.' }, { status: 400 });

  const stav = await zabratUdalost(event.id, event.type);
  if (stav === 'hotovo') return NextResponse.json({ ok: true, duplicate: true });
  if (stav === 'probiha') return NextResponse.json({ error: 'Událost se právě zpracovává.' }, { status: 409 });

  try {
    await handleEvent(event);
  } catch (e) {
    console.error('[billing] webhook selhal', event.id, event.type, e);
    // 500 → Stripe událost pošle znovu; záznam smažeme, aby se nepřeskočila.
    try { await sql`DELETE FROM billing_events WHERE id = ${event.id}`; } catch { /* ignore */ }
    return NextResponse.json({ error: 'Zpracování selhalo.' }, { status: 500 });
  }
  try { await sql`UPDATE billing_events SET done_at = NOW() WHERE id = ${event.id}`; } catch { /* před migrací */ }
  return NextResponse.json({ ok: true });
}
