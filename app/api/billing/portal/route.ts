import { NextResponse } from 'next/server';
import { employerCtx } from '../_auth';
import { createPortal, NOT_CONFIGURED, stripe } from '@/lib/billing';

export const dynamic = 'force-dynamic';

// POST → adresa zákaznického portálu Stripe (karta, faktury, změna tarifu, zrušení).
export async function POST() {
  const c = await employerCtx();
  if (!c?.teamId) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Předplatné spravuje vedení' }, { status: 403 });
  if (!stripe()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  try {
    return NextResponse.json({ url: await createPortal(c.teamId) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? 'Portál se nepodařilo otevřít.') }, { status: 400 });
  }
}
