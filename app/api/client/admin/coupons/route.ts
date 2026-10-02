// Kupony: nabídky za body (kind = offer) v plné síle — výhoda (% / Kč / X+Y),
// cílení na úrovně a skupiny, limity (na hosta, celkem, denně), časová okna vč. noční,
// 18+, uvítací kupony, koncept a archiv. Odměny za razítka (kind = stamps) vznikají samy z plných karet.
// Kontrola polí je ve sdílené lib/kuponyPole (stejná jako v editoru). Poslat kupon hostům: ./send,
// přehled uplatnění: ./prehled, historie změn: ./historie. GET ?export=kupony|claimy stáhne CSV katalogu
// nebo vydaných kódů; PATCH s `ids` + `action` mění víc kuponů najednou.
import { NextRequest, NextResponse } from 'next/server';
import { sql, award } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { shapeCoupon } from '@/lib/coupons';
import { normalizujKupon, zkontrolujKupon } from '@/lib/kuponyPole';
import { popisZmen, vetaZmen, kuponyCsv, claimyCsv } from '@/lib/kuponyZmeny';
import { pragueToday } from '@/lib/pragueTime';
import { menaPodniku } from '@/lib/menaPodniku';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Položka nabídky patří týmu? (kupon vázaný na položku) */
async function polozkaTymu(teamId: number, itemId: number): Promise<boolean> {
  const [r] = await sql`
    SELECT mi.id FROM menu_items mi
    JOIN menu_sections ms ON ms.id = mi.section_id
    JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${teamId}
    WHERE mi.id = ${itemId}`;
  return !!r;
}

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const rows = await sql`
    SELECT c.*, (SELECT mi.name FROM menu_items mi WHERE mi.id = c.menu_item_id) AS menu_item_name,
           (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = c.id) AS claimed,
           (SELECT COUNT(*)::int FROM client_coupon_claims cl WHERE cl.coupon_id = c.id AND cl.redeemed_at IS NOT NULL) AS redeemed
    FROM client_coupons c WHERE c.team_id = ${u.team_id} AND c.kind = 'offer'
    ORDER BY (c.archived_at IS NOT NULL), c.active DESC, c.cost_points, c.id`;
  const vystup = new URL(req.url).searchParams.get('export');
  if (vystup === 'kupony' || vystup === 'claimy') {
    const dnes = pragueToday();
    const csv = vystup === 'kupony'
      ? kuponyCsv(rows as any[], dnes, (await menaPodniku(u.team_id)).money)
      : claimyCsv(await sql`
          SELECT c.title, c.valid_until, cl.code, cl.claimed_at, cl.redeemed_at, cl.order_value, cl.source,
                 cu.name AS customer_name, st.name AS staff_name
          FROM client_coupon_claims cl
          JOIN client_coupons c ON c.id = cl.coupon_id
          LEFT JOIN users cu ON cu.id = cl.customer_id
          LEFT JOIN users st ON st.id = cl.redeemed_by
          WHERE cl.team_id = ${u.team_id} AND c.kind = 'offer'
          ORDER BY cl.claimed_at DESC LIMIT 50000` as any[], dnes);
    return new NextResponse(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${vystup === 'kupony' ? 'kupony' : 'kody-kuponu'}-${dnes}.csv"`, 'Cache-Control': 'private, no-store' },
    });
  }
  let groups: any[] = [];
  try {
    groups = await sql`
      SELECT g.id, g.name, (SELECT COUNT(*)::int FROM client_group_members gm WHERE gm.group_id = g.id) AS members
      FROM client_groups g WHERE g.team_id = ${u.team_id} ORDER BY g.name, g.id` as any[];
  } catch { groups = []; }
  const groupName = new Map((groups as any[]).map((g: any) => [Number(g.id), String(g.name)]));
  // Částky v popiscích výhod jsou v měně podniku, ne natvrdo v korunách.
  const castka = (await menaPodniku(u.team_id)).money;
  const coupons = (rows as any[]).map(r => ({
    ...shapeCoupon(r, castka),
    claimed: Number(r.claimed) || 0, redeemed: Number(r.redeemed) || 0,
    targetGroupNames: (shapeCoupon(r).targetGroups).map(id => groupName.get(id) ?? `#${id}`),
  }));
  return NextResponse.json({ coupons, groups });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const f = normalizujKupon(b);
  const bad = zkontrolujKupon(f, b);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  if (f.menu_item_id && !(await polozkaTymu(u.team_id, f.menu_item_id))) return NextResponse.json({ error: 'Položka nabídky nenalezena.' }, { status: 400 });
  const [c] = await sql`
    INSERT INTO client_coupons (
      team_id, title, description, cost_points, active, draft, benefit_kind, percent_off, amount_off,
      xy_buy, xy_free, min_order_value, max_total, daily_limit, target_tiers, target_groups, per_customer, cooldown_days,
      days_of_week, hour_from, hour_till, adult_only, welcome, valid_since, valid_until,
      menu_item_id, excluded_items, excluded_sections)
    VALUES (
      ${u.team_id}, ${f.title}, ${f.description}, ${f.cost_points}, ${f.active}, ${f.draft}, ${f.benefit_kind}, ${f.percent_off}, ${f.amount_off},
      ${f.xy_buy}, ${f.xy_free}, ${f.min_order_value}, ${f.max_total}, ${f.daily_limit}, ${JSON.stringify(f.target_tiers)}::jsonb, ${JSON.stringify(f.target_groups)}::jsonb, ${f.per_customer}, ${f.cooldown_days},
      ${f.days_of_week ? JSON.stringify(f.days_of_week) : null}::jsonb, ${f.hour_from}, ${f.hour_till}, ${f.adult_only}, ${f.welcome}, ${f.valid_since}, ${f.valid_until},
      ${f.menu_item_id}, ${JSON.stringify(f.excluded_items)}::jsonb, ${JSON.stringify(f.excluded_sections)}::jsonb)
    RETURNING *`;
  await audit(u.team_id, u.id, 'client.kupon', 'client_coupon', Number(c.id), `založen${f.draft ? ' jako koncept' : ''}: ${f.title}`);
  return NextResponse.json({ ok: true, coupon: shapeCoupon(c, (await menaPodniku(u.team_id)).money) });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('kupony.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  if (Array.isArray(b.ids)) return hromadne(u, b);
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
  if (f.menu_item_id && !(await polozkaTymu(u.team_id, f.menu_item_id))) return NextResponse.json({ error: 'Položka nabídky nenalezena.' }, { status: 400 });
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
      valid_since = ${f.valid_since}, valid_until = ${f.valid_until},
      menu_item_id = ${f.menu_item_id}, excluded_items = ${JSON.stringify(f.excluded_items)}::jsonb, excluded_sections = ${JSON.stringify(f.excluded_sections)}::jsonb
    WHERE id = ${id} AND team_id = ${u.team_id} RETURNING *`;
  // Historie změn: co se přepsalo, před → po (zobrazuje ji menu kuponu → Historie změn).
  await audit(u.team_id, u.id, 'client.kupon', 'client_coupon', id, vetaZmen(`upraven ${f.title}`, popisZmen(cur, f)));
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

/**
 * Hromadná akce nad vybranými kupony: zapnout, pozastavit, archivovat, vrátit z archivu, smazat.
 * Smazání přeskočí kupony, které hosté drží nebo uplatnili (ty se archivují), ať se neztratí historie.
 */
async function hromadne(u: { id: number; team_id: number }, b: any) {
  const ids = Array.from(new Set((b.ids as unknown[]).map(x => parseInt(String(x), 10)).filter(n => Number.isFinite(n) && n > 0))).slice(0, 200) as number[];
  if (!ids.length) return NextResponse.json({ error: 'Vyber aspoň jeden kupon.' }, { status: 400 });
  const akce = String(b.action ?? '');
  if (!['zapnout', 'pozastavit', 'archivovat', 'obnovit', 'smazat'].includes(akce)) return NextResponse.json({ error: 'Neznámá hromadná akce.' }, { status: 400 });
  let hotovo = 0;
  if (akce === 'smazat') {
    const smaz = await sql`
      DELETE FROM client_coupons c
      WHERE c.team_id = ${u.team_id} AND c.kind = 'offer' AND c.id = ANY(${ids})
        AND NOT EXISTS (SELECT 1 FROM client_coupon_claims cl WHERE cl.coupon_id = c.id)
      RETURNING c.id`;
    hotovo = smaz.length;
  } else {
    const r = akce === 'zapnout' ? await sql`UPDATE client_coupons SET active = TRUE WHERE team_id = ${u.team_id} AND kind = 'offer' AND id = ANY(${ids}) RETURNING id`
      : akce === 'pozastavit' ? await sql`UPDATE client_coupons SET active = FALSE WHERE team_id = ${u.team_id} AND kind = 'offer' AND id = ANY(${ids}) RETURNING id`
      : akce === 'archivovat' ? await sql`UPDATE client_coupons SET archived_at = COALESCE(archived_at, NOW()), welcome = FALSE WHERE team_id = ${u.team_id} AND kind = 'offer' AND id = ANY(${ids}) RETURNING id`
      : await sql`UPDATE client_coupons SET archived_at = NULL WHERE team_id = ${u.team_id} AND kind = 'offer' AND id = ANY(${ids}) RETURNING id`;
    hotovo = r.length;
  }
  const preskoceno = ids.length - hotovo;
  await audit(u.team_id, u.id, 'client.kupon', 'client_coupon', null, `hromadně ${akce}: ${hotovo} kuponů${preskoceno ? `, přeskočeno ${preskoceno}` : ''}`);
  return NextResponse.json({ ok: true, hotovo, preskoceno });
}
