import { NextResponse } from 'next/server';
import { checkCron } from '@/lib/cronAuth';
import { reconcile } from '@/lib/billing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Denně: dorovnat stav předplatných se Stripe, kdyby nějaký webhook nedošel.
export async function GET(request: Request) {
  const gate = checkCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  return NextResponse.json(await reconcile());
}
