import { requireSuperadmin } from '@/lib/superadminGate';
import { getTeam } from '@/lib/admin';
import { odmitnuto, odpoved, idZ } from '../../_odpoved';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  return odpoved(() => getTeam(idZ(params)));
}
