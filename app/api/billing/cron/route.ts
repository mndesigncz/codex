import { NextResponse } from 'next/server';
import { checkCron } from '@/lib/cronAuth';
import { reconcile } from '@/lib/billing';
import { zapisBehCronu } from '@/lib/cronSouhrn';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Denně: dorovnat stav předplatných se Stripe, kdyby nějaký webhook nedošel.
export async function GET(request: Request) {
  const gate = checkCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const vysledek = await reconcile();
  zapisBehCronu('billing/cron', vysledek);
  return NextResponse.json(vysledek);
}
