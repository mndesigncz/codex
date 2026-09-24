// Ruční skupiny členů („štamgasti", „firemní večery") — cílení kuponů a
// zpráv. GET vrací skupiny s počty, POST zakládá, PATCH přejmenuje nebo
// mění členy (add/remove), DELETE maže skupinu i členství v ní.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  try {
    const groups = await sql`
      SELECT g.id, g.name, (SELECT COUNT(*)::int FROM client_group_members gm WHERE gm.group_id = g.id) AS members
      FROM client_groups g WHERE g.team_id = ${u.team_id} ORDER BY g.name, g.id` as any[];
    // Detail jedné skupiny: kdo v ní je (pro správu členů v Zákaznících).
    const params = new URL(req.url).searchParams;
    const withId = parseInt(params.get('id') ?? '');
    let memberIds: number[] = [];
    if (Number.isFinite(withId)) {
      const rows = await sql`SELECT customer_id FROM client_group_members WHERE group_id = ${withId} AND team_id = ${u.team_id}` as any[];
      memberIds = rows.map(r => Number(r.customer_id));
    }
    // Obráceně: ve kterých skupinách je tenhle host (chips v Zákaznících).
    const forCustomer = parseInt(params.get('customerId') ?? '');
    let customerGroupIds: number[] = [];
    if (Number.isFinite(forCustomer)) {
      const rows = await sql`SELECT group_id FROM client_group_members WHERE customer_id = ${forCustomer} AND team_id = ${u.team_id}` as any[];
      customerGroupIds = rows.map(r => Number(r.group_id));
    }
    return NextResponse.json({ groups, memberIds, customerGroupIds });
  } catch {
    return NextResponse.json({ groups: [], memberIds: [], notMigrated: true });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.skupiny');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: 'Zadej název skupiny.' }, { status: 400 });
  const [dup] = await sql`SELECT id FROM client_groups WHERE team_id = ${u.team_id} AND LOWER(name) = ${name.toLowerCase()}`;
  if (dup) return NextResponse.json({ error: 'Skupina s tímhle názvem už existuje.' }, { status: 409 });
  const [g] = await sql`INSERT INTO client_groups (team_id, name) VALUES (${u.team_id}, ${name}) RETURNING id, name`;
  return NextResponse.json({ ok: true, group: g });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.skupiny');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  const [g] = await sql`SELECT id FROM client_groups WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!g) return NextResponse.json({ error: 'Skupina nenalezena' }, { status: 404 });
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 60);
    if (!name) return NextResponse.json({ error: 'Zadej název skupiny.' }, { status: 400 });
    await sql`UPDATE client_groups SET name = ${name} WHERE id = ${id}`;
  }
  // Členy smí měnit jen na vlastní členy podniku — cizí id se tiše zahodí.
  const ids = (raw: any) => Array.isArray(raw) ? raw.map((x: any) => Math.round(Number(x))).filter((n: number) => n > 0).slice(0, 500) : [];
  const add = ids(b.add);
  if (add.length) {
    await sql`
      INSERT INTO client_group_members (group_id, customer_id, team_id)
      SELECT ${id}, m.customer_id, ${u.team_id} FROM client_memberships m
      WHERE m.team_id = ${u.team_id} AND m.customer_id = ANY(${add})
      ON CONFLICT (group_id, customer_id) DO NOTHING`;
  }
  const remove = ids(b.remove);
  if (remove.length) {
    await sql`DELETE FROM client_group_members WHERE group_id = ${id} AND team_id = ${u.team_id} AND customer_id = ANY(${remove})`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.skupiny');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná skupina' }, { status: 400 });
  await sql`DELETE FROM client_group_members WHERE group_id = ${id} AND team_id = ${u.team_id}`;
  await sql`DELETE FROM client_groups WHERE id = ${id} AND team_id = ${u.team_id}`;
  return NextResponse.json({ ok: true });
}
