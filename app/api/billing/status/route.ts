import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { billingStatus } from '@/lib/billing';
import { obalZHlavicek } from '@/lib/obal';

export const dynamic = 'force-dynamic';

// GET → plán, předplatné, ceny a affiliate odkaz pro Nastavení → Předplatné.
export async function GET(request: Request) {
  // Dřív stačilo být přihlášen s podnikem (i host nebo tablet viděl ceny
  // a stav předplatného). UI ho ukazuje jen v Nastavení vedení, takže
  // zavření úniku nikomu nic nebere (katalog.pravidla).
  const c = await pozaduj('predplatne.zobrazit');
  if (jeOdpoved(c)) return c;
  try {
    const st = await billingStatus(c.teamId);
    // Obal (Apple 3.1.1): jen stav tarifu, bez ceníku a bez odkazu, který vede k platbě
    // nebo k odměně za nákup. Serverová pojistka vedle skrytého UI.
    if (obalZHlavicek(request.headers) !== null) return NextResponse.json({ configured: false, plan: st.plan });
    return NextResponse.json(st);
  } catch {
    return NextResponse.json({ error: 'Stav předplatného se nepodařilo načíst.' }, { status: 500 });
  }
}
