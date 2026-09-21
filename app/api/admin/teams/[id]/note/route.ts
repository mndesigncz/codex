import { requireSuperadmin } from '@/lib/superadminGate';
import { setNote } from '@/lib/admin';
import { odmitnuto, odpoved, idZ } from '../../../_odpoved';
export const dynamic = 'force-dynamic';

/** { note: string } — prázdná poznámku smaže. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  const b = await request.json().catch(() => ({}));
  return odpoved(() => setNote(idZ(params), String(b?.note ?? ''), g.actor));
}
