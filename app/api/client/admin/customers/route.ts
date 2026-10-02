// Členové podniku: kdo chodí, kolik má bodů a razítek, kdy byl naposledy.
// Filtry (úroveň, skupina, neaktivní N dní, narozeniny tento měsíc, otevřený kupon,
// útrata), řazení, stránkování („načíst další") a export do CSV. Rozhodování o tom,
// kdo filtr splňuje, je v lib/clenoveFiltr.ts a sdílí ho seznam, export, hromadné
// akce i dynamické skupiny.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { pragueDaySafe, pragueToday } from '@/lib/pragueTime';
import { nactiClenyTymu, obnovDynamickeSkupiny, kontextFiltru, smazClenaZPodniku } from '@/lib/clenoveDb';
import { zajistiSchemaClenu } from '@/lib/clenoveSchema';
import { najdiDuplicity } from '@/lib/clenoveSeznam';
import {
  normalizujFiltr, normalizujRazeni, splnujeFiltr, seradCleny, strankuj, sestavCsvClenu, type FiltrClenu,
} from '@/lib/clenoveFiltr';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Strop řádků jednoho exportu (soubor, který Excel ještě otevře). */
const EXPORT_MAX = 50_000;

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const params = new URL(req.url).searchParams;
  // E-mail hosta je kontakt — vidí ho a hledá podle něj jen ten, kdo smí
  // hostům psát. Jinak by šlo e-mail uhodnout hledáním po písmenech.
  const kontakty = ctx.role.opravneni.has('zakaznici.kontakty');
  // Kredit je peněžní zůstatek hosta — vidí ho jen ten, kdo smí do věrnosti (stejně jako deník).
  const vidiKredit = ctx.role.opravneni.has('vernost.zobrazit');
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
      skupiny: skupiny.slice(0, 100).map(sk => ({
        duvod: sk.duvod,
        clenove: sk.ids.map(id => {
          const r = by.get(id)!;
          return { id, name: r.name, email: kontakty ? r.email : null, phone: kontakty ? r.phone : null, points: Number(r.points) || 0, visits: Number(r.visits) || 0, joined_at: r.joined_at, last_visit_at: r.last_visit_at };
        }),
      })),
      celkem: skupiny.length,
    });
  }
  const filtr: FiltrClenu = normalizujFiltr(params);
  const razeni = normalizujRazeni(params.get('sort'));
  const csv = params.get('format') === 'csv';
  if (csv && !ctx.role.opravneni.has('zakaznici.export')) {
    return NextResponse.json({ error: 'Export členů nemáš povolený.' }, { status: 403 });
  }

  // Dynamická skupina musí být před výběrem aktuální (jinak by člen, který pravidla už splňuje, chyběl).
  if (filtr.group) { try { await obnovDynamickeSkupiny(u.team_id); } catch (e) { console.error('[clenove] přepočet skupin', e); } }

  const vsichni = await nactiClenyTymu(u.team_id);
  const poHostu = new Map<number, Set<number>>(vsichni.map(c => [c.id, new Set(c.skupiny.map(g => g.id))]));
  const k = { ...kontextFiltru(), hledatEmail: kontakty, skupinyHosta: (id: number) => poHostu.get(id) };
  const vybrani = seradCleny(vsichni.filter(c => splnujeFiltr(c, filtr, k)), razeni);

  if (csv) {
    const rows = vybrani.slice(0, EXPORT_MAX);
    const telo = sestavCsvClenu(rows.map(c => ({
      name: c.name, email: c.email, level_label: c.level_label, points: c.points, credit: vidiKredit ? c.credit : 0, stamps: c.stamps, visits: c.visits, spend: c.spend,
      joined: pragueDaySafe(c.joined_at), lastVisit: pragueDaySafe(c.last_visit_at), groups: c.skupiny.map(g => g.name).join(', '),
    })), kontakty, vidiKredit);
    await audit(u.team_id, u.id, 'client.export', 'client', null, `export členů: ${rows.length}${filtr.group ? ' (skupina)' : ''}${kontakty ? ' s e-maily' : ''}`);
    return new NextResponse(telo, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="clenove-${pragueToday()}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const strana = strankuj(vybrani, params.get('offset'), params.get('limit'));
  // Rezervace jen stránce, ne všem členům.
  const ids = strana.rows.map(c => c.id);
  const rez = new Map<number, number>();
  if (ids.length) {
    const r = await sql`
      SELECT customer_id, COUNT(*)::int AS n FROM client_reservations
      WHERE team_id = ${u.team_id} AND customer_id = ANY(${ids}) GROUP BY customer_id` as any[];
    for (const x of r) rez.set(Number(x.customer_id), Number(x.n));
  }
  const customers = strana.rows.map(c => {
    const { email, birthday, credit, ...zbytek } = c;
    return { ...zbytek, ...(kontakty ? { email } : {}), ...(vidiKredit ? { credit } : {}), reservations: rez.get(c.id) ?? 0, has_birthday_month: !!birthday && Number(birthday.slice(5, 7)) === k.mesic };
  });
  return NextResponse.json({
    customers, total: strana.total, hasMore: strana.hasMore, nextOffset: strana.nextOffset,
    // Celkem členů bez filtru: rozlišuje „nikdo takový" od „zatím žádní členové".
    all: vsichni.length,
  });
}

/** Blokace člena (nesbírá body ani razítka, nedostává zprávy). Jen s oprávněním správy členů; zapisuje se do historie změn. */
export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.sprava_clenu');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiSchemaClenu();
  const b = await req.json().catch(() => ({}));
  const id = Math.round(Number(b.id));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Neplatný člen.' }, { status: 400 });
  const [m] = await sql`SELECT m.blocked, us.name FROM client_memberships m JOIN users us ON us.id = m.customer_id WHERE m.team_id = ${ctx.teamId} AND m.customer_id = ${id}`;
  if (!m) return NextResponse.json({ error: 'Člen v podniku není.' }, { status: 404 });
  if (typeof b.blocked === 'boolean' && b.blocked !== (m.blocked === true)) {
    await sql`UPDATE client_memberships SET blocked = ${b.blocked}, blocked_at = ${b.blocked ? new Date().toISOString() : null} WHERE team_id = ${ctx.teamId} AND customer_id = ${id}`;
    await audit(ctx.teamId, ctx.meId, 'client.clen.blokace', 'client', id, `${m.name}: ${b.blocked ? 'zablokován' : 'odblokován'}`);
  }
  const [novy] = await sql`SELECT blocked FROM client_memberships WHERE team_id = ${ctx.teamId} AND customer_id = ${id}`;
  return NextResponse.json({ ok: true, blocked: novy?.blocked === true });
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
