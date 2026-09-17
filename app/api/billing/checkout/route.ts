import { NextResponse } from 'next/server';
import { employerCtx } from '../_auth';
import { createCheckout, NOT_CONFIGURED, stripe } from '@/lib/billing';

export const dynamic = 'force-dynamic';

// POST { plan: 'pro'|'max', interval: 'month'|'year' } → adresa pokladny Stripe.
export async function POST(req: Request) {
  const c = await employerCtx();
  if (!c?.teamId) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Předplatné spravuje vedení' }, { status: 403 });
  if (!stripe()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const plan = b.plan === 'max' ? 'max' : 'pro';
  const interval = b.interval === 'year' ? 'year' : 'month';
  try {
    const url = await createCheckout(c.teamId, plan, interval);
    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? 'Pokladnu se nepodařilo otevřít.') }, { status: 400 });
  }
}
