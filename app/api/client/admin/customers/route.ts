// Členové podniku: kdo chodí, kolik má bodů a razítek, kdy byl naposledy.
// GET filtruje, řadí, stránkuje, vrací duplicity (?duplicity=1), id pro hromadný výběr (?format=ids)
// a export do CSV (?format=csv). PATCH mění poznámku a blokaci, DELETE odebere člena z podniku.
import { NextRequest, NextResponse } from 'next/server';
import { sql, ensureProfile } from '@/lib/client';
import { tierForMember, tierRulesFromProfile, tierThresholds } from '@/lib/clientSlots';
import { efektivniSleva } from '@/lib/slevy';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { zajistiSchemaClenu } from '@/lib/clenoveSchema';
import { audienceIds } from '@/lib/broadcasts';
import { smazClenaZPodniku } from '@/lib/clenoveDb';
import { dotazClenu, hraniceUrovne, csvClenu, najdiDuplicity, MAX_EXPORT } from '@/lib/clenoveSeznam';
import { pragueDaySafe } from '@/lib/pragueTime';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const denCesky = (v: unknown): string => {
  const d = pragueDaySafe(v);
  return d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : '';
};

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  await zajistiSchemaClenu();
  const params = new URL(req.url).searchParams;
  const d = dotazClenu(params);
  const q = d.q.toLowerCase();
  // Hledání patří do SQL: filtr v JS až po LIMIT znamenal, že člena za hranicí nešlo najít a „total" byl
  // zavádějícím způsobem uříznutý. Speciální znaky LIKE (% _ \) escapujeme, ať se text bere doslovně.
  const like = '%' + q.replace(/[\\%_]/g, ch => '\\' + ch) + '%';
  // E-mail a telefon hosta jsou kontakt — vidí je a hledá podle nich jen ten, kdo smí hostům psát.
  // Jinak by šlo kontakt uhodnout hledáním po písmenech.
  const kontakty = ctx.role.opravneni.has('zakaznici.kontakty');
  const format = String(params.get('format') ?? '');
  const format_ = format === 'csv' || format === 'ids' ? format : '';

  // Duplicity: dvojice a trojice členů, kteří vypadají jako jeden člověk (jen pro správce členů).
  if (params.get('duplicity') === '1') {
    if (!ctx.role.opravneni.has('zakaznici.sprava_clenu')) return NextResponse.json({ error: 'Na slučování členů nemáš oprávnění.' }, { status: 403 });
    const rows = await sql`
      SELECT m.customer_id AS id, us.name, us.email, us.phone, m.points, m.visits, m.joined_at, m.last_visit_at
      FROM client_memberships m JOIN users us ON us.id = m.customer_id
      WHERE m.team_id = ${u.team_id}
      LIMIT 20000` as any[];
    const skupiny = najdiDuplicity(rows.map(r => ({ id: Number(r.id), name: String(r.name), email: r.email, phone: r.phone })));
    const by = new Map(rows.map(r => [Number(r.id), r]));
    return NextResponse.json({
      skupiny: skupiny.slice(0, 100).map(s => ({
        duvod: s.duvod,
        clenove: s.ids.map(id => {
          const r = by.get(id)!;
          return { id, name: r.name, email: kontakty ? r.email : null, phone: kontakty ? r.phone : null, points: Number(r.points) || 0, visits: Number(r.visits) || 0, joined_at: r.joined_at, last_visit_at: r.last_visit_at };
        }),
      })),
      celkem: skupiny.length,
    });
  }

  // Filtr podle skupiny, segmentu nebo kombinace: množina id z jednoho místa (blokovaní ven jen u zpráv, tady zůstávají).
  let idsFiltr: number[] | null = null;
  if (d.skupina) idsFiltr = await audienceIds(u.team_id, `group:${d.skupina}`);
  if (d.segment) {
    const podleSegmentu = await audienceIds(u.team_id, d.segment);
    idsFiltr = idsFiltr ? idsFiltr.filter(id => podleSegmentu.includes(id)) : podleSegmentu;
  }
  const idsParam = idsFiltr ?? [];
  const maIds = idsFiltr !== null;

  // Úroveň podle režimu podniku: z prahů se spočítá rozsah návštěv nebo útraty.
  const profil = await ensureProfile(u.team_id);
  const pravidla = tierRulesFromProfile(profil);
  const th = tierThresholds(pravidla);
  const hr = d.uroven ? hraniceUrovne(d.uroven, th) : null;
  const filtrUrovne = !!d.uroven;
  const hrOd = hr?.od ?? 0;
  const hrDo = hr?.do ?? 2147483647;
  const poSpend = th.by === 'spend';
  // Úroveň, která v podniku není (platinová bez prahu), nemá nikoho.
  const prazdnaUroven = filtrUrovne && !hr;

  const stav = d.stav;
  const razeni = d.razeni;
  const offset = (d.strana - 1) * d.naStranu;
  const limit = format_ === 'csv' ? MAX_EXPORT : format_ === 'ids' ? MAX_EXPORT : d.naStranu;
  const rows = await sql`
    SELECT m.customer_id AS id, us.name, us.email, us.phone, m.points, m.stamps, m.visits, m.joined_at, m.last_visit_at,
           m.blocked, m.note,
           COALESCE((us.notif_prefs->>'novinky') = 'true', FALSE) AS novinky,
           COALESCE((to_jsonb(m)->>'spend')::int, 0) AS spend,
           (SELECT COUNT(*)::int FROM client_reservations r WHERE r.customer_id = m.customer_id AND r.team_id = m.team_id) AS reservations,
           (SELECT COUNT(*)::int FROM client_coupon_claims c WHERE c.customer_id = m.customer_id AND c.team_id = m.team_id AND c.redeemed_at IS NULL) AS open_coupons
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${u.team_id}
      AND (${q} = '' OR LOWER(us.name) LIKE ${like} ESCAPE '\\'
           OR (${kontakty} AND (LOWER(us.email) LIKE ${like} ESCAPE '\\' OR REPLACE(REPLACE(COALESCE(us.phone, ''), ' ', ''), '-', '') LIKE ${like.replace(/ /g, '')} ESCAPE '\\')))
      AND (${!maIds} OR m.customer_id = ANY(${idsParam}))
      AND (${!filtrUrovne} OR (NOT ${prazdnaUroven}
           AND (CASE WHEN ${poSpend} THEN COALESCE((to_jsonb(m)->>'spend')::int, 0) ELSE m.visits END) >= ${hrOd}
           AND (CASE WHEN ${poSpend} THEN COALESCE((to_jsonb(m)->>'spend')::int, 0) ELSE m.visits END) < ${hrDo}))
      AND (${stav} = '' OR (${stav} = 'blokovani' AND m.blocked = TRUE)
           OR (${stav} = 'souhlas' AND COALESCE((us.notif_prefs->>'novinky') = 'true', FALSE))
           OR (${stav} = 'bez_souhlasu' AND NOT COALESCE((us.notif_prefs->>'novinky') = 'true', FALSE))
           OR (${stav} = 'bez_navstevy' AND m.last_visit_at IS NULL))
    ORDER BY
      CASE WHEN ${razeni} = 'jmeno' THEN LOWER(us.name) END ASC,
      CASE WHEN ${razeni} = 'navstevy' THEN m.visits END DESC NULLS LAST,
      CASE WHEN ${razeni} = 'body' THEN m.points END DESC NULLS LAST,
      CASE WHEN ${razeni} = 'utrata' THEN COALESCE((to_jsonb(m)->>'spend')::int, 0) END DESC NULLS LAST,
      CASE WHEN ${razeni} = 'nejnovejsi' THEN m.joined_at END DESC NULLS LAST,
      CASE WHEN ${razeni} = 'nejstarsi' THEN m.joined_at END ASC NULLS LAST,
      m.last_visit_at DESC NULLS LAST, m.joined_at DESC, m.customer_id
    LIMIT ${limit} OFFSET ${format_ ? 0 : offset}` as any[];
  const [cnt] = await sql`
    SELECT COUNT(*)::int AS total
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${u.team_id}
      AND (${q} = '' OR LOWER(us.name) LIKE ${like} ESCAPE '\\'
           OR (${kontakty} AND (LOWER(us.email) LIKE ${like} ESCAPE '\\' OR REPLACE(REPLACE(COALESCE(us.phone, ''), ' ', ''), '-', '') LIKE ${like.replace(/ /g, '')} ESCAPE '\\')))
      AND (${!maIds} OR m.customer_id = ANY(${idsParam}))
      AND (${!filtrUrovne} OR (NOT ${prazdnaUroven}
           AND (CASE WHEN ${poSpend} THEN COALESCE((to_jsonb(m)->>'spend')::int, 0) ELSE m.visits END) >= ${hrOd}
           AND (CASE WHEN ${poSpend} THEN COALESCE((to_jsonb(m)->>'spend')::int, 0) ELSE m.visits END) < ${hrDo}))
      AND (${stav} = '' OR (${stav} = 'blokovani' AND m.blocked = TRUE)
           OR (${stav} = 'souhlas' AND COALESCE((us.notif_prefs->>'novinky') = 'true', FALSE))
           OR (${stav} = 'bez_souhlasu' AND NOT COALESCE((us.notif_prefs->>'novinky') = 'true', FALSE))
           OR (${stav} = 'bez_navstevy' AND m.last_visit_at IS NULL))` as any[];

  if (format_ === 'ids') return NextResponse.json({ ids: rows.map(r => Number(r.id)), total: cnt?.total ?? rows.length });

  // Úroveň podle režimu podniku a efektivní sleva (nejvyšší z úrovně a slev skupin).
  const ids = rows.map(r => Number(r.id));
  const skupinyBy = new Map<number, { name: string; discount: number }[]>();
  if (ids.length) {
    try {
      const sk = await sql`
        SELECT gm.customer_id, g.name, g.discount_pct FROM client_group_members gm
        JOIN client_groups g ON g.id = gm.group_id AND g.team_id = gm.team_id
        WHERE gm.team_id = ${u.team_id} AND g.discount_pct > 0 AND gm.customer_id = ANY(${ids})` as any[];
      for (const r of sk) {
        const c = Number(r.customer_id);
        if (!skupinyBy.has(c)) skupinyBy.set(c, []);
        skupinyBy.get(c)!.push({ name: String(r.name), discount: Number(r.discount_pct) || 0 });
      }
    } catch { /* před migrací */ }
  }
  const obohacene = rows.map(r => {
    const t = tierForMember({ visits: r.visits, spend: r.spend }, pravidla);
    const s = efektivniSleva({ uroven: t, skupiny: skupinyBy.get(Number(r.id)) });
    return { ...r, phone: r.phone ? String(r.phone) : null, level: t.id, level_label: t.label, discount: s.pct, discount_source: s.zdroj, discount_name: s.nazev };
  });

  if (format_ === 'csv') {
    const csv = csvClenu(obohacene.map(r => ({ ...r, id: Number(r.id), name: String(r.name), points: Number(r.points), stamps: Number(r.stamps), visits: Number(r.visits), spend: Number(r.spend) })), { kontakty, denCesky });
    audit(u.team_id, u.id, 'client.clen.export', 'client', null, `${obohacene.length} členů${kontakty ? ' s kontakty' : ''}`);
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="clenove-${pragueDaySafe(new Date())}.csv"` } });
  }
  const customers = kontakty ? obohacene : obohacene.map(({ email: _e, phone: _p, ...r }) => r);
  return NextResponse.json({ customers, total: cnt?.total ?? rows.length, strana: d.strana, naStranu: d.naStranu });
}

/** Poznámka a blokace člena. Obojí jen s oprávněním správy členů; blokace se zapisuje do historie změn. */
export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.sprava_clenu');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiSchemaClenu();
  const b = await req.json().catch(() => ({}));
  const id = Math.round(Number(b.id));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Neplatný člen.' }, { status: 400 });
  const [m] = await sql`SELECT m.blocked, m.note, us.name FROM client_memberships m JOIN users us ON us.id = m.customer_id WHERE m.team_id = ${ctx.teamId} AND m.customer_id = ${id}`;
  if (!m) return NextResponse.json({ error: 'Člen v podniku není.' }, { status: 404 });
  if (b.note !== undefined) {
    const note = String(b.note ?? '').trim().slice(0, 500);
    await sql`UPDATE client_memberships SET note = ${note || null} WHERE team_id = ${ctx.teamId} AND customer_id = ${id}`;
    audit(ctx.teamId, ctx.meId, 'client.clen.poznamka', 'client', id, `${m.name}: ${note ? 'poznámka upravena' : 'poznámka smazána'}`);
  }
  if (typeof b.blocked === 'boolean' && b.blocked !== (m.blocked === true)) {
    await sql`UPDATE client_memberships SET blocked = ${b.blocked}, blocked_at = ${b.blocked ? new Date().toISOString() : null} WHERE team_id = ${ctx.teamId} AND customer_id = ${id}`;
    audit(ctx.teamId, ctx.meId, 'client.clen.blokace', 'client', id, `${m.name}: ${b.blocked ? 'zablokován' : 'odblokován'}`);
  }
  const [novy] = await sql`SELECT blocked, note FROM client_memberships WHERE team_id = ${ctx.teamId} AND customer_id = ${id}`;
  return NextResponse.json({ ok: true, blocked: novy?.blocked === true, note: novy?.note ?? null });
}

/** Odebrání člena z podniku (body, razítka, kupony a deník zmizí; účet hosta zůstává). Jen s oprávněním správy členů. */
export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.sprava_clenu');
  if (jeOdpoved(ctx)) return ctx;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '', 10);
  const r = await smazClenaZPodniku(ctx.teamId, id, ctx.meId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, name: r.name, body: r.body });
}
