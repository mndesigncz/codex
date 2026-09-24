// Tik: aplikace se sama postará o čerstvá data z pokladny.
//
// Hobby plán Vercelu pustí cron jen jednou denně, jenže tržby se mění po
// minutách. Tenhle endpoint volá každé otevřené okno aplikace (vedení,
// zaměstnanec i kiosk na baru) — a kiosk běží celý den, takže se pokladna
// synchronizuje průběžně bez toho, aby na to někdo myslel. Škrticí klapka
// je uvnitř syncBills: kdo přijde do pěti minut po posledním běhu, dostane
// „přeskočeno" a pokladnu neobtěžuje.
//
// Kolo 67: technický endpoint bez oprávnění — stačí být členem aktivního
// podniku. Dřív stačilo users.team_id, takže prošel i host se zrcadlem.

import { NextResponse } from 'next/server';
import { runFullSync } from '@/lib/posMirror';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  try {
    // Autorem synchronizace v auditu je jen účet vedení (typ účtu, ne
    // oprávnění) — tik z okna baristy nebo tabletu je „systém", ne jeho akce.
    const r = await runFullSync(c.teamId, c.role.typ === 'vedeni' ? c.meId : null, { force: false });
    return NextResponse.json({ connected: r.bills.skipped !== 'not-connected', sync: r.bills, writeOff: r.writeOff ?? null });
  } catch {
    return NextResponse.json({ connected: true, error: 'Synchronizace se nepodařila.' }, { status: 502 });
  }
}
