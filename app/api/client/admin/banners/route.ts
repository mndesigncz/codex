// Promo bannery podniku: akce a oznámení nahoře na stránce pro hosty.
// Správa patří k Vzhledu (oprávnění klient.vzhled). Odkazy se ověřují na serveru
// (jen https nebo vnitřní cíl), obrázek je nahraný soubor podniku nebo https adresa.
//
// Co umí navíc oproti prvnímu kolu:
//  · cílení (všem / členům / nečlenům / úroveň / skupina), validované na serveru,
//  · koncept (vypnutý) a archiv (hostům se neukazuje nikdy, nepočítá se do limitu),
//  · duplikace (kopie je koncept, limit se hlídá ve stejném příkazu),
//  · odkaz na konkrétní kupon nebo razítkovou kartu (musí patřit podniku),
//  · přeřazení JEDNÍM příkazem (UPDATE ... FROM unnest) a jen s úplným seznamem id podniku,
//  · plán s dny a hodinami (opakování) a jazykové mutace nadpisu a textu,
//  · statistiku zobrazení a prokliků za 30 dní (součty z denních počítadel bez osobních údajů).
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { pragueToday } from '@/lib/pragueTime';
import { zajistiTabulkuBanneru, statistikyBanneru } from '@/lib/clientBanners';
import { kdyTed } from '@/lib/banneryPlan';
import { validujBanner, overPoradi, nadpisKopie, souhrnStatistik, MAX_BANNERU, type BannerHodnoty } from '@/lib/bannery';
import { TIER_LABELS } from '@/lib/kuponyPopisky';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const OPR = 'klient.vzhled';
const DNI_STATISTIKY = 30;

/** Akce, na kterou banner odkazuje, musí patřit tomuto podniku. */
async function akceJeMoje(teamId: number, id: string | null): Promise<boolean> {
  if (!id) return false;
  try {
    const [e] = await sql`SELECT id FROM events WHERE id = ${Number(id)} AND team_id = ${teamId}`;
    return !!e;
  } catch { return false; }
}

/** Obrázek z galerie podniku (/api/client/img/<id>) musí být soubor tohoto týmu. */
async function obrazekJeMuj(teamId: number, url: string | null): Promise<boolean> {
  const m = String(url ?? '').match(/^\/api\/client\/img\/(\d+)$/);
  if (!m) return true;
  const [u] = await sql`SELECT id FROM uploads WHERE id = ${Number(m[1])} AND team_id = ${teamId}`;
  return !!u;
}

/** Cíl odkazu a cílení musí existovat a patřit podniku (cizí kupon, karta ani skupina se nepustí). */
async function over(teamId: number, h: BannerHodnoty): Promise<string | null> {
  if (h.link_kind === 'event' && !(await akceJeMoje(teamId, h.link_ref))) return 'Akce nenalezena.';
  if (h.link_kind === 'coupon' && h.link_ref) {
    const [c] = await sql`SELECT id FROM client_coupons WHERE id = ${Number(h.link_ref)} AND team_id = ${teamId} AND kind = 'offer'`;
    if (!c) return 'Kupon nenalezen.';
  }
  if (h.link_kind === 'campaign') {
    const [c] = await sql`SELECT id FROM client_stamp_campaigns WHERE id = ${Number(h.link_ref)} AND team_id = ${teamId}`;
    if (!c) return 'Razítková karta nenalezena.';
  }
  if (h.target_kind === 'group') {
    const [g] = await sql`SELECT id FROM client_groups WHERE id = ${Number(h.target_ref)} AND team_id = ${teamId}`;
    if (!g) return 'Skupina nenalezena.';
  }
  if (!(await obrazekJeMuj(teamId, h.image_url))) return 'Obrázek nenalezen.';
  return null;
}

async function volitelne<T>(dotaz: Promise<unknown>): Promise<T[]> {
  try { return (await dotaz) as T[]; } catch { return []; }
}

export async function GET() {
  const ctx = await pozaduj(OPR);
  if (jeOdpoved(ctx)) return ctx;
  await zajistiTabulkuBanneru();
  const banners = await sql`SELECT * FROM client_banners WHERE team_id = ${ctx.teamId} ORDER BY position, id`;
  // Cíle odkazů a cílení: nadcházející veřejné akce, kupony za body, razítkové karty a skupiny hostů.
  const [events, coupons, campaigns, groups, stat] = await Promise.all([
    volitelne<any>(sql`SELECT id, title, date FROM events WHERE team_id = ${ctx.teamId} AND public = TRUE AND status <> 'cancelled' ORDER BY date DESC LIMIT 40`),
    volitelne<any>(sql`SELECT id, title FROM client_coupons WHERE team_id = ${ctx.teamId} AND kind = 'offer' AND active = TRUE ORDER BY title LIMIT 100`),
    volitelne<any>(sql`SELECT id, name FROM client_stamp_campaigns WHERE team_id = ${ctx.teamId} AND active = TRUE ORDER BY position, id LIMIT 50`),
    volitelne<any>(sql`SELECT id, name FROM client_groups WHERE team_id = ${ctx.teamId} ORDER BY name LIMIT 100`),
    statistikyBanneru(ctx.teamId, DNI_STATISTIKY).catch(() => []),
  ]);
  const souhrn = souhrnStatistik(stat);
  const statistiky = Object.fromEntries([...souhrn.entries()].map(([id, v]) => [id, v]));
  return NextResponse.json({ banners, events, coupons, campaigns, groups, urovne: TIER_LABELS, statistiky, dniStatistiky: DNI_STATISTIKY, dnes: pragueToday(), kdy: kdyTed() });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj(OPR);
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const v = validujBanner(b);
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 400 });
  const h = v.hodnoty;
  const chyba = await over(ctx.teamId, h);
  if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });
  await zajistiTabulkuBanneru();
  // Limit se hlídá ve stejném příkazu jako vložení: dva souběžné požadavky nepřekročí MAX_BANNERU.
  // Archivované se do limitu nepočítají (archiv je přesně na staré bannery).
  const [row] = await sql`
    INSERT INTO client_banners (team_id, title, text, image_url, link_kind, link_ref, active, valid_since, valid_until, position, target_kind, target_ref, archived, days_of_week, hour_from, hour_till, i18n)
    SELECT ${ctx.teamId}, ${h.title}, ${h.text}, ${h.image_url}, ${h.link_kind}, ${h.link_ref}, ${h.active}, ${h.valid_since}, ${h.valid_until},
      (SELECT COALESCE(MAX(position), -1) + 1 FROM client_banners WHERE team_id = ${ctx.teamId}), ${h.target_kind}, ${h.target_ref}, ${h.archived},
      ${JSON.stringify(h.days_of_week)}::jsonb, ${h.hour_from}, ${h.hour_till}, ${JSON.stringify(h.i18n)}::jsonb
    WHERE ${h.archived}::boolean OR (SELECT COUNT(*) FROM client_banners WHERE team_id = ${ctx.teamId} AND archived = FALSE) < ${MAX_BANNERU}
    RETURNING *`;
  if (!row) return NextResponse.json({ error: `Bannerů může být nejvýš ${MAX_BANNERU}. Smaž nebo archivuj nepotřebné.` }, { status: 409 });
  audit(ctx.teamId, ctx.meId, 'client.banner', 'client_banner', row.id, `přidán: ${h.title}`);
  return NextResponse.json({ ok: true, banner: row });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj(OPR);
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  await zajistiTabulkuBanneru();

  // Nové pořadí: úplný seznam id podniku. Částečný, zdvojený nebo cizí seznam se odmítne (nic se nezmění).
  if (Array.isArray(b.order)) {
    const moje = (await sql`SELECT id FROM client_banners WHERE team_id = ${ctx.teamId}`) as any[];
    const o = overPoradi(b.order, moje.map(r => Number(r.id)));
    if (!o.ok) return NextResponse.json({ error: o.chyba }, { status: 400 });
    // Jeden příkaz místo smyčky UPDATE: pád uprostřed nikdy nenechá poloviční pořadí.
    await sql`
      UPDATE client_banners b SET position = o.ord - 1
      FROM unnest(${o.ids}::int[]) WITH ORDINALITY AS o(id, ord)
      WHERE b.id = o.id AND b.team_id = ${ctx.teamId}`;
    audit(ctx.teamId, ctx.meId, 'client.banner', 'client_banner', null, `přeřazeno: ${o.ids.length} bannerů`);
    return NextResponse.json({ ok: true });
  }

  const id = parseInt(String(b.id), 10);
  const [cur] = Number.isFinite(id) ? await sql`SELECT * FROM client_banners WHERE id = ${id} AND team_id = ${ctx.teamId}` : [];
  if (!cur) return NextResponse.json({ error: 'Banner nenalezen' }, { status: 404 });

  // Kopie: vypnutý banner (koncept) na konci seznamu; limit se hlídá ve stejném příkazu.
  if (b.action === 'duplicate') {
    const [row] = await sql`
      INSERT INTO client_banners (team_id, title, text, image_url, link_kind, link_ref, active, valid_since, valid_until, position, target_kind, target_ref, archived, days_of_week, hour_from, hour_till, i18n)
      SELECT s.team_id, ${nadpisKopie(cur.title)}, s.text, s.image_url, s.link_kind, s.link_ref, FALSE, s.valid_since, s.valid_until,
        (SELECT COALESCE(MAX(position), -1) + 1 FROM client_banners WHERE team_id = ${ctx.teamId}), s.target_kind, s.target_ref, FALSE,
        s.days_of_week, s.hour_from, s.hour_till, s.i18n
      FROM client_banners s WHERE s.id = ${id} AND s.team_id = ${ctx.teamId}
        AND (SELECT COUNT(*) FROM client_banners WHERE team_id = ${ctx.teamId} AND archived = FALSE) < ${MAX_BANNERU}
      RETURNING *`;
    if (!row) return NextResponse.json({ error: `Bannerů může být nejvýš ${MAX_BANNERU}. Smaž nebo archivuj nepotřebné.` }, { status: 409 });
    audit(ctx.teamId, ctx.meId, 'client.banner', 'client_banner', row.id, `duplikován: ${cur.title}`);
    return NextResponse.json({ ok: true, banner: row });
  }

  // Archiv a návrat z archivu: archivovaný banner je vypnutý a hostům se neukáže; po návratu je koncept.
  if (b.action === 'archive' || b.action === 'restore') {
    const arch = b.action === 'archive';
    // Návrat z archivu se počítá do limitu stejně jako nový banner.
    const [row] = arch
      ? await sql`UPDATE client_banners SET archived = TRUE, active = FALSE WHERE id = ${id} AND team_id = ${ctx.teamId} RETURNING *`
      : await sql`
          UPDATE client_banners SET archived = FALSE, active = FALSE
          WHERE id = ${id} AND team_id = ${ctx.teamId}
            AND (SELECT COUNT(*) FROM client_banners WHERE team_id = ${ctx.teamId} AND archived = FALSE) < ${MAX_BANNERU}
          RETURNING *`;
    if (!row) return NextResponse.json({ error: `Bannerů může být nejvýš ${MAX_BANNERU}. Smaž nebo archivuj nepotřebné.` }, { status: 409 });
    audit(ctx.teamId, ctx.meId, 'client.banner', 'client_banner', id, `${arch ? 'archivován' : 'vrácen z archivu'}: ${row.title}`);
    return NextResponse.json({ ok: true, banner: row });
  }

  // Jen přepnutí „aktivní“ (přepínač v seznamu). Archivovaný banner se nezapne; nejdřív ho vrať z archivu.
  if (Object.keys(b).every(k => k === 'id' || k === 'active')) {
    if (cur.archived === true) return NextResponse.json({ error: 'Archivovaný banner nejdřív vrať z archivu.' }, { status: 409 });
    const [row] = await sql`UPDATE client_banners SET active = ${b.active === true} WHERE id = ${id} AND team_id = ${ctx.teamId} AND archived = FALSE RETURNING *`;
    if (!row) return NextResponse.json({ error: 'Archivovaný banner nejdřív vrať z archivu.' }, { status: 409 });
    audit(ctx.teamId, ctx.meId, 'client.banner', 'client_banner', id, `${row.active ? 'zapnut' : 'vypnut'}: ${row.title}`);
    return NextResponse.json({ ok: true, banner: row });
  }

  // Úprava: chybějící pole zůstanou, jak byla. Archiv se tudy nemění (má vlastní akci).
  const v = validujBanner({ ...cur, ...b, archived: cur.archived === true });
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 400 });
  const h = v.hodnoty;
  const chyba = await over(ctx.teamId, h);
  if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });
  const [row] = await sql`
    UPDATE client_banners SET title = ${h.title}, text = ${h.text}, image_url = ${h.image_url}, link_kind = ${h.link_kind},
      link_ref = ${h.link_ref}, active = ${h.active}, valid_since = ${h.valid_since}, valid_until = ${h.valid_until},
      target_kind = ${h.target_kind}, target_ref = ${h.target_ref},
      days_of_week = ${JSON.stringify(h.days_of_week)}::jsonb, hour_from = ${h.hour_from}, hour_till = ${h.hour_till}, i18n = ${JSON.stringify(h.i18n)}::jsonb
    WHERE id = ${id} AND team_id = ${ctx.teamId} RETURNING *`;
  audit(ctx.teamId, ctx.meId, 'client.banner', 'client_banner', id, `upraven: ${h.title}`);
  return NextResponse.json({ ok: true, banner: row });
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj(OPR);
  if (jeOdpoved(ctx)) return ctx;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '', 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  await zajistiTabulkuBanneru();
  const [row] = await sql`DELETE FROM client_banners WHERE id = ${id} AND team_id = ${ctx.teamId} RETURNING title`;
  if (!row) return NextResponse.json({ error: 'Banner nenalezen' }, { status: 404 });
  await sql`DELETE FROM client_banner_stats WHERE banner_id = ${id} AND team_id = ${ctx.teamId}`;
  audit(ctx.teamId, ctx.meId, 'client.banner', 'client_banner', id, `smazán: ${row.title}`);
  return NextResponse.json({ ok: true });
}
