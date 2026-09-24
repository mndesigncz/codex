import { NextResponse } from 'next/server';
import { ensureProductionTasks, openProduction } from '@/lib/production';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

// GET: co je právě k výrobě — srovná úkoly se skladem a vrátí je i s plánem.
// Dashboard směny, TO GO i kiosk čtou tohle jedno místo.
//
// Kolo 67: `vyroba.vyrabet` (mají ho všechny tři dnešní role). Dřív stačilo
// users.team_id, takže prošel i host s podnikem — pozaduj() chce členství.
export async function GET() {
  const c = await pozaduj('vyroba.vyrabet');
  if (jeOdpoved(c)) return c;
  const teamId = c.teamId;
  try { await ensureProductionTasks(teamId, null); } catch { /* před migrací */ }
  const toMake = await openProduction(teamId);
  return NextResponse.json({ toMake });
}
