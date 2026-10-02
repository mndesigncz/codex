// Skupiny členů („štamgasti", „firemní večery") — cílení kuponů a zpráv, volitelně se slevou.
// Skupina má název, popis, barvu a archiv; může být ruční (členy přidává člověk), nebo dynamická
// (členy počítá pravidlo z chování hostů).
// GET vrací skupiny s počty; s ?id=…&clenove=1 členy jedné skupiny, s &format=csv jejich export.
// POST zakládá, PATCH mění údaje, pravidlo, archiv a členy (add/remove), DELETE maže skupinu i členství v ní.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { zajistiUrovne } from '@/lib/urovneDb';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { zajistiSchemaClenu } from '@/lib/clenoveSchema';
import { overMetaSkupiny, overPravidloSkupiny, popisPravidlaSkupiny } from '@/lib/skupinyPravidla';
import { skupinyKVyberu, idsPodlePravidla } from '@/lib/broadcasts';
import { csvClenu } from '@/lib/clenoveSeznam';
import { pragueDaySafe } from '@/lib/pragueTime';
import { MAX_HROMADNE } from '@/lib/clenoveDb';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Sleva skupiny z těla požadavku: celé 0–100, nebo null, když ji požadavek neposílá. */
function slevaZTela(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

const denCesky = (v: unknown): string => {
  const d = pragueDaySafe(v);
  return d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : '';
};
const NA_STRANU = 100;

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  try {
    await zajistiSchemaClenu();
    const params = new URL(req.url).searchParams;
    const base = await skupinyKVyberu(u.team_id);
    const meta = await sql`
      SELECT g.id, COALESCE((to_jsonb(g)->>'discount_pct')::int, 0) AS discount_pct, g.description, g.color, g.created_at
      FROM client_groups g WHERE g.team_id = ${u.team_id}` as any[];
    const metaBy = new Map(meta.map(m => [Number(m.id), m]));
    const groups = base.map(g => {
      const m = metaBy.get(g.id);
      return {
        id: g.id, name: g.name, members: g.members, rule: g.rule, archived: g.archived,
        description: m?.description ?? null, color: m?.color ?? null, discount_pct: Number(m?.discount_pct) || 0,
        rule_popis: popisPravidlaSkupiny(g.rule),
      };
    });
    // Detail jedné skupiny: kdo v ní je (správa členů, export).
    const withId = parseInt(params.get('id') ?? '');
    let memberIds: number[] = [];
    let clenove: any[] | null = null;
    let total = 0;
    if (Number.isFinite(withId)) {
      const [g] = await sql`SELECT rule FROM client_groups WHERE id = ${withId} AND team_id = ${u.team_id}`;
      if (g) {
        memberIds = g.rule
          ? await idsPodlePravidla(u.team_id, String(g.rule))
          : ((await sql`SELECT customer_id FROM client_group_members WHERE group_id = ${withId} AND team_id = ${u.team_id}`) as any[]).map(r => Number(r.customer_id));
        total = memberIds.length;
        if (params.get('clenove') === '1' || params.get('format') === 'csv') {
          const kontakty = ctx.role.opravneni.has('zakaznici.kontakty');
          const csv = params.get('format') === 'csv';
          const strana = Math.max(1, parseInt(params.get('strana') ?? '1', 10) || 1);
          const q = String(params.get('q') ?? '').trim().toLowerCase();
          const like = '%' + q.replace(/[\\%_]/g, ch => '\\' + ch) + '%';
          const rows = await sql`
            SELECT m.customer_id AS id, us.name, us.email, us.phone, m.points, m.stamps, m.visits, m.joined_at, m.last_visit_at, m.blocked, m.note,
                   COALESCE((to_jsonb(m)->>'spend')::int, 0) AS spend
            FROM client_memberships m JOIN users us ON us.id = m.customer_id
            WHERE m.team_id = ${u.team_id} AND m.customer_id = ANY(${memberIds})
              AND (${q} = '' OR LOWER(us.name) LIKE ${like} ESCAPE '\\' OR (${kontakty} AND LOWER(us.email) LIKE ${like} ESCAPE '\\'))
            ORDER BY LOWER(us.name), m.customer_id
            LIMIT ${csv ? 5000 : NA_STRANU} OFFSET ${csv ? 0 : (strana - 1) * NA_STRANU}` as any[];
          if (csv) {
            const text = csvClenu(rows.map(r => ({ id: Number(r.id), name: String(r.name), email: r.email, phone: r.phone, points: Number(r.points), stamps: Number(r.stamps), visits: Number(r.visits), spend: Number(r.spend), joined_at: r.joined_at, last_visit_at: r.last_visit_at, blocked: r.blocked === true, note: r.note })), { kontakty, denCesky });
            const nazev = String(groups.find(x => x.id === withId)?.name ?? 'skupina').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '') || 'skupina';
            audit(u.team_id, u.id, 'client.clen.export', 'client', withId, `skupina ${nazev}: ${rows.length} členů`);
            return new NextResponse(text, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="skupina-${nazev}.csv"` } });
          }
          clenove = rows.map(r => ({ id: Number(r.id), name: r.name, email: kontakty ? r.email : undefined, phone: kontakty ? r.phone : undefined, points: Number(r.points), visits: Number(r.visits), last_visit_at: r.last_visit_at, blocked: r.blocked === true }));
        }
      }
    }
    // Obráceně: ve kterých skupinách je tenhle host (chips v Zákaznících).
    const forCustomer = parseInt(params.get('customerId') ?? '');
    let customerGroupIds: number[] = [];
    if (Number.isFinite(forCustomer)) {
      const rows = await sql`SELECT group_id FROM client_group_members WHERE customer_id = ${forCustomer} AND team_id = ${u.team_id}` as any[];
      customerGroupIds = rows.map(r => Number(r.group_id));
    }
    return NextResponse.json({ groups, memberIds, customerGroupIds, clenove, total });
  } catch {
    return NextResponse.json({ groups: [], memberIds: [], notMigrated: true });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.skupiny');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  await zajistiSchemaClenu();
  const b = await req.json().catch(() => ({}));
  const m = overMetaSkupiny(b);
  if (!m.ok) return NextResponse.json({ error: m.error }, { status: 400 });
  const pravidlo = overPravidloSkupiny(b.rule);
  if (!pravidlo.ok) return NextResponse.json({ error: pravidlo.error }, { status: 400 });
  if (pravidlo.rule && (slevaZTela(b.discount_pct) ?? 0) > 0) return NextResponse.json({ error: 'Dynamická skupina nemůže mít slevu. Sleva patří jen ručním skupinám.' }, { status: 400 });
  const [dup] = await sql`SELECT id FROM client_groups WHERE team_id = ${u.team_id} AND LOWER(name) = ${m.meta.name.toLowerCase()}`;
  if (dup) return NextResponse.json({ error: 'Skupina s tímhle názvem už existuje.' }, { status: 409 });
  const [g] = await sql`
    INSERT INTO client_groups (team_id, name, description, color, rule)
    VALUES (${u.team_id}, ${m.meta.name}, ${m.meta.description}, ${m.meta.color}, ${pravidlo.rule}) RETURNING id, name`;
  const sleva = slevaZTela(b.discount_pct);
  if (sleva != null && sleva > 0) {
    await zajistiUrovne();
    await sql`UPDATE client_groups SET discount_pct = ${sleva} WHERE id = ${g.id} AND team_id = ${u.team_id}`;
    g.discount_pct = sleva;
  }
  audit(u.team_id, u.id, 'client.skupina', 'client', Number(g.id), `založena: ${g.name}${pravidlo.rule ? ' (dynamická)' : ''}`);
  return NextResponse.json({ ok: true, group: g });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.skupiny');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  await zajistiSchemaClenu();
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  const [g] = await sql`SELECT id, name, description, color, rule, archived FROM client_groups WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!g) return NextResponse.json({ error: 'Skupina nenalezena' }, { status: 404 });
  // Dřív než se cokoli zapíše: dynamická skupina nesmí mít slevu. Slevu a úrovně počítá pokladna z řádků členů,
  // dynamická skupina je nemá, takže by sleva nikomu nedošla.
  const nove = b.rule !== undefined ? overPravidloSkupiny(b.rule) : null;
  if (nove && !nove.ok) return NextResponse.json({ error: nove.error }, { status: 400 });
  const ucinne = nove && nove.ok ? nove.rule : g.rule;
  if (ucinne) {
    const [cur] = await sql`SELECT COALESCE((to_jsonb(g)->>'discount_pct')::int, 0) AS d FROM client_groups g WHERE g.id = ${id} AND g.team_id = ${u.team_id}`;
    if ((slevaZTela(b.discount_pct) ?? (Number(cur?.d) || 0)) > 0) return NextResponse.json({ error: 'Dynamická skupina nemůže mít slevu. Nastav slevu 0, nebo skupinu udělej ruční.' }, { status: 400 });
  }
  const zmeny: string[] = [];
  if (b.name !== undefined || b.description !== undefined || b.color !== undefined) {
    const m = overMetaSkupiny(b, { name: g.name, description: g.description, color: g.color });
    if (!m.ok) return NextResponse.json({ error: m.error }, { status: 400 });
    if (m.meta.name.toLowerCase() !== String(g.name).toLowerCase()) {
      const [dup] = await sql`SELECT id FROM client_groups WHERE team_id = ${u.team_id} AND LOWER(name) = ${m.meta.name.toLowerCase()} AND id <> ${id}`;
      if (dup) return NextResponse.json({ error: 'Skupina s tímhle názvem už existuje.' }, { status: 409 });
    }
    await sql`UPDATE client_groups SET name = ${m.meta.name}, description = ${m.meta.description}, color = ${m.meta.color} WHERE id = ${id} AND team_id = ${u.team_id}`;
    if (m.meta.name !== g.name) zmeny.push(`přejmenována na ${m.meta.name}`);
    else zmeny.push('upraveny údaje');
  }
  if (b.rule !== undefined) {
    const pravidlo = overPravidloSkupiny(b.rule);
    if (!pravidlo.ok) return NextResponse.json({ error: pravidlo.error }, { status: 400 });
    await sql`UPDATE client_groups SET rule = ${pravidlo.rule} WHERE id = ${id} AND team_id = ${u.team_id}`;
    g.rule = pravidlo.rule;
    zmeny.push(pravidlo.rule ? 'nastaveno pravidlo' : 'pravidlo zrušeno');
  }
  if (typeof b.archived === 'boolean' && b.archived !== (g.archived === true)) {
    await sql`UPDATE client_groups SET archived = ${b.archived} WHERE id = ${id} AND team_id = ${u.team_id}`;
    zmeny.push(b.archived ? 'archivována' : 'vrácena z archivu');
  }
  // Vlastní procentní sleva skupiny (0–100); člen ve víc skupinách bere nejvyšší, ne součet.
  const sleva = slevaZTela(b.discount_pct);
  if (sleva != null) {
    await zajistiUrovne();
    await sql`UPDATE client_groups SET discount_pct = ${sleva} WHERE id = ${id} AND team_id = ${u.team_id}`;
    zmeny.push(`sleva ${sleva} %`);
  }
  // Členy smí měnit jen na vlastní členy podniku — cizí id se tiše zahodí. Dynamická skupina členy nemá.
  const ids = (raw: any) => Array.isArray(raw) ? raw.map((x: any) => Math.round(Number(x))).filter((n: number) => n > 0).slice(0, MAX_HROMADNE) : [];
  const add = ids(b.add);
  const remove = ids(b.remove);
  if ((add.length || remove.length) && g.rule) return NextResponse.json({ error: 'Členy dynamické skupiny počítá pravidlo, ručně se neupravují.' }, { status: 400 });
  if (add.length && g.archived === true && b.archived !== false) return NextResponse.json({ error: 'Skupina je v archivu. Nejdřív ji vrať z archivu.' }, { status: 400 });
  if (add.length) {
    await sql`
      INSERT INTO client_group_members (group_id, customer_id, team_id)
      SELECT ${id}, m.customer_id, ${u.team_id} FROM client_memberships m
      WHERE m.team_id = ${u.team_id} AND m.customer_id = ANY(${add})
      ON CONFLICT (group_id, customer_id) DO NOTHING`;
    zmeny.push(`+${add.length} členů`);
  }
  if (remove.length) {
    await sql`DELETE FROM client_group_members WHERE group_id = ${id} AND team_id = ${u.team_id} AND customer_id = ANY(${remove})`;
    zmeny.push(`−${remove.length} členů`);
  }
  // Přidání nebo odebrání jednoho člena z chipu u člena je běžná práce a deník by zahltilo; zapisují se změny skupiny samotné.
  if (zmeny.length && !(zmeny.length === 1 && /členů$/.test(zmeny[0]) && add.length + remove.length === 1)) {
    audit(u.team_id, u.id, 'client.skupina', 'client', id, `${g.name}: ${zmeny.join(', ')}`);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.skupiny');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná skupina' }, { status: 400 });
  const [g] = await sql`SELECT name FROM client_groups WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!g) return NextResponse.json({ error: 'Skupina nenalezena' }, { status: 404 });
  await sql`DELETE FROM client_group_members WHERE group_id = ${id} AND team_id = ${u.team_id}`;
  await sql`DELETE FROM client_groups WHERE id = ${id} AND team_id = ${u.team_id}`;
  audit(u.team_id, u.id, 'client.skupina', 'client', id, `smazána: ${g.name}`);
  return NextResponse.json({ ok: true });
}
