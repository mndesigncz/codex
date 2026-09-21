import { requireSuperadmin } from '@/lib/superadminGate';
import { setPlanOverride } from '@/lib/admin';
import { odmitnuto, odpoved, idZ } from '../../../_odpoved';
export const dynamic = 'force-dynamic';

/** { plan: 'free' | 'pro' | 'max' | null } — null vrátí tarif podle Stripe. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  const b = await request.json().catch(() => ({}));
  return odpoved(() => setPlanOverride(idZ(params), b?.plan ?? null, g.actor));
}
