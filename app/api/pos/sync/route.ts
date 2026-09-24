// Odpis skladu podle prodejů na požádání. Motor je v lib/posSync, aby ho
// mohl použít i cron souhrnu. Kolo 67: stejné oprávnění jako ruční
// synchronizace v Nastavení → Pokladna — obojí jen dožene to, co by tik
// udělal sám, nic nenastavuje.

import { NextRequest, NextResponse } from 'next/server';
import { runPosSync } from '@/lib/posSync';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const c = await pozaduj('pokladna.synchronizovat');
  if (jeOdpoved(c)) return c;
  const force = (await req.json().catch(() => ({})))?.force === true;
  try {
    const r = await runPosSync(c.teamId, c.meId, force);
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: 'Synchronizace selhala — zkus to za chvíli.' }, { status: 502 });
  }
}
