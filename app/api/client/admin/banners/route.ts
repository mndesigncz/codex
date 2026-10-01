// Promo bannery podniku: akce a oznámení nahoře na stránce pro hosty.
// Správa patří k Vzhledu (oprávnění klient.vzhled). Odkazy se ověřují na serveru
// (jen https nebo vnitřní cíl), obrázek je nahraný soubor podniku nebo https adresa.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { zajistiTabulkuBanneru } from '@/lib/clientBanners';
import { validujBanner, MAX_BANNERU, type BannerHodnoty } from '@/lib/bannery';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const OPR = 'klient.vzhled';

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

async function over(teamId: number, h: BannerHodnoty): Promise<string | null> {
  if (h.link_kind === 'event' && !(await akceJeMoje(teamId, h.link_ref))) return 'Akce nenalezena.';
  if (!(await obrazekJeMuj(teamId, h.image_url))) return 'Obrázek nenalezen.';
  return null;
}

export async function GET() {
  const ctx = await pozaduj(OPR);
  if (jeOdpoved(ctx)) return ctx;
  await zajistiTabulkuBanneru();
  const banners = await sql`SELECT * FROM client_banners WHERE team_id = ${ctx.teamId} ORDER BY position, id`;
  // Akce pro výběr cíle odkazu: nadcházející veřejné.
  let events: any[] = [];
  try { events = await sql`SELECT id, title, date FROM events WHERE team_id = ${ctx.teamId} AND public = TRUE AND status <> 'cancelled' ORDER BY date DESC LIMIT 40` as any[]; } catch { events = []; }
  return NextResponse.json({ banners, events });
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
  const [st] = await sql`SELECT COUNT(*)::int AS n, COALESCE(MAX(position), -1) AS maxpos FROM client_banners WHERE team_id = ${ctx.teamId}`;
  if (Number(st.n) >= MAX_BANNERU) return NextResponse.json({ error: `Bannerů může být nejvýš ${MAX_BANNERU}. Smaž nepotřebné.` }, { status: 409 });
  const [row] = await sql`
    INSERT INTO client_banners (team_id, title, text, image_url, link_kind, link_ref, active, valid_since, valid_until, position)
    VALUES (${ctx.teamId}, ${h.title}, ${h.text}, ${h.image_url}, ${h.link_kind}, ${h.link_ref}, ${h.active}, ${h.valid_since}, ${h.valid_until}, ${Number(st.maxpos) + 1})
    RETURNING *`;
  audit(ctx.teamId, ctx.meId, 'client.banner', 'client_banner', row.id, `přidán: ${h.title}`);
  return NextResponse.json({ ok: true, banner: row });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj(OPR);
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  await zajistiTabulkuBanneru();

  // Nové pořadí: pole id, každé musí patřit podniku.
  if (Array.isArray(b.order)) {
    const ids = b.order.map((x: any) => parseInt(String(x), 10)).filter((n: number) => Number.isFinite(n)).slice(0, MAX_BANNERU);
    for (let i = 0; i < ids.length; i++) {
      await sql`UPDATE client_banners SET position = ${i} WHERE id = ${ids[i]} AND team_id = ${ctx.teamId}`;
    }
    return NextResponse.json({ ok: true });
  }

  const id = parseInt(String(b.id), 10);
  const [cur] = Number.isFinite(id) ? await sql`SELECT * FROM client_banners WHERE id = ${id} AND team_id = ${ctx.teamId}` : [];
  if (!cur) return NextResponse.json({ error: 'Banner nenalezen' }, { status: 404 });

  // Jen přepnutí „aktivní“ (přepínač v seznamu).
  if (Object.keys(b).every(k => k === 'id' || k === 'active')) {
    const [row] = await sql`UPDATE client_banners SET active = ${b.active === true} WHERE id = ${id} AND team_id = ${ctx.teamId} RETURNING *`;
    audit(ctx.teamId, ctx.meId, 'client.banner', 'client_banner', id, `${row.active ? 'zapnut' : 'vypnut'}: ${row.title}`);
    return NextResponse.json({ ok: true, banner: row });
  }

  // Úprava: chybějící pole zůstanou, jak byla.
  const v = validujBanner({ ...cur, ...b });
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 400 });
  const h = v.hodnoty;
  const chyba = await over(ctx.teamId, h);
  if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });
  const [row] = await sql`
    UPDATE client_banners SET title = ${h.title}, text = ${h.text}, image_url = ${h.image_url}, link_kind = ${h.link_kind},
      link_ref = ${h.link_ref}, active = ${h.active}, valid_since = ${h.valid_since}, valid_until = ${h.valid_until}
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
  audit(ctx.teamId, ctx.meId, 'client.banner', 'client_banner', id, `smazán: ${row.title}`);
  return NextResponse.json({ ok: true });
}
