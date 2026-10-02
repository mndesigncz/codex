// Kupony: nabídky za body (kind = offer) v plné síle — výhoda (% / Kč / X+Y / zdarma),
// vázání na položku nabídky, vyloučené položky a kategorie, cílení na úrovně
// a skupiny, limity (kusy, uplatnění za den, na hosta), časová okna i přes půlnoc,
// 18+, uvítací kupony, koncept / naplánováno / archiv, duplikace, hromadné akce,
// historie změn (audit) a export CSV. Odměny za razítka (kind = stamps) vznikají
// samy z plných karet. Rozeslání hostům: ./send, přehled uplatnění: ./prehled.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { shapeCoupon, hodnotyKuponu, kontrolaKuponu, popisZmen, stavKuponu, kuponyCsv, type HodnotyKuponu } from '@/lib/kuponyPravidla';
import { zajistiKupony, polozkyNabidky, obohatKupony } from '@/lib/kuponyDb';
import { menaPodniku } from '@/lib/menaPodniku';
import { pragueToday } from '@/lib/pragueTime';
import { czCount } from '@/lib/czech';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const KUPON: import('@/lib/czech').CzNoun = { one: 'kupon', few: 'kupony', many: 'kuponů' };
const AKCE_HROMADNE = ['aktivovat', 'pozastavit', 'archivovat', 'obnovit', 'smazat'] as const;

/** Položka nabídky a vyloučené položky musí být z nabídky tohoto podniku. */
async function overNabidku(teamId: number, f: HodnotyKuponu): Promise<string | null> {
  if (!f.menu_item_id && !f.excluded_items.length) return null;
  const mam = new Set((await polozkyNabidky(teamId)).map(p => p.id));
  if (f.menu_item_id && !mam.has(f.menu_item_id)) return 'Položka nabídky, na kterou kupon platí, nebyla nalezena.';
  f.excluded_items = f.excluded_items.filter(id => mam.has(id));
  return null;
}

const SLOUPCE_VLOZENI = (f: HodnotyKuponu, teamId: number) => sql`
  INSERT INTO client_coupons (
    team_id, title, description, cost_points, active, status, benefit_kind, percent_off, amount_off,
    xy_buy, xy_free, min_order_value, target_tiers, target_groups, per_customer, cooldown_days,
    days_of_week, hour_from, hour_till, adult_only, welcome, valid_since, valid_until,
    total_limit, daily_limit, menu_item_id, excluded_items, excluded_categories)
  VALUES (
    ${teamId}, ${f.title}, ${f.description}, ${f.cost_points}, ${f.active}, ${f.status}, ${f.benefit_kind}, ${f.percent_off}, ${f.amount_off},
    ${f.xy_buy}, ${f.xy_free}, ${f.min_order_value}, ${JSON.stringify(f.target_tiers)}::jsonb, ${JSON.stringify(f.target_groups)}::jsonb, ${f.per_customer}, ${f.cooldown_days},
    ${f.days_of_week ? JSON.stringify(f.days_of_week) : null}::jsonb, ${f.hour_from}, ${f.hour_till}, ${f.adult_only}, ${f.welcome}, ${f.valid_since}, ${f.valid_until},
    ${f.total_limit}, ${f.daily_limit}, ${f.menu_item_id}, ${JSON.stringify(f.excluded_items)}::jsonb, ${JSON.stringify(f.excluded_categories)}::jsonb)
  RETURNING *`;

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiKupony();
  const teamId = ctx.teamId;
  const rows = await sql`
    SELECT c.*, (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = c.id) AS claimed,
           (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = c.id AND cl.redeemed_at IS NOT NULL) AS redeemed,
           (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = c.id AND cl.redeemed_at IS NULL) AS open_claims
    FROM client_coupons c WHERE c.team_id = ${teamId} AND c.kind = 'offer' ORDER BY c.active DESC, c.cost_points, c.id`;
  const polozky = await polozkyNabidky(teamId);
  const bohate = obohatKupony(rows as any[], polozky);
  const dnes = pragueToday();
  if (new URL(req.url).searchParams.get('export') === 'csv') {
    const csv = kuponyCsv(bohate.map(r => ({ ...r, issued: r.issued ?? r.claimed })), dnes, (await menaPodniku(teamId)).money);
    return new NextResponse(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="kupony-${dnes}.csv"`, 'Cache-Control': 'private, no-store' },
    });
  }
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
  // Duplikace: kopie jako koncept, bez uvítacího příznaku (ať nevzniknou dva uvítací kupony naráz).
  if (b.duplicateOf != null) {
    const id = parseInt(String(b.duplicateOf), 10);
    const [src] = Number.isFinite(id) ? await sql`SELECT * FROM client_coupons WHERE id = ${id} AND team_id = ${teamId} AND kind = 'offer'` : [];
    if (!src) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 404 });
    const f = hodnotyKuponu({
      ...shapeCoupon(src), title: `${String(src.title).slice(0, 70)} (kopie)`, status: 'draft', welcome: false,
    });
    const [c] = await SLOUPCE_VLOZENI(f, teamId);
    audit(teamId, ctx.meId, 'client.coupon', 'client_coupon', c.id, `zkopírován z kuponu č. ${src.id}: ${f.title}`);
    return NextResponse.json({ ok: true, coupon: shapeCoupon(c, (await menaPodniku(teamId)).money) });
  }
  const f = hodnotyKuponu(b);
  const bad = kontrolaKuponu(f) ?? await overNabidku(teamId, f);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const [c] = await SLOUPCE_VLOZENI(f, teamId);
  audit(teamId, ctx.meId, 'client.coupon', 'client_coupon', c.id, `${f.status === 'draft' ? 'koncept' : 'založen'}: ${f.title}`);
  return NextResponse.json({ ok: true, coupon: shapeCoupon(c, (await menaPodniku(teamId)).money) });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiKupony();
  const teamId = ctx.teamId;
  const b = await req.json().catch(() => ({}));
  // Hromadná akce nad vybranými kupony.
  if (Array.isArray(b.ids)) {
    const akce = String(b.action ?? '');
    if (!(AKCE_HROMADNE as readonly string[]).includes(akce)) return NextResponse.json({ error: 'Neznámá hromadná akce.' }, { status: 400 });
    const ids = Array.from(new Set(b.ids.map((x: any) => parseInt(String(x), 10)).filter((n: number) => Number.isFinite(n) && n > 0))).slice(0, 200) as number[];
    if (!ids.length) return NextResponse.json({ error: 'Vyber aspoň jeden kupon.' }, { status: 400 });
    let hotovo = 0; let preskoceno = 0;
    if (akce === 'smazat') {
      // Kupony, které hosté ještě drží, se nemažou (stejné pravidlo jako u jednoho kuponu).
      const volne = await sql`
        SELECT c.id FROM client_coupons c WHERE c.team_id = ${teamId} AND c.kind = 'offer' AND c.id = ANY(${ids})
          AND NOT EXISTS (SELECT 1 FROM client_coupon_claims cl WHERE cl.coupon_id = c.id AND cl.redeemed_at IS NULL)` as any[];
      const smaz = volne.map(r => Number(r.id));
      if (smaz.length) await sql`DELETE FROM client_coupons WHERE team_id = ${teamId} AND kind = 'offer' AND id = ANY(${smaz})`;
      hotovo = smaz.length; preskoceno = ids.length - hotovo;
    } else {
      const r = akce === 'aktivovat' ? await sql`UPDATE client_coupons SET active = TRUE WHERE team_id = ${teamId} AND kind = 'offer' AND id = ANY(${ids}) RETURNING id`
        : akce === 'pozastavit' ? await sql`UPDATE client_coupons SET active = FALSE WHERE team_id = ${teamId} AND kind = 'offer' AND id = ANY(${ids}) RETURNING id`
        : akce === 'archivovat' ? await sql`UPDATE client_coupons SET status = 'archived', welcome = FALSE WHERE team_id = ${teamId} AND kind = 'offer' AND id = ANY(${ids}) RETURNING id`
        : await sql`UPDATE client_coupons SET status = 'live' WHERE team_id = ${teamId} AND kind = 'offer' AND id = ANY(${ids}) AND status <> 'live' RETURNING id`;
      hotovo = r.length; preskoceno = ids.length - hotovo;
    }
    audit(teamId, ctx.meId, 'client.coupon', 'client_coupon', null, `hromadně ${akce}: ${czCount(hotovo, KUPON)}`);
    return NextResponse.json({ ok: true, hotovo, preskoceno });
  }
  const id = parseInt(String(b.id), 10);
  const [cur] = Number.isFinite(id) ? await sql`SELECT * FROM client_coupons WHERE id = ${id} AND team_id = ${teamId}` : [];
  if (!cur) return NextResponse.json({ error: 'Kupon nenalezen' }, { status: 404 });
  const castka = (await menaPodniku(teamId)).money;
  // Rychlé přepnutí aktivity nebo stavu (koncept / živý / archiv) nechá zbytek kuponu na pokoji.
  if (b.title === undefined && (b.active !== undefined || b.status !== undefined)) {
    const active = b.active === undefined ? cur.active !== false : !!b.active;
    const status = b.status === undefined ? String(cur.status ?? 'live') : (['draft', 'live', 'archived'].includes(b.status) ? String(b.status) : 'live');
    // Do archivu nesmí odejít uvítací kupon, ať se nerozdává z archivu.
    const [c] = await sql`UPDATE client_coupons SET active = ${active}, status = ${status}, welcome = ${status === 'archived' ? false : cur.welcome === true} WHERE id = ${id} RETURNING *`;
    const zmeny = popisZmen(cur, { active, status });
    if (zmeny.length) audit(teamId, ctx.meId, 'client.coupon', 'client_coupon', id, zmeny.join('; '));
    return NextResponse.json({ ok: true, coupon: shapeCoupon(c, castka) });
  }
  const f = hodnotyKuponu(b);
  const bad = kontrolaKuponu(f) ?? await overNabidku(teamId, f);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const [c] = await sql`
    UPDATE client_coupons SET
      title = ${f.title}, description = ${f.description}, cost_points = ${f.cost_points}, active = ${f.active}, status = ${f.status},
      benefit_kind = ${f.benefit_kind}, percent_off = ${f.percent_off}, amount_off = ${f.amount_off},
      xy_buy = ${f.xy_buy}, xy_free = ${f.xy_free}, min_order_value = ${f.min_order_value},
      target_tiers = ${JSON.stringify(f.target_tiers)}::jsonb, target_groups = ${JSON.stringify(f.target_groups)}::jsonb,
      per_customer = ${f.per_customer}, cooldown_days = ${f.cooldown_days},
      days_of_week = ${f.days_of_week ? JSON.stringify(f.days_of_week) : null}::jsonb,
      hour_from = ${f.hour_from}, hour_till = ${f.hour_till},
      adult_only = ${f.adult_only}, welcome = ${f.welcome},
      valid_since = ${f.valid_since}, valid_until = ${f.valid_until},
      total_limit = ${f.total_limit}, daily_limit = ${f.daily_limit}, menu_item_id = ${f.menu_item_id},
      excluded_items = ${JSON.stringify(f.excluded_items)}::jsonb, excluded_categories = ${JSON.stringify(f.excluded_categories)}::jsonb
    WHERE id = ${id} AND team_id = ${teamId} RETURNING *`;
  const zmeny = popisZmen(cur, f);
  audit(teamId, ctx.meId, 'client.coupon', 'client_coupon', id, zmeny.length ? zmeny.join('; ') : `uloženo beze změn: ${f.title}`);
  return NextResponse.json({ ok: true, coupon: shapeCoupon(c, castka) });
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const teamId = ctx.teamId;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatný kupon' }, { status: 400 });
  // Neuplatněné kódy hostů by smazáním přestaly jít uplatnit — takový kupon
  // se jen vypíná nebo archivuje. Smazat jde, až když nikdo nic nedrží.
  const [open] = await sql`
    SELECT COUNT(*)::int AS n FROM client_coupon_claims
    WHERE coupon_id = ${id} AND team_id = ${teamId} AND redeemed_at IS NULL`;
  if (Number(open?.n) > 0) {
    return NextResponse.json({ error: `Hosté drží ${czCount(Number(open.n), { one: 'neuplatněný kód', few: 'neuplatněné kódy', many: 'neuplatněných kódů' })} — kupon archivuj nebo vypni, nemaž.` }, { status: 409 });
  }
  const [cur] = await sql`SELECT title FROM client_coupons WHERE id = ${id} AND team_id = ${teamId} AND kind = 'offer'`;
  await sql`DELETE FROM client_coupons WHERE id = ${id} AND team_id = ${teamId} AND kind = 'offer'`;
  if (cur) audit(teamId, ctx.meId, 'client.coupon', 'client_coupon', id, `smazán: ${cur.title}`);
  return NextResponse.json({ ok: true });
}
