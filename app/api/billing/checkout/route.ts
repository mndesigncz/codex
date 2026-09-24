import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { createCheckout, NOT_CONFIGURED, stripe } from '@/lib/billing';
import { verejnaHlaska } from '@/lib/verejnaChyba';

export const dynamic = 'force-dynamic';

// POST { plan: 'pro'|'max', interval: 'month'|'year', embedded?: true }
// → { url } pro přesměrování na Stripe, nebo { clientSecret } pro pokladnu
// vloženou do našeho okna.
export async function POST(req: Request) {
  // Placení a změna tarifu hýbou penězi podniku — jen s oprávněním, ne podle typu účtu.
  const c = await pozaduj('predplatne.spravovat');
  if (jeOdpoved(c)) return c;
  if (!stripe()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const plan = b.plan === 'max' ? 'max' : 'pro';
  const interval = b.interval === 'year' ? 'year' : 'month';
  try {
    const out = await createCheckout(c.teamId, plan, interval, b.embedded ? 'embedded' : 'hosted');
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: verejnaHlaska(e, 'Pokladnu se nepodařilo otevřít.', '[billing] checkout') }, { status: 400 });
  }
}
