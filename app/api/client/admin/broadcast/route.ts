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
  // Ke každé zprávě i to, co po ní přišlo: kolik různých členů se v sedmi
  // dnech po odeslání objevilo u kasy, a kolik jich přišlo sedm dní předtím.
  // Není to důkaz, že za to může zpráva — je to jediné poctivé srovnání,
  // které z našich dat jde udělat, a bez něj se posílá naslepo.
  const history = await sql`
    SELECT b.*,
      (SELECT COUNT(DISTINCT l.customer_id)::int FROM client_loyalty_ledger l
        WHERE l.team_id = b.team_id AND l.created_at >= b.sent_at
          AND l.created_at < b.sent_at + INTERVAL '7 days') AS visits_after,
      (SELECT COUNT(DISTINCT l.customer_id)::int FROM client_loyalty_ledger l
        WHERE l.team_id = b.team_id AND l.created_at >= b.sent_at - INTERVAL '7 days'
          AND l.created_at < b.sent_at) AS visits_before,
      (b.sent_at > NOW() - INTERVAL '7 days') AS still_running
    FROM client_broadcasts b
    WHERE b.team_id = ${u.team_id} ORDER BY b.sent_at DESC LIMIT 50`;
  const [c] = await sql`
    SELECT COUNT(*)::int AS members,
           COUNT(*) FILTER (WHERE last_visit_at IS NULL OR last_visit_at < NOW() - INTERVAL '30 days')::int AS quiet,
           COUNT(*) FILTER (WHERE visits >= 25)::int AS gold
    FROM client_memberships WHERE team_id = ${u.team_id}` as any[];
  return NextResponse.json({ history, members: Number(c?.members) || 0, quiet: Number(c?.quiet) || 0, gold: Number(c?.gold) || 0 });
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
  // Publikum: všem, těm, kdo dlouho nebyli (probuzení), nebo zlatým hostům.
  const audience = ['all', 'quiet', 'gold'].includes(String(b.audience)) ? String(b.audience) : 'all';
  const rows = audience === 'quiet'
    ? await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${u.team_id} AND (last_visit_at IS NULL OR last_visit_at < NOW() - INTERVAL '30 days')`
    : audience === 'gold'
      ? await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${u.team_id} AND visits >= 25`
      : await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${u.team_id}`;
  const ids = (rows as any[]).map(r => Number(r.customer_id));
  if (ids.length) await notifyUsers(ids, { title, body: body || undefined, link: p ? `/client/${p.slug}` : '/client', type: 'info', category: 'general' });
  const [row] = await sql`INSERT INTO client_broadcasts (team_id, title, body, recipients, sent_by, audience) VALUES (${u.team_id}, ${title}, ${body || null}, ${ids.length}, ${u.id}, ${audience}) RETURNING *`;
  audit(u.team_id, u.id, 'client.broadcast', 'client', null, `${title} · ${ids.length} členů (${audience})`);
  return NextResponse.json({ ok: true, broadcast: row });
}
