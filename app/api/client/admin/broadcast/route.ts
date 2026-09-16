// Zpráva členům: novinka, akce, sezónní nabídka. Přijde jako oznámení
// v aplikaci a push na telefon. Umí počkat na naplánovaný čas, mířit na
// publikum (úrovně, skupiny, spáči) a vzít hosta na konkrétní místo.
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer } from '@/lib/client';
import { dispatchDueBroadcasts, sendNow, AUDIENCES } from '@/lib/broadcasts';
import { hit } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const LINKS = ['page', 'loyalty', 'order', 'me'];

function validAudience(a: string): boolean {
  return (AUDIENCES as readonly string[]).includes(a) || /^group:\d+$/.test(a) || a === 'gold';
}

export async function GET() {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  await dispatchDueBroadcasts();
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
    WHERE b.team_id = ${u.team_id} AND (b.status IS NULL OR b.status <> 'cancelled')
    ORDER BY COALESCE(b.scheduled_at, b.sent_at) DESC LIMIT 50`;
  // Velikosti publik pro výběr: úrovně z prahů podniku, skupiny s počty.
  const [p] = await sql`SELECT silver_at, gold_at, platinum_at FROM client_profiles WHERE team_id = ${u.team_id}`;
  const silverAt = Math.max(1, Number(p?.silver_at) || 10);
  const goldAt = Math.max(silverAt + 1, Number(p?.gold_at) || 25);
  const platinumAt = Number(p?.platinum_at) > 0 ? Math.max(goldAt + 1, Number(p?.platinum_at)) : 0;
  const [c] = await sql`
    SELECT COUNT(*)::int AS members,
           COUNT(*) FILTER (WHERE last_visit_at IS NULL OR last_visit_at < NOW() - INTERVAL '30 days')::int AS quiet,
           COUNT(*) FILTER (WHERE visits >= ${silverAt})::int AS silver,
           COUNT(*) FILTER (WHERE visits >= ${goldAt})::int AS gold,
           COUNT(*) FILTER (WHERE visits >= ${platinumAt > 0 ? platinumAt : goldAt})::int AS platinum
    FROM client_memberships WHERE team_id = ${u.team_id}` as any[];
  let groups: any[] = [];
  try {
    groups = await sql`
      SELECT g.id, g.name, (SELECT COUNT(*)::int FROM client_group_members gm WHERE gm.group_id = g.id) AS members
      FROM client_groups g WHERE g.team_id = ${u.team_id} ORDER BY g.name` as any[];
  } catch { groups = []; }
  return NextResponse.json({
    history,
    members: Number(c?.members) || 0, quiet: Number(c?.quiet) || 0,
    silver: Number(c?.silver) || 0, gold: Number(c?.gold) || 0,
    platinum: platinumAt > 0 ? Number(c?.platinum) || 0 : null,
    groups,
  });
}

export async function POST(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim().slice(0, 80);
  const body = String(b.body ?? '').trim().slice(0, 300);
  if (!title) return NextResponse.json({ error: 'Zpráva potřebuje nadpis.' }, { status: 400 });
  const audience = validAudience(String(b.audience)) ? String(b.audience) : 'all';
  const linkKind = LINKS.includes(String(b.linkKind)) ? String(b.linkKind) : 'page';
  // Naplánování: čas v budoucnu → zpráva jde do fronty a počká si.
  const at = b.scheduledAt ? new Date(String(b.scheduledAt)) : null;
  const scheduled = at && !isNaN(at.getTime()) && at.getTime() > Date.now() + 60000;
  if (scheduled && at!.getTime() > Date.now() + 90 * 86400000) {
    return NextResponse.json({ error: 'Plánovat jde nejvýš 90 dní dopředu.' }, { status: 400 });
  }
  const gate = await hit(`client-broadcast:${u.team_id}`, 5, 24 * 3600);
  if (!gate.ok) return NextResponse.json({ error: 'Nejvýš pět zpráv za den, ať to členům nezevšední.' }, { status: 429 });

  if (scheduled) {
    const [row] = await sql`
      INSERT INTO client_broadcasts (team_id, title, body, recipients, sent_by, audience, status, scheduled_at, sent_at, link_kind)
      VALUES (${u.team_id}, ${title}, ${body || null}, 0, ${u.id}, ${audience}, 'scheduled', ${at!.toISOString()}, ${at!.toISOString()}, ${linkKind})
      RETURNING *`;
    audit(u.team_id, u.id, 'client.broadcast', 'client', null, `naplánováno: ${title} (${audience})`);
    return NextResponse.json({ ok: true, broadcast: row, scheduled: true });
  }
  const [row] = await sql`
    INSERT INTO client_broadcasts (team_id, title, body, recipients, sent_by, audience, status, link_kind)
    VALUES (${u.team_id}, ${title}, ${body || null}, 0, ${u.id}, ${audience}, 'sent', ${linkKind})
    RETURNING *`;
  const sent = await sendNow(row);
  audit(u.team_id, u.id, 'client.broadcast', 'client', null, `${title} · ${sent} členů (${audience})`);
  return NextResponse.json({ ok: true, broadcast: { ...row, recipients: sent } });
}

export async function DELETE(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná zpráva' }, { status: 400 });
  // Zrušit jde jen to, co ještě neodešlo.
  const done = await sql`
    UPDATE client_broadcasts SET status = 'cancelled'
    WHERE id = ${id} AND team_id = ${u.team_id} AND status = 'scheduled' RETURNING id`;
  if (!done.length) return NextResponse.json({ error: 'Zpráva už odešla, nebo neexistuje.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
