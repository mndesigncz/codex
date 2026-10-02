// Skupiny členů („štamgasti", „firemní večery") — cílení kuponů a zpráv, volitelně
// i vlastní sleva. Ruční skupina se plní přidáváním hostů; dynamická skupina má
// pravidla (nepřišli N dní, útrata od X, narozeniny tento měsíc) a její členové se
// z nich přepočítávají (lib/clenoveDb.ts), takže kupony a slevy skupin fungují stejně.
// GET vrací skupiny s počty členů, POST zakládá, PATCH mění název, popis, barvu,
// slevu, pravidla nebo členy (add/remove), DELETE maže skupinu i členství v ní.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { zajistiClenove, obnovDynamickeSkupiny, prepocitejClenyDynamicke } from '@/lib/clenoveDb';
import { chybaPravidel, normalizujPravidla, normalizujBarvu } from '@/lib/clenoveFiltr';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const NAZEV_MAX = 60;
const POPIS_MAX = 200;

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
    await zajistiClenove();
    // Dynamické skupiny se přepočítají, jakmile jsou zastaralé (krátká prodleva, atomicky).
    try { await obnovDynamickeSkupiny(u.team_id); } catch (e) { console.error('[skupiny] přepočet', e); }
    const groups = await sql`
      SELECT g.id, g.name, g.description, g.color, g.rules, COALESCE(g.discount_pct, 0) AS discount_pct,
             (SELECT COUNT(*)::int FROM client_group_members gm WHERE gm.group_id = g.id AND gm.team_id = g.team_id) AS members
      FROM client_groups g WHERE g.team_id = ${u.team_id} ORDER BY g.name, g.id` as any[];
    // Detail jedné skupiny: kdo v ní je (pro správu členů v Zákaznících).
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
    return NextResponse.json({
      groups: groups.map(g => ({ ...g, rules: normalizujPravidla(g.rules), dynamic: !!normalizujPravidla(g.rules) })),
      memberIds, customerGroupIds,
    });
  } catch (e) {
    console.error('[skupiny] načtení selhalo', e);
    return NextResponse.json({ error: 'Skupiny se nepodařilo načíst.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.skupiny');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  await zajistiSchemaClenu();
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim().slice(0, NAZEV_MAX);
  if (!name) return NextResponse.json({ error: 'Zadej název skupiny.' }, { status: 400 });
  const chyba = chybaPravidel(b.rules);
  if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });
  await zajistiClenove();
  const [dup] = await sql`SELECT id FROM client_groups WHERE team_id = ${u.team_id} AND LOWER(name) = ${name.toLowerCase()}`;
  if (dup) return NextResponse.json({ error: 'Skupina s tímhle názvem už existuje.' }, { status: 409 });
  const popis = String(b.description ?? '').trim().slice(0, POPIS_MAX) || null;
  const barva = normalizujBarvu(b.color);
  const pravidla = normalizujPravidla(b.rules);
  const sleva = slevaZTela(b.discount_pct) ?? 0;
  const [g] = await sql`
    INSERT INTO client_groups (team_id, name, description, color, rules, discount_pct)
    VALUES (${u.team_id}, ${name}, ${popis}, ${barva}, ${pravidla ? JSON.stringify(pravidla) : null}::jsonb, ${sleva})
    RETURNING id, name, description, color, discount_pct`;
  let members = 0;
  if (pravidla) members = await prepocitejClenyDynamicke(u.team_id, Number(g.id), pravidla);
  await sql`UPDATE client_groups SET rules_refreshed_at = NOW() WHERE id = ${g.id} AND team_id = ${u.team_id} AND rules IS NOT NULL`;
  await audit(u.team_id, u.id, 'client.group', 'client', Number(g.id), `založena skupina ${name}${pravidla ? ' (dynamická)' : ''}`);
  return NextResponse.json({ ok: true, group: { ...g, rules: pravidla, dynamic: !!pravidla, members } });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.skupiny');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  await zajistiSchemaClenu();
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  await zajistiClenove();
  const [g] = await sql`SELECT id, name, rules FROM client_groups WHERE id = ${Number.isFinite(id) ? id : 0} AND team_id = ${u.team_id}` as any[];
  if (!g) return NextResponse.json({ error: 'Skupina nenalezena' }, { status: 404 });
  const zmeny: string[] = [];

  // Pravidla: objekt = dynamická skupina, null = ruční (současní členové zůstanou).
  const maPravidla = Object.prototype.hasOwnProperty.call(b, 'rules');
  if (maPravidla) {
    const chyba = chybaPravidel(b.rules);
    if (chyba) return NextResponse.json({ error: chyba }, { status: 400 });
  }
  const dynamickaTed = !!normalizujPravidla(g.rules);
  const budeDynamicka = maPravidla ? !!normalizujPravidla(b.rules) : dynamickaTed;
  const ids = (raw: any) => Array.isArray(raw) ? raw.map((x: any) => Math.round(Number(x))).filter((n: number) => n > 0).slice(0, 500) : [];
  const add = ids(b.add);
  const remove = ids(b.remove);
  if (budeDynamicka && (add.length || remove.length)) {
    return NextResponse.json({ error: 'V dynamické skupině se členové řídí pravidly. Změň pravidla, nebo ji převeď na ruční.' }, { status: 400 });
  }

  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, NAZEV_MAX);
    if (!name) return NextResponse.json({ error: 'Zadej název skupiny.' }, { status: 400 });
    const [dup] = await sql`SELECT id FROM client_groups WHERE team_id = ${u.team_id} AND LOWER(name) = ${name.toLowerCase()} AND id <> ${id}`;
    if (dup) return NextResponse.json({ error: 'Skupina s tímhle názvem už existuje.' }, { status: 409 });
    if (name !== g.name) {
      await sql`UPDATE client_groups SET name = ${name} WHERE id = ${id} AND team_id = ${u.team_id}`;
      zmeny.push(`přejmenována z „${g.name}“ na „${name}“`);
    }
  }
  if (b.description !== undefined) {
    const popis = String(b.description ?? '').trim().slice(0, POPIS_MAX) || null;
    await sql`UPDATE client_groups SET description = ${popis} WHERE id = ${id} AND team_id = ${u.team_id}`;
    zmeny.push('změněn popis');
  }
  if (b.color !== undefined) {
    await sql`UPDATE client_groups SET color = ${normalizujBarvu(b.color)} WHERE id = ${id} AND team_id = ${u.team_id}`;
    zmeny.push('změněna barva');
  }
  // Vlastní procentní sleva skupiny (0–100); člen ve víc skupinách bere nejvyšší, ne součet.
  const sleva = slevaZTela(b.discount_pct);
  if (sleva != null) {
    await sql`UPDATE client_groups SET discount_pct = ${sleva} WHERE id = ${id} AND team_id = ${u.team_id}`;
    zmeny.push(`sleva ${sleva} %`);
  }
  if (maPravidla) {
    const pravidla = normalizujPravidla(b.rules);
    await sql`UPDATE client_groups SET rules = ${pravidla ? JSON.stringify(pravidla) : null}::jsonb, rules_refreshed_at = ${pravidla ? new Date().toISOString() : null} WHERE id = ${id} AND team_id = ${u.team_id}`;
    if (pravidla) await prepocitejClenyDynamicke(u.team_id, id, pravidla);
    zmeny.push(pravidla ? 'změněna pravidla' : 'převedena na ruční');
  }
  // Členy smí měnit jen na vlastní členy podniku — cizí id se tiše zahodí.
  let pridano = 0;
  if (add.length) {
    const r = await sql`
      INSERT INTO client_group_members (group_id, customer_id, team_id)
      SELECT ${id}, m.customer_id, ${u.team_id} FROM client_memberships m
      WHERE m.team_id = ${u.team_id} AND m.customer_id = ANY(${add})
      ON CONFLICT (group_id, customer_id) DO NOTHING
      RETURNING customer_id` as any[];
    pridano = r.length;
  }
  let odebrano = 0;
  if (remove.length) {
    const r = await sql`DELETE FROM client_group_members WHERE group_id = ${id} AND team_id = ${u.team_id} AND customer_id = ANY(${remove}) RETURNING customer_id` as any[];
    odebrano = r.length;
  }
  // Přidání jednoho hosta (štítek v seznamu) se do protokolu nepíše; hromadná změna ano.
  if (pridano > 1 || odebrano > 1) zmeny.push(`členové: +${pridano} / −${odebrano}`);
  if (zmeny.length) await audit(u.team_id, u.id, 'client.group', 'client', id, `skupina ${g.name}: ${zmeny.join(', ')}`);
  return NextResponse.json({ ok: true, pridano, odebrano });
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.skupiny');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná skupina' }, { status: 400 });
  const [g] = await sql`SELECT name FROM client_groups WHERE id = ${id} AND team_id = ${u.team_id}` as any[];
  if (!g) return NextResponse.json({ error: 'Skupina nenalezena' }, { status: 404 });
  await sql`DELETE FROM client_group_members WHERE group_id = ${id} AND team_id = ${u.team_id}`;
  await sql`DELETE FROM client_groups WHERE id = ${id} AND team_id = ${u.team_id}`;
  await audit(u.team_id, u.id, 'client.group', 'client', id, `smazána skupina ${String(g.name)}`);
  return NextResponse.json({ ok: true });
}
