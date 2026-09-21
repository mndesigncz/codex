import { requireSuperadmin } from '@/lib/superadminGate';
import { overview } from '@/lib/admin';
import { odmitnuto, odpoved } from '../_odpoved';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  return odpoved(() => overview());
}
