// Přepnout aktivní podnik. Členství ověří server; klient pak zavolá
// session.update(), aby si token vzal nový tým z databáze.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prepniTym } from '@/lib/tenant';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const s = await getServerSession(authOptions);
  if (!s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if ((s.user as any).role === 'kiosk') return NextResponse.json({ error: 'Tablet podnik nepřepíná.' }, { status: 403 });
  const meId = parseInt((s.user as any).id);
  const b = await req.json().catch(() => ({}));
  const teamId = parseInt(b.teamId);
  if (!Number.isFinite(teamId)) return NextResponse.json({ error: 'Chybí podnik.' }, { status: 400 });
  const cil = await prepniTym(meId, teamId);
  if (!cil) return NextResponse.json({ error: 'V tomhle podniku nejsi členem.' }, { status: 403 });
  audit(cil.teamId, meId, 'team.switch', 'team', cil.teamId, `Přepnuto na „${cil.teamName}"`);
  return NextResponse.json({ ok: true, teamId: cil.teamId, role: cil.role, teamName: cil.teamName });
}
