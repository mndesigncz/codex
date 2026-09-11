// Zpráva všem členům: novinka, akce, sezónní nabídka. Přijde jako oznámení
// v aplikaci a push na telefon, pokud ho mají zapnutý.
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer } from '@/lib/client';
import { notifyUsers } from '@/lib/push';
import { hit } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const history = await sql`SELECT * FROM client_broadcasts WHERE team_id = ${u.team_id} ORDER BY sent_at DESC LIMIT 50`;
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM client_memberships WHERE team_id = ${u.team_id}` as any[];
  return NextResponse.json({ history, members: Number(n) || 0 });
}
export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const gate = await hit(`client-broadcast:${u.team_id}`, 5, 24 * 3600);
  if (!gate.ok) return NextResponse.json({ error: 'Nejvýš pět zpráv za den, ať to členům nezevšední.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim().slice(0, 80);
  const body = String(b.body ?? '').trim().slice(0, 300);
  if (!title) return NextResponse.json({ error: 'Zpráva potřebuje nadpis.' }, { status: 400 });
  const [p] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${u.team_id}`;
  const ids = (await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${u.team_id}` as any[]).map(r => Number(r.customer_id));
  if (ids.length) await notifyUsers(ids, { title, body: body || undefined, link: p ? `/client/${p.slug}` : '/client', type: 'info', category: 'general' });
  const [row] = await sql`INSERT INTO client_broadcasts (team_id, title, body, recipients, sent_by) VALUES (${u.team_id}, ${title}, ${body || null}, ${ids.length}, ${u.id}) RETURNING *`;
  audit(u.team_id, u.id, 'client.broadcast', 'client', null, `${title} · ${ids.length} členů`);
  return NextResponse.json({ ok: true, broadcast: row });
}
