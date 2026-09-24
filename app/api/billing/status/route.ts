import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { billingStatus } from '@/lib/billing';

export const dynamic = 'force-dynamic';

// GET → plán, předplatné, ceny a affiliate odkaz pro Nastavení → Předplatné.
export async function GET() {
  // Dřív stačilo být přihlášen s podnikem (i host nebo tablet viděl ceny
  // a stav předplatného). UI ho ukazuje jen v Nastavení vedení, takže
  // zavření úniku nikomu nic nebere (katalog.pravidla).
  const c = await pozaduj('predplatne.zobrazit');
  if (jeOdpoved(c)) return c;
  try {
    return NextResponse.json(await billingStatus(c.teamId));
  } catch {
    return NextResponse.json({ error: 'Stav předplatného se nepodařilo načíst.' }, { status: 500 });
  }
}
