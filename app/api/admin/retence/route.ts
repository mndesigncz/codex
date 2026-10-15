// Retence osobních údajů ve správě platformy (spuštění, balík G): poslední běhy (náhled i ostré)
// a tlačítko „Spočítat náhled teď“. Odtud se NIKDY nemaže — i se zapnutou retencí je POST jen náhled;
// ostře běží jen denní cron (app/api/retence) s RETENCE_ZAPNUTA=1.
import { requireSuperadmin } from '@/lib/superadminGate';
import { logAdmin } from '@/lib/admin';
import { RETENCE, retenceZapnuta } from '@/lib/retence';
import { posledniBehy, spustRetenci } from '@/lib/retenceDb';
import { odmitnuto, odpoved } from '../_odpoved';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  return odpoved(async () => ({ zapnuta: retenceZapnuta(), lhuty: RETENCE, behy: await posledniBehy(10) }));
}

export async function POST(request: Request) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  return odpoved(async () => {
    const s = await spustRetenci({ ostry: false, rozpocetMs: 40_000 });
    await logAdmin(g.actor, 'retence.nahled', null, `hosté ${s.hoste.poLhute} po lhůtě · protokol ${s.auditLog.kSmazani} · oznámení ${s.oznameni.kSmazani} · podniky ${s.podniky.kSmazani}`);
    return { ok: true, souhrn: s };
  });
}
