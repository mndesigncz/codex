import { NextResponse } from 'next/server';
import { employerCtx } from '../_auth';
import { upgradeToMax, NOT_CONFIGURED, stripe } from '@/lib/billing';

export const dynamic = 'force-dynamic';

// POST → přechod Pro → Max na stávajícím předplatném; s kuponem MAX30, dokud běží nabídka.
export async function POST() {
  const c = await employerCtx();
  if (!c?.teamId) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Předplatné spravuje vedení' }, { status: 403 });
  if (!stripe()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, ...(await upgradeToMax(c.teamId)) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? 'Přechod se nepodařil.') }, { status: 400 });
  }
}
