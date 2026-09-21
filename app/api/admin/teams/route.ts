import { requireSuperadmin } from '@/lib/superadminGate';
import { listTeams, type StavPodniku } from '@/lib/admin';
import { odmitnuto, odpoved } from '../_odpoved';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  const u = new URL(request.url);
  return odpoved(() => listTeams({
    q: u.searchParams.get('q') ?? '',
    stav: (u.searchParams.get('stav') as StavPodniku | 'vse' | null) ?? 'vse',
    limit: Number(u.searchParams.get('limit') ?? 50),
    offset: Number(u.searchParams.get('offset') ?? 0),
  }));
}
