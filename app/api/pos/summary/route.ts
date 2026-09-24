// Čísla pokladny za jeden den — čte je formulář uzávěrky a přehledy.
//
// Kolo 67: dřív stačilo být přihlášený s users.team_id, takže denní tržbu
// za libovolné datum viděl každý zaměstnanec (i host se zrcadlem podniku).
// Teď: s `finance.trzby` libovolný den. Kdo má jen `uzaverky.vytvorit`
// (Barista, tablet), potřebuje čísla kasy jen k vyplnění uzávěrky — dostane
// je tedy jen pro dny, které se dají zavírat: dnešek a včerejšek (směna přes
// půlnoc patří k včerejšku) a dny posledních dvou týdnů, kdy měl směnu.
// Tablet zavírá za kohokoli (`uzaverky.za_jineho`), takže mu stačí směna
// kohokoli z podniku.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getConnection } from '@/lib/storyous';
import { daySummaryFor } from '@/lib/posMirror';
import { pragueToday } from '@/lib/pragueTime';
import { pozaduj, jeOdpoved, type Kontext } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/** Smí člověk bez `finance.trzby` vidět kasu za tenhle den? */
async function denProUzaverku(c: Kontext, date: string): Promise<boolean> {
  const dnes = pragueToday();
  if (date > dnes) return false;
  if (date >= pragueToday(-1)) return true;
  // Stejné okno jako „směny, které ještě můžeš zavřít" v /api/closings.
  if (date < pragueToday(-14)) return false;
  try {
    const [s] = c.role.opravneni.has('uzaverky.za_jineho')
      ? await sql`SELECT 1 FROM shifts WHERE team_id = ${c.teamId} AND date = ${date} LIMIT 1`
      : await sql`SELECT 1 FROM shifts WHERE team_id = ${c.teamId} AND employee_id = ${c.meId} AND date = ${date} LIMIT 1`;
    return !!s;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const c = await pozaduj(['finance.trzby', 'uzaverky.vytvorit']);
  if (jeOdpoved(c)) return c;

  const date = String(new URL(req.url).searchParams.get('date') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Neplatné datum' }, { status: 400 });

  const conn = await getConnection(c.teamId);
  if (!conn) return NextResponse.json({ connected: false });

  if (!c.role.opravneni.has('finance.trzby') && !(await denProUzaverku(c, date))) {
    return NextResponse.json({ error: 'Tržby za tenhle den vidí jen ten, kdo smí vidět tržby.' }, { status: 403 });
  }
  try {
    // Ze zrcadla, když ho máme (rychlé, bez volání pokladny); jinak živě.
    const s = await daySummaryFor(c.teamId, date);
    return NextResponse.json({ connected: true, placeName: conn.placeName, ...s });
  } catch {
    return NextResponse.json({ connected: true, error: 'Pokladna teď neodpovídá — zkus to za chvíli.' }, { status: 502 });
  }
}
