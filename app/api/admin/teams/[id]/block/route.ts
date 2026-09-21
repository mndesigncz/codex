import { requireSuperadmin } from '@/lib/superadminGate';
import { blockTeam, unblockTeam } from '@/lib/admin';
import { odmitnuto, odpoved, idZ } from '../../../_odpoved';
export const dynamic = 'force-dynamic';

/** { blocked: true, reason } pozastaví, { blocked: false } obnoví. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  const b = await request.json().catch(() => ({}));
  return odpoved(() => (b?.blocked === false ? unblockTeam(idZ(params), g.actor) : blockTeam(idZ(params), String(b?.reason ?? ''), g.actor)));
}
