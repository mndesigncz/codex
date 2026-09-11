import { NextResponse } from 'next/server';
import { customer, profileBySlug, join, membership, award } from '@/lib/client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(_req: Request, { params }: { params: { slug: string } }) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const teamId = Number(p.team_id);
  const already = await membership(me.id, teamId);
  const m = await join(me.id, teamId);
  // Uvítací body: hned je co ztratit, hned je proč se vrátit.
  if (!already && p.loyalty_on && Number(p.points_per_100) > 0) await award(teamId, me.id, 10, 'welcome', null, 'Vítej v podniku');
  return NextResponse.json({ ok: true, points: Number(m?.points ?? 0) + (!already && p.loyalty_on ? 10 : 0) });
}
