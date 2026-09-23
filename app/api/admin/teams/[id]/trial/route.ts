import { requireSuperadmin } from '@/lib/superadminGate';
import { extendTrial } from '@/lib/admin';
import { odmitnuto, odpoved, idZ } from '../../../_odpoved';
export const dynamic = 'force-dynamic';

/** { days: number } */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  const b = await request.json().catch(() => ({}));
  return odpoved(() => extendTrial(idZ(params), Number(b?.days), g.actor));
}
