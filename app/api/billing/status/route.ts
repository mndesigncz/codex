import { NextResponse } from 'next/server';
import { employerCtx } from '../_auth';
import { billingStatus } from '@/lib/billing';

export const dynamic = 'force-dynamic';

// GET → plán, předplatné, ceny a affiliate odkaz pro Nastavení → Předplatné.
export async function GET() {
  const c = await employerCtx();
  if (!c?.teamId) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  try {
    return NextResponse.json(await billingStatus(c.teamId));
  } catch {
    return NextResponse.json({ error: 'Stav předplatného se nepodařilo načíst.' }, { status: 500 });
  }
}
