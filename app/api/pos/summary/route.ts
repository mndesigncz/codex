// Čísla pokladny za jeden den — čte je formulář uzávěrky a přehledy.
//
// Kolo 67: dřív stačilo být přihlášený s users.team_id, takže denní tržbu
// za libovolné datum viděl každý zaměstnanec (i host se zrcadlem podniku).
// Teď: s `finance.trzby` libovolný den. Kdo má jen `uzaverky.vytvorit`
// (Barista, tablet), potřebuje čísla kasy k vyplnění uzávěrky — dostane je
// pro stejné okno, ve kterém uzávěrky reálně odesílá: dnešek a posledních
// 14 dní. Bez podmínky vlastní směny (oponentura kola 67): podnik bez
// rozvrhu, s closing_requires_shift=false nebo uzávěrka akce mimo provozovnu
// se zavírá i bez směny a barista by jinak tiše přišel o porovnání s kasou.
// Starší den a budoucnost jen s `finance.trzby`.

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/storyous';
import { daySummaryFor } from '@/lib/posMirror';
import { pragueToday } from '@/lib/pragueTime';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

/** Smí člověk bez `finance.trzby` vidět kasu za tenhle den? */
function denProUzaverku(date: string): boolean {
  return date <= pragueToday() && date >= pragueToday(-14);
}

export async function GET(req: NextRequest) {
  const c = await pozaduj(['finance.trzby', 'uzaverky.vytvorit']);
  if (jeOdpoved(c)) return c;

  const date = String(new URL(req.url).searchParams.get('date') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Neplatné datum' }, { status: 400 });

  const conn = await getConnection(c.teamId);
  if (!conn) return NextResponse.json({ connected: false });

  if (!c.role.opravneni.has('finance.trzby') && !denProUzaverku(date)) {
    return NextResponse.json({ error: 'Čísla kasy mimo posledních 14 dní vidí jen ten, kdo smí vidět tržby.' }, { status: 403 });
  }
  try {
    // Ze zrcadla, když ho máme (rychlé, bez volání pokladny); jinak živě.
    const s = await daySummaryFor(c.teamId, date);
    return NextResponse.json({ connected: true, placeName: conn.placeName, ...s });
  } catch {
    return NextResponse.json({ connected: true, error: 'Pokladna teď neodpovídá — zkus to za chvíli.' }, { status: 502 });
  }
}
