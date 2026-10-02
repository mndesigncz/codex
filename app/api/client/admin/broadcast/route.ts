// Zpráva členům: novinka, akce, sezónní nabídka. Přijde jako oznámení v aplikaci a push
// na telefon, nebo e-mailem, a umí nést kupon nebo promo kód. Umí počkat na naplánovaný čas,
// mířit na publikum (úrovně, skupiny, spáči, kombinace segmentů) a vzít hosta na konkrétní místo.
// GET: historie s doručením a návštěvami, počty publik, kupony a kódy k přiložení; s ?nahled=1
// dosah vybraného publika. POST: odeslat / naplánovat, s akce:'test' zkouška jen sobě.
// PATCH: úprava naplánované zprávy. DELETE: zrušení naplánované.
import { tierThresholds, tierRulesFromProfile } from '@/lib/clientSlots';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import {
  dispatchDueBroadcasts, segmentyPocty, vytvorZpravu, posliZkousku, upravNaplanovanou, dosahPublika, skupinyKVyberu,
  jePlatnePublikum, audienceLabel,
} from '@/lib/broadcasts';
import { zajistiSchemaClenu } from '@/lib/clenoveSchema';
import { jeKanal } from '@/lib/zpravyEmail';
import { audit } from '@/lib/audit';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zpravy');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  await zajistiSchemaClenu();

  // Náhled dosahu: kolik lidí zprávu opravdu dostane přes zvolený kanál.
  const params = new URL(req.url).searchParams;
  if (params.get('nahled') === '1') {
    const audience = String(params.get('audience') ?? 'all');
    if (!jePlatnePublikum(audience)) return NextResponse.json({ error: 'Neplatné publikum.' }, { status: 400 });
    const kanal = jeKanal(params.get('channels')) ? params.get('channels') as any : 'push';
    const vybrani = String(params.get('vybrani') ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
    const dosah = await dosahPublika(u.team_id, audience, kanal, vybrani);
    return NextResponse.json({ dosah, label: audienceLabel(audience) });
  }

  await dispatchDueBroadcasts(8000);
  // Ke každé zprávě i to, co po ní přišlo: kolik různých příjemců se v sedmi dnech po odeslání objevilo
  // u kasy (jen návštěvy, ne body za pozvání ani ruční úpravy), a kolik jich přišlo sedm dní předtím.
  // Není to důkaz, že za to může zpráva — je to jediné poctivé srovnání, které z našich dat jde udělat,
  // a bez něj se posílá naslepo. Zpráva, která si pamatuje příjemce, se počítá jen nad nimi.
  const history = await sql`
    SELECT b.*,
      (SELECT COUNT(DISTINCT l.customer_id)::int FROM client_loyalty_ledger l
        WHERE l.team_id = b.team_id AND l.kind = 'visit' AND l.created_at >= b.sent_at
          AND l.created_at < b.sent_at + INTERVAL '7 days'
          AND (b.prijemci IS NULL OR l.customer_id IN (SELECT (jsonb_array_elements_text(b.prijemci))::int))) AS visits_after,
      (SELECT COUNT(DISTINCT l.customer_id)::int FROM client_loyalty_ledger l
        WHERE l.team_id = b.team_id AND l.kind = 'visit' AND l.created_at >= b.sent_at - INTERVAL '7 days'
          AND l.created_at < b.sent_at
          AND (b.prijemci IS NULL OR l.customer_id IN (SELECT (jsonb_array_elements_text(b.prijemci))::int))) AS visits_before,
      (b.sent_at > NOW() - INTERVAL '7 days') AS still_running
    FROM client_broadcasts b
    WHERE b.team_id = ${u.team_id} AND (b.status IS NULL OR b.status <> 'cancelled')
    ORDER BY COALESCE(b.scheduled_at, b.sent_at) DESC LIMIT 50` as any[];
  // Velikosti publik pro výběr: úrovně z prahů podniku, skupiny s počty.
  const [p] = await sql`SELECT * FROM client_profiles WHERE team_id = ${u.team_id}`;
  const th = tierThresholds(tierRulesFromProfile(p));
  const platinumAt = th.platinum;
  const [c] = th.by === 'spend' ? await sql`
    SELECT COUNT(*)::int AS members,
           COUNT(*) FILTER (WHERE spend >= ${th.silver})::int AS silver,
           COUNT(*) FILTER (WHERE spend >= ${th.gold})::int AS gold,
           COUNT(*) FILTER (WHERE spend >= ${platinumAt > 0 ? platinumAt : th.gold})::int AS platinum
    FROM client_memberships WHERE team_id = ${u.team_id} AND blocked = FALSE` as any[] : await sql`
    SELECT COUNT(*)::int AS members,
           COUNT(*) FILTER (WHERE visits >= ${th.silver})::int AS silver,
           COUNT(*) FILTER (WHERE visits >= ${th.gold})::int AS gold,
           COUNT(*) FILTER (WHERE visits >= ${platinumAt > 0 ? platinumAt : th.gold})::int AS platinum
    FROM client_memberships WHERE team_id = ${u.team_id} AND blocked = FALSE` as any[];
  const groups = (await skupinyKVyberu(u.team_id)).filter(g => !g.archived);
  const segments = await segmentyPocty(u.team_id);
  // Kupony a promo kódy k přiložení: jen platné a zapnuté.
  let kupony: any[] = [], promo: any[] = [];
  try { kupony = await sql`SELECT id, title FROM client_coupons WHERE team_id = ${u.team_id} AND active = TRUE AND kind = 'offer' ORDER BY title, id LIMIT 100` as any[]; } catch { kupony = []; }
  try { promo = await sql`SELECT code, title FROM client_promos WHERE team_id = ${u.team_id} ORDER BY created_at DESC LIMIT 100` as any[]; } catch { promo = []; }
  return NextResponse.json({
    history,
    members: Number(c?.members) || 0,
    segments, quiet: segments.quiet ?? 0,
    silver: Number(c?.silver) || 0, gold: Number(c?.gold) || 0,
    platinum: platinumAt > 0 ? Number(c?.platinum) || 0 : null,
    groups: groups.map(g => ({ id: g.id, name: g.name, members: g.members, dynamic: !!g.rule })),
    kupony: kupony.map(k => ({ id: Number(k.id), title: String(k.title) })),
    promo: promo.map(k => ({ code: String(k.code), title: String(k.title) })),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zpravy');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  // Zkouška jen sobě: bez denního limitu, bez zápisu do historie, bez připsání kuponu.
  if (b.akce === 'test') {
    const r = await posliZkousku(ctx.teamId, ctx.meId, b);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, ...r.v });
  }
  const r = await vytvorZpravu(ctx.teamId, ctx.meId, b);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, broadcast: r.row, scheduled: r.scheduled });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zpravy');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const id = Math.round(Number(b.id));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Neplatná zpráva' }, { status: 400 });
  const r = await upravNaplanovanou(ctx.teamId, id, ctx.meId, b);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, broadcast: r.row });
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zpravy');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná zpráva' }, { status: 400 });
  // Zrušit jde jen to, co ještě neodešlo.
  const done = await sql`
    UPDATE client_broadcasts SET status = 'cancelled'
    WHERE id = ${id} AND team_id = ${u.team_id} AND status = 'scheduled' RETURNING id, title`;
  if (!done.length) return NextResponse.json({ error: 'Zpráva už odešla, nebo neexistuje.' }, { status: 409 });
  audit(u.team_id, u.id, 'client.broadcast', 'client', null, `zrušeno: ${done[0].title}`);
  return NextResponse.json({ ok: true });
}
