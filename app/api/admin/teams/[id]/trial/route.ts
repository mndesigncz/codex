import { requireSuperadmin } from '@/lib/superadminGate';
import { extendTrial } from '@/lib/admin';
import { odmitnuto, odpoved, idZ } from '../../../_odpoved';
export const dynamic = 'force-dynamic';

/** { days: number } */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  const b = await request.json().catch(() => ({}));
  return odpoved(() => extendTrial(idZ(params), Number(b?.days), g.actor));
}
