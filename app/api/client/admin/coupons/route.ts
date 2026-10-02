// Kupony: nabídky za body (kind = offer) v plné síle — výhoda (% / Kč / X+Y),
// cílení na úrovně a skupiny, limity (na hosta, celkem, denně), časová okna vč. noční,
// 18+, uvítací kupony, koncept a archiv. Odměny za razítka (kind = stamps) vznikají samy z plných karet.
// Kontrola polí je ve sdílené lib/kuponyPole (stejná jako v editoru). Poslat kupon hostům: ./send,
// přehled uplatnění: ./prehled.
import { NextRequest, NextResponse } from 'next/server';
import { sql, award } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { shapeCoupon } from '@/lib/coupons';
import { normalizujKupon, zkontrolujKupon } from '@/lib/kuponyPole';
import { menaPodniku } from '@/lib/menaPodniku';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiKupony();
  const teamId = ctx.teamId;
  const rows = await sql`
    SELECT c.*, (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = c.id) AS claimed,
           (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = c.id AND cl.redeemed_at IS NOT NULL) AS redeemed
    FROM client_coupons c WHERE c.team_id = ${u.team_id} AND c.kind = 'offer'
    ORDER BY (c.archived_at IS NOT NULL), c.active DESC, c.cost_points, c.id`;
  let groups: any[] = [];
  try {
    groups = await sql`
      SELECT g.id, g.name, (SELECT COUNT(*)::int FROM client_group_members gm WHERE gm.group_id = g.id) AS members
      FROM client_groups g WHERE g.team_id = ${teamId} ORDER BY g.name, g.id` as any[];
  } catch { groups = []; }
  const groupName = new Map((groups as any[]).map((g: any) => [Number(g.id), String(g.name)]));
  // Částky v popiscích výhod jsou v měně podniku, ne natvrdo v korunách.
  const castka = (await menaPodniku(teamId)).money;
  const coupons = bohate.map(r => {
    const s = shapeCoupon(r, castka);
    return {
      ...s,
      stav: stavKuponu({ ...r, issued: r.issued ?? r.claimed }, dnes),
      claimed: Number(r.claimed) || 0, redeemed: Number(r.redeemed) || 0, openClaims: Number(r.open_claims) || 0,
      issued: r.issued == null ? Number(r.claimed) || 0 : Number(r.issued),
      targetGroupNames: s.targetGroups.map(id => groupName.get(id) ?? `#${id}`),
    };
  });
  return NextResponse.json({ coupons, groups, polozky });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiKupony();
  const teamId = ctx.teamId;
  const b = await req.json().catch(() => ({}));
  const f = normalizujKupon(b);
  const bad = zkontrolujKupon(f, b);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const [c] = await sql`
    INSERT INTO client_coupons (
      team_id, title, description, cost_points, active, draft, benefit_kind, percent_off, amount_off,
      xy_buy, xy_free, min_order_value, max_total, daily_limit, target_tiers, target_groups, per_customer, cooldown_days,
      days_of_week, hour_from, hour_till, adult_only, welcome, valid_since, valid_until)
    VALUES (
      ${u.team_id}, ${f.title}, ${f.description}, ${f.cost_points}, ${f.active}, ${f.draft}, ${f.benefit_kind}, ${f.percent_off}, ${f.amount_off},
      ${f.xy_buy}, ${f.xy_free}, ${f.min_order_value}, ${f.max_total}, ${f.daily_limit}, ${JSON.stringify(f.target_tiers)}::jsonb, ${JSON.stringify(f.target_groups)}::jsonb, ${f.per_customer}, ${f.cooldown_days},
      ${f.days_of_week ? JSON.stringify(f.days_of_week) : null}::jsonb, ${f.hour_from}, ${f.hour_till}, ${f.adult_only}, ${f.welcome}, ${f.valid_since}, ${f.valid_until})
    RETURNING *`;
  await audit(u.team_id, u.id, 'client.kupon', 'client_coupon', Number(c.id), `založen${f.draft ? ' jako koncept' : ''}: ${f.title}`);
  return NextResponse.json({ ok: true, coupon: shapeCoupon(c, (await menaPodniku(u.team_id)).money) });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiKupony();
  const teamId = ctx.teamId;
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  const [cur] = await sql`SELECT * FROM client_coupons WHERE id = ${id} AND team_id = ${u.team_id} AND kind = 'offer'`;
  if (!cur) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 404 });
  // Rychlé změny stavu (aktivita, koncept → zveřejnit, archiv) nechají zbytek kuponu na pokoji.
  if (b.title === undefined && (b.active !== undefined || b.draft !== undefined || b.archived !== undefined)) {
    const active = b.active === undefined ? null : !!b.active;
    const draft = b.draft === undefined ? null : !!b.draft;
    const arch = b.archived === undefined ? null : !!b.archived;
    const [c] = await sql`
      UPDATE client_coupons SET
        active = COALESCE(${active}, active),
        draft = COALESCE(${draft}, draft),
        archived_at = CASE WHEN ${arch}::boolean IS NULL THEN archived_at WHEN ${arch}::boolean THEN COALESCE(archived_at, NOW()) ELSE NULL END
      WHERE id = ${id} AND team_id = ${u.team_id} RETURNING *`;
    const co = arch === true ? 'archivován' : arch === false ? 'vrácen z archivu' : draft === false ? 'zveřejněn' : draft === true ? 'vrácen do konceptu' : active ? 'zapnut' : 'vypnut';
    await audit(u.team_id, u.id, 'client.kupon', 'client_coupon', id, `${co}: ${cur.title}`);
    return NextResponse.json({ ok: true, coupon: shapeCoupon(c, (await menaPodniku(u.team_id)).money) });
  }
  const f = normalizujKupon(b);
  const bad = zkontrolujKupon(f, b);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  // Limit kusů nejde snížit pod to, co už je vydané — hosté by drželi kupon, který „nemá existovat".
  if (f.max_total && f.max_total < Number(cur.issued)) {
    return NextResponse.json({ error: `Už je vydáno ${Number(cur.issued)} kusů. Celkový limit nastav aspoň na tolik.` }, { status: 400 });
  }
  const [c] = await sql`
    UPDATE client_coupons SET
      title = ${f.title}, description = ${f.description}, cost_points = ${f.cost_points}, active = ${f.active}, draft = ${f.draft},
      benefit_kind = ${f.benefit_kind}, percent_off = ${f.percent_off}, amount_off = ${f.amount_off},
      xy_buy = ${f.xy_buy}, xy_free = ${f.xy_free}, min_order_value = ${f.min_order_value},
      max_total = ${f.max_total}, daily_limit = ${f.daily_limit},
      target_tiers = ${JSON.stringify(f.target_tiers)}::jsonb, target_groups = ${JSON.stringify(f.target_groups)}::jsonb,
      per_customer = ${f.per_customer}, cooldown_days = ${f.cooldown_days},
      days_of_week = ${f.days_of_week ? JSON.stringify(f.days_of_week) : null}::jsonb,
      hour_from = ${f.hour_from}, hour_till = ${f.hour_till},
      adult_only = ${f.adult_only}, welcome = ${f.welcome},
      valid_since = ${f.valid_since}, valid_until = ${f.valid_until}
    WHERE id = ${id} AND team_id = ${u.team_id} RETURNING *`;
  await audit(u.team_id, u.id, 'client.kupon', 'client_coupon', id, `upraven: ${f.title}`);
  return NextResponse.json({ ok: true, coupon: shapeCoupon(c, (await menaPodniku(u.team_id)).money) });
}

/**
 * Smazání. Bez `force=1` s neuplatněnými kódy odmítne (409) a řekne, co dál.
 * S `force=1` („Zrušit nevyzvednuté a smazat") nejdřív zruší nevyzvednuté kódy a vrátí hostům body,
 * které za ně utratili. Kupon, který už někdo uplatnil, se nemaže: zmizela by historie a přehled
 * uplatnění — takový kupon se archivuje.
 */
export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get('id') ?? '');
  const force = url.searchParams.get('force') === '1';
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatný kupon' }, { status: 400 });
  const [c] = await sql`SELECT id, title, cost_points FROM client_coupons WHERE id = ${id} AND team_id = ${u.team_id} AND kind = 'offer'`;
  if (!c) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 404 });
  const [st] = await sql`
    SELECT COUNT(*) FILTER (WHERE redeemed_at IS NULL)::int AS otevrene, COUNT(*) FILTER (WHERE redeemed_at IS NOT NULL)::int AS uplatnene
    FROM client_coupon_claims WHERE coupon_id = ${id} AND team_id = ${u.team_id}`;
  const otevrene = Number(st?.otevrene) || 0;
  const uplatnene = Number(st?.uplatnene) || 0;
  if (uplatnene > 0) {
    return NextResponse.json({ error: `Kupon už hosté uplatnili ${uplatnene}×. Smazáním bys ztratil historii, proto ho archivuj.`, uplatnene, otevrene }, { status: 409 });
  }
  if (otevrene > 0 && !force) {
    return NextResponse.json({
      error: `Hosté drží ${otevrene} neuplatněných kódů. Kupon můžeš archivovat (kódy zůstanou platné), nebo zrušit nevyzvednuté a smazat.`,
      otevrene, uplatnene,
    }, { status: 409 });
  }
  let vraceno = 0;
  if (otevrene > 0) {
    const kody = await sql`
      SELECT id, customer_id, source FROM client_coupon_claims WHERE coupon_id = ${id} AND team_id = ${u.team_id} AND redeemed_at IS NULL` as any[];
    for (const k of kody) {
      // Smazání je podmíněné: kód, který obsluha mezitím uplatnila, se nezruší (a body se nevrací).
      const gone = await sql`DELETE FROM client_coupon_claims WHERE id = ${k.id} AND redeemed_at IS NULL RETURNING id`;
      if (!gone.length) continue;
      // Body vracíme jen tam, kde je host za kupon skutečně zaplatil (vyzvednutí za body).
      if (k.source === 'points' && Number(c.cost_points) > 0) {
        await award(u.team_id, Number(k.customer_id), Number(c.cost_points), 'coupon', `zruseni:${k.id}`, `Vráceno: kupon „${c.title}" byl zrušen`);
        vraceno += 1;
      }
    }
    // Mezitím mohl někdo kupon uplatnit: pak se nemaže, jen archivuje.
    const [po] = await sql`SELECT COUNT(*)::int AS n FROM client_coupon_claims WHERE coupon_id = ${id} AND team_id = ${u.team_id}`;
    if (Number(po?.n) > 0) {
      await sql`UPDATE client_coupons SET archived_at = COALESCE(archived_at, NOW()) WHERE id = ${id} AND team_id = ${u.team_id}`;
      return NextResponse.json({ error: 'Během mazání se kupon uplatnil, tak jsem ho jen archivoval.' }, { status: 409 });
    }
  }
  await sql`DELETE FROM client_coupons WHERE id = ${id} AND team_id = ${u.team_id} AND kind = 'offer'`;
  await audit(u.team_id, u.id, 'client.kupon', 'client_coupon', id,
    `smazán: ${c.title}${otevrene ? ` (zrušeno ${otevrene} nevyzvednutých, body vráceny ${vraceno}×)` : ''}`);
  return NextResponse.json({ ok: true, zruseno: otevrene, vraceno });
}
