import { requireSuperadmin } from '@/lib/superadminGate';
import { adminAudit } from '@/lib/admin';
import { odmitnuto, odpoved } from '../_odpoved';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return odmitnuto(g);
  const u = new URL(request.url);
  const teamId = u.searchParams.get('team');
  return odpoved(async () => ({ zasahy: await adminAudit({ teamId: teamId ? Number(teamId) : undefined, limit: Number(u.searchParams.get('limit') ?? 100) }) }));
}
