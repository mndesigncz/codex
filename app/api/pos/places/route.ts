// Provozovny (places) merchanta ve Storyous. Jeden podnik jich může mít víc —
// třeba stálou provozovnu a mobilní stánek. Výjezdová akce si pak přiřadí svoji
// kasu a tržby dvou provozoven se nemíchají.
//
// Kolo 67: seznam potřebuje i ten, kdo jen spravuje akce (přiřazuje jim
// kasu), ne jen ten, kdo vidí nastavení pokladny — proto stačí kterékoli.

import { NextResponse } from 'next/server';
import { getConnection, merchantInfo } from '@/lib/storyous';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  const c = await pozaduj(['pokladna.stav', 'akce.upravit']);
  if (jeOdpoved(c)) return c;
  const conn = await getConnection(c.teamId);
  if (!conn) return NextResponse.json({ places: [], current: null });
  try {
    const m = await merchantInfo(conn);
    return NextResponse.json({
      places: (m.places ?? []).map(p => ({ placeId: p.placeId, name: p.name })),
      current: conn.placeId,
    });
  } catch {
    return NextResponse.json({ places: [], current: conn.placeId });
  }
}
