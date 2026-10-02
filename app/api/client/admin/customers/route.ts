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
import { nactiClenyTymu, obnovDynamickeSkupiny, kontextFiltru } from '@/lib/clenoveDb';
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
      name: c.name, email: c.email, level_label: c.level_label, points: c.points, credit: c.credit, stamps: c.stamps, visits: c.visits, spend: c.spend,
      joined: pragueDaySafe(c.joined_at), lastVisit: pragueDaySafe(c.last_visit_at), groups: c.skupiny.map(g => g.name).join(', '),
    })), kontakty);
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
    const { email, birthday, ...zbytek } = c;
    return { ...zbytek, ...(kontakty ? { email } : {}), reservations: rez.get(c.id) ?? 0, has_birthday_month: !!birthday && Number(birthday.slice(5, 7)) === k.mesic };
  });
  return NextResponse.json({
    customers, total: strana.total, hasMore: strana.hasMore, nextOffset: strana.nextOffset,
    // Celkem členů bez filtru: rozlišuje „nikdo takový" od „zatím žádní členové".
    all: vsichni.length,
  });
}
