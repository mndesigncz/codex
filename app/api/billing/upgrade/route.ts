import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { upgradeToMax, NOT_CONFIGURED, stripe } from '@/lib/billing';
import { verejnaHlaska } from '@/lib/verejnaChyba';

export const dynamic = 'force-dynamic';

// POST → přechod Pro → Max na stávajícím předplatném; s kuponem MAX30, dokud běží nabídka.
export async function POST() {
  // Placení a změna tarifu hýbou penězi podniku — jen s oprávněním, ne podle typu účtu.
  const c = await pozaduj('predplatne.spravovat');
  if (jeOdpoved(c)) return c;
  if (!stripe()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, ...(await upgradeToMax(c.teamId)) });
  } catch (e: any) {
    return NextResponse.json({ error: verejnaHlaska(e, 'Přechod se nepodařil.', '[billing] upgrade') }, { status: 400 });
  }
}
