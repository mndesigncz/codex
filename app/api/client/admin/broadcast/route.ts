// Zpráva členům: novinka, akce, sezónní nabídka. Přijde jako oznámení
// v aplikaci a push na telefon. Umí počkat na naplánovaný čas (a do té doby jde
// upravit nebo zrušit), mířit na publikum (úrovně, skupiny, spáči), vzít hosta
// na konkrétní místo, nést existující kupon nebo promo kód a poslat se na zkoušku
// jen odesílateli. Denní limit se spotřebuje při odeslání, ne při zadání.
import { tierThresholds, tierRulesFromProfile } from '@/lib/clientSlots';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import {
  dispatchDueBroadcasts, segmentyPocty, audienceIds, dosahPublika, odeslanoDnes, odesliZpravu, nactiPrilohu, zkusebniZprava,
  skupinyKVyberu,
} from '@/lib/broadcasts';
import { jeKanal } from '@/lib/zpravyKanaly';
import { zajistiSchemaClenu } from '@/lib/clenoveSchema';
import { zkontrolujZpravu, oknoUcinku, jePlatnePublikum, ZPRAV_DENNE, type VstupZpravy } from '@/lib/zpravyPravidla';
import { hit } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
import { pragueToday } from '@/lib/pragueTime';
import { zajistiClenove } from '@/lib/clenoveDb';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

/** Skupina v publiku musí patřit podniku; kupon a promo kód smí připojit jen ten, kdo je spravuje. */
async function zkontrolujCile(teamId: number, data: VstupZpravy, smiPrilohy: boolean): Promise<NextResponse | null> {
  const m = /^group:(\d+)$/.exec(data.audience);
  if (m) {
    const [g] = await sql`SELECT id FROM client_groups WHERE id = ${parseInt(m[1], 10)} AND team_id = ${teamId}`;
    if (!g) return NextResponse.json({ error: 'Tahle skupina už neexistuje. Vyber jinou.' }, { status: 400 });
  }
  if (data.couponId || data.promoId) {
    if (!smiPrilohy) return NextResponse.json({ error: 'Připojit kupon nebo promo kód smí jen ten, kdo je spravuje.' }, { status: 403 });
    const n = await nactiPrilohu(teamId, data.couponId, data.promoId);
    if ('chyba' in n) return NextResponse.json({ error: n.chyba }, { status: 400 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zpravy');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const params = new URL(req.url).searchParams;
  // Rychlý dotaz pro výběr publika: kolik členů to je a kolik z nich novinky opravdu chce.
  const dosah = params.get('dosah');
  if (dosah) {
    if (!jePlatnePublikum(dosah)) return NextResponse.json({ error: 'Tohle publikum neznám.' }, { status: 400 });
    const kanalParam = params.get('kanal');
    const kanal = jeKanal(kanalParam) ? kanalParam : 'push';
    const ids = await audienceIds(u.team_id, dosah);
    // `souhlas` = kolik členů dostane oznámení; `dosah` rozepisuje zvolený kanál a důvody, proč někdo nic nedostane.
    const d = await dosahPublika(u.team_id, ids, kanal);
    return NextResponse.json({ pocet: ids.length, souhlas: d.push, dosah: d });
  }
  await zajistiClenove();
  await zajistiSchemaClenu();
  await dispatchDueBroadcasts();
  const history = await sql`
    SELECT b.*
    FROM client_broadcasts b
    WHERE b.team_id = ${u.team_id} AND (b.status IS NULL OR b.status <> 'cancelled')
    ORDER BY COALESCE(b.scheduled_at, b.sent_at) DESC LIMIT 50` as any[];
  // Ke každé odeslané zprávě i to, co po ní přišlo: kolik různých PŘÍJEMCŮ té zprávy se v sedmi
  // kalendářních dnech po dni odeslání objevilo u kasy (skutečná návštěva nebo objednávka,
  // ne bonus ani narozeniny), a kolik jich přišlo sedm dní předtím. Není to důkaz, že za
  // to může zpráva — je to jediné poctivé srovnání, které z našich dat jde udělat.
  const odeslane = history.filter(h => h.status !== 'scheduled');
  const okna = odeslane.map(h => ({ id: Number(h.id), okno: oknoUcinku(h.sent_at) })).filter(x => x.okno);
  const ucinek = new Map<number, { after: number; before: number }>();
  if (okna.length) {
    const rows = await sql`
      SELECT w.id,
        (SELECT COUNT(DISTINCT l.customer_id)::int FROM client_loyalty_ledger l
          WHERE l.team_id = ${u.team_id} AND l.kind IN ('visit', 'order')
            AND ((l.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague')::date BETWEEN w.po_od::date AND w.po_do::date
            AND COALESCE((SELECT CASE WHEN jsonb_array_length(b.prijemci) < 5000 THEN b.prijemci @> to_jsonb(l.customer_id) END FROM client_broadcasts b WHERE b.id = w.id), TRUE)) AS visits_after,
        (SELECT COUNT(DISTINCT l.customer_id)::int FROM client_loyalty_ledger l
          WHERE l.team_id = ${u.team_id} AND l.kind IN ('visit', 'order')
            AND ((l.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague')::date BETWEEN w.pred_od::date AND w.pred_do::date
            AND COALESCE((SELECT CASE WHEN jsonb_array_length(b.prijemci) < 5000 THEN b.prijemci @> to_jsonb(l.customer_id) END FROM client_broadcasts b WHERE b.id = w.id), TRUE)) AS visits_before
      FROM unnest(${okna.map(x => x.id)}::int[], ${okna.map(x => x.okno!.poOd)}::text[], ${okna.map(x => x.okno!.poDo)}::text[],
                  ${okna.map(x => x.okno!.predOd)}::text[], ${okna.map(x => x.okno!.predDo)}::text[]) AS w(id, po_od, po_do, pred_od, pred_do)` as any[];
    for (const r of rows) ucinek.set(Number(r.id), { after: Number(r.visits_after) || 0, before: Number(r.visits_before) || 0 });
  }
  const oknaPoId = new Map(okna.map(x => [x.id, x.okno!]));
  const vHistorii = history.map(h => {
    const e = ucinek.get(Number(h.id));
    return { ...h, visits_after: e?.after ?? 0, visits_before: e?.before ?? 0, still_running: !!oknaPoId.get(Number(h.id))?.probiha };
  });
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
  // Kupony a promo kódy k připojení: jen vybrat existující; jen pro toho, kdo je spravuje.
  const smiPrilohy = ctx.role.opravneni.has('kupony.spravovat');
  let kupony: any[] = [];
  let promoKody: any[] = [];
  if (smiPrilohy) {
    const dnes = pragueToday();
    kupony = await sql`
      SELECT id, title FROM client_coupons
      WHERE team_id = ${u.team_id} AND kind = 'offer' AND active = TRUE AND (valid_until IS NULL OR valid_until = '' OR valid_until >= ${dnes})
      ORDER BY title LIMIT 100` as any[];
    promoKody = await sql`
      SELECT id, code, title FROM client_promos
      WHERE team_id = ${u.team_id} AND active = TRUE AND (valid_until IS NULL OR valid_until = '' OR valid_until >= ${dnes})
        AND (max_uses IS NULL OR uses < max_uses)
      ORDER BY created_at DESC LIMIT 100` as any[];
  }
  const dnes = await odeslanoDnes(u.team_id);
  const [tym] = await sql`SELECT name FROM teams WHERE id = ${u.team_id}` as any[];
  return NextResponse.json({
    history: vHistorii,
    members: Number(c?.members) || 0,
    segments, quiet: segments.quiet ?? 0,
    silver: Number(c?.silver) || 0, gold: Number(c?.gold) || 0,
    platinum: platinumAt > 0 ? Number(c?.platinum) || 0 : null,
    groups,
    limit: { odeslano: dnes, max: ZPRAV_DENNE },
    prilohy: smiPrilohy ? { kupony, promoKody } : null,
    slug: p?.slug ?? null, nazevPodniku: tym?.name ?? null,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zpravy');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const k = zkontrolujZpravu(b);
  if ('chyba' in k) return NextResponse.json({ error: k.chyba }, { status: 400 });
  const data = k.data;
  const smiPrilohy = ctx.role.opravneni.has('kupony.spravovat');
  const chyba = await zkontrolujCile(u.team_id, data, smiPrilohy);
  if (chyba) return chyba;
  await zajistiClenove();
  await zajistiSchemaClenu();

  // Zkouška jen sobě: nic se nezapisuje do historie a nespotřebuje se denní slot.
  if (b.action === 'test') {
    const gate = await hit(`client-broadcast-test:${u.team_id}:${u.id}`, 20, 3600);
    if (!gate.ok) return NextResponse.json({ error: 'Zkoušek je dnes dost. Zkus to za chvíli.' }, { status: 429 });
    const r = await zkusebniZprava(u.id, u.team_id, data);
    if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: 400 });
    await audit(u.team_id, u.id, 'client.broadcast.test', 'client', null, `zkouška: ${data.title}`);
    return NextResponse.json({ ok: true, test: true, ...r.v });
  }

  // Naplánování: čas v budoucnu → zpráva jde do fronty a počká si. Denní limit se bere až při odeslání.
  if (data.scheduledAt) {
    const at = data.scheduledAt.toISOString();
    const [row] = await sql`
      INSERT INTO client_broadcasts (team_id, title, body, recipients, sent_by, audience, status, scheduled_at, sent_at, link_kind, coupon_id, promo_id, channels)
      VALUES (${u.team_id}, ${data.title}, ${data.body || null}, 0, ${u.id}, ${data.audience}, 'scheduled', ${at}, ${at}, ${data.linkKind}, ${data.couponId}, ${data.promoId}, ${data.channels})
      RETURNING *`;
    await audit(u.team_id, u.id, 'client.broadcast', 'client', null, `naplánováno: ${data.title} (${data.audience})`);
    return NextResponse.json({ ok: true, broadcast: row, scheduled: true });
  }
  const r = await odesliZpravu({ teamId: u.team_id, userId: u.id, data });
  if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: r.status });
  await audit(u.team_id, u.id, 'client.broadcast', 'client', null, `${data.title} · ${r.doruceno} členů (${data.audience})`);
  return NextResponse.json({ ok: true, broadcast: r.row, doruceno: r.doruceno, ztlumeno: r.ztlumeno });
}

/** Úprava naplánované zprávy (text, publikum, cíl, příloha, čas). Odeslanou zprávu změnit nejde. */
export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zpravy');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná zpráva' }, { status: 400 });
  const k = zkontrolujZpravu(b);
  if ('chyba' in k) return NextResponse.json({ error: k.chyba }, { status: 400 });
  const data = k.data;
  if (!data.scheduledAt) {
    return NextResponse.json({ error: 'Čas odeslání musí být v budoucnu. Chceš poslat hned? Zprávu zruš a pošli novou.' }, { status: 400 });
  }
  await zajistiSchemaClenu();
  const chyba = await zkontrolujCile(u.team_id, data, ctx.role.opravneni.has('kupony.spravovat'));
  if (chyba) return chyba;
  const at = data.scheduledAt.toISOString();
  // Atomicky jen dokud čeká ve frontě: když ji mezitím odeslal dispatcher, UPDATE nic nezmění.
  const [row] = await sql`
    UPDATE client_broadcasts
    SET title = ${data.title}, body = ${data.body || null}, audience = ${data.audience}, link_kind = ${data.linkKind},
        coupon_id = ${data.couponId}, promo_id = ${data.promoId}, channels = ${data.channels}, scheduled_at = ${at}, sent_at = ${at}
    WHERE id = ${id} AND team_id = ${u.team_id} AND status = 'scheduled'
    RETURNING *`;
  if (!row) return NextResponse.json({ error: 'Zpráva už odešla, byla zrušena, nebo neexistuje. Změnit ji nejde.' }, { status: 409 });
  await audit(u.team_id, u.id, 'client.broadcast.upraveno', 'client', id, `upraveno: ${data.title} (${data.audience})`);
  return NextResponse.json({ ok: true, broadcast: row, scheduled: true });
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
  await audit(u.team_id, u.id, 'client.broadcast.zruseno', 'client', id, `zrušeno: ${String(done[0].title)}`);
  return NextResponse.json({ ok: true });
}
