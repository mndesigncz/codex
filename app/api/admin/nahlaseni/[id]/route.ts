// Správce platformy vyřídí nahlášení za podnik, který to nestihl (odstranit obsah, vyřízeno, zamítnout).
// Zásah jde do historie zásahů (admin_audit, s aktérem) i do historie změn podniku.
import { requireSuperadmin } from '@/lib/superadminGate';
import { AdminError, logAdmin } from '@/lib/admin';
import { audit } from '@/lib/audit';
import { stavPoAkci } from '@/lib/moderace';
import { vyridNahlaseni } from '@/lib/moderaceDb';
import { odmitnuto, odpoved } from '../../_odpoved';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  const b = await request.json().catch(() => ({}));
  return odpoved(async () => {
    const reportId = parseInt(id, 10);
    if (!Number.isInteger(reportId) || reportId <= 0) throw new AdminError(400, 'Neplatné nahlášení.');
    const stav = stavPoAkci(b?.akce);
    if (!stav) throw new AdminError(400, 'Neznámá akce.');
    const r = await vyridNahlaseni(reportId, stav, g.actor.userId, null);
    if (!r) throw new AdminError(404, 'Nahlášení nenalezeno.');
    await logAdmin(g.actor, `report.${stav}`, r.teamId, `#${reportId} · ${r.kind}`);
    if (r.teamId != null) await audit(r.teamId, g.actor.userId, 'nahlaseni.vyreseno', 'content_report', reportId, `${stav} · správce platformy`);
    return { ok: true, status: stav };
  });
}
