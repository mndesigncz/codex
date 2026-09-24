import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { createPortal, NOT_CONFIGURED, stripe } from '@/lib/billing';
import { verejnaHlaska } from '@/lib/verejnaChyba';

export const dynamic = 'force-dynamic';

// POST → adresa zákaznického portálu Stripe (karta, faktury, změna tarifu, zrušení).
export async function POST() {
  // Placení a změna tarifu hýbou penězi podniku — jen s oprávněním, ne podle typu účtu.
  const c = await pozaduj('predplatne.spravovat');
  if (jeOdpoved(c)) return c;
  if (!stripe()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  try {
    return NextResponse.json({ url: await createPortal(c.teamId) });
  } catch (e: any) {
    return NextResponse.json({ error: verejnaHlaska(e, 'Portál se nepodařilo otevřít.', '[billing] portal') }, { status: 400 });
  }
}
