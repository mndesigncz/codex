// Rewards shop: the employer prices rewards in points, employees redeem them,
// approval deducts the points through the same ledger reviews use — so the
// standings stay a single source of truth.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function me() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id, name FROM users WHERE id = ${id}`;
  return u ?? null;
}

export async function GET() {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ catalog: [], redemptions: [] });
  try {
    const catalog = u.role === 'employer'
      ? await sql`SELECT * FROM rewards_catalog WHERE team_id = ${u.team_id} ORDER BY cost ASC`
      : await sql`SELECT * FROM rewards_catalog WHERE team_id = ${u.team_id} AND active = TRUE ORDER BY cost ASC`;
    const redemptions = u.role === 'employer'
      ? await sql`
          SELECT rr.*, us.name AS employee_name, us.avatar AS employee_avatar
          FROM reward_redemptions rr JOIN users us ON us.id = rr.employee_id
          WHERE rr.team_id = ${u.team_id}
          ORDER BY (rr.status = 'pending') DESC, rr.created_at DESC LIMIT 50`
      : await sql`
          SELECT * FROM reward_redemptions
          WHERE team_id = ${u.team_id} AND employee_id = ${u.id}
          ORDER BY created_at DESC LIMIT 20`;
    return NextResponse.json({ catalog, redemptions });
  } catch {
    return NextResponse.json({ catalog: [], redemptions: [], notMigrated: true });
  }
}

export async function POST(req: NextRequest) {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  // Employer manages the catalog.
  if (b.manage === true) {
    if (u.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
    const title = String(b.title ?? '').trim().slice(0, 120);
    const cost = Math.max(1, Math.round(Number(b.cost) || 0));
    if (!title) return NextResponse.json({ error: 'Název je povinný' }, { status: 400 });
    const [row] = await sql`
      INSERT INTO rewards_catalog (team_id, title, icon, cost)
      VALUES (${u.team_id}, ${title}, ${b.icon ? String(b.icon).slice(0, 8) : null}, ${cost})
      RETURNING *`;
    audit(u.team_id, u.id, 'reward.create', 'reward', row.id, `${title} (${cost} b.)`);
    return NextResponse.json({ reward: row });
  }

  // Employee redeems.
  if (u.role === 'kiosk') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const rewardId = parseInt(b.rewardId);
  if (!Number.isFinite(rewardId)) return NextResponse.json({ error: 'Chybí odměna' }, { status: 400 });
  const [reward] = await sql`
    SELECT * FROM rewards_catalog WHERE id = ${rewardId} AND team_id = ${u.team_id} AND active = TRUE`;
  if (!reward) return NextResponse.json({ error: 'Odměna nenalezena' }, { status: 404 });

  const [row] = await sql`
    INSERT INTO reward_redemptions (team_id, employee_id, reward_id, title, cost)
    VALUES (${u.team_id}, ${u.id}, ${rewardId}, ${reward.title}, ${reward.cost})
    RETURNING *`;
  try {
    const employers = await sql`SELECT id FROM users WHERE team_id = ${u.team_id} AND role = 'employer'`;
    await notifyUsers((employers as any[]).map(e => e.id), {
      title: '🎁 Žádost o odměnu',
      body: `${u.name ?? 'Zaměstnanec'} chce vyměnit ${reward.cost} bodů za „${reward.title}".`,
      type: 'info',
      link: '/employer/overview?view=rewards',
    });
  } catch { /* best-effort */ }
  return NextResponse.json({ redemption: row });
}

export async function PATCH(req: NextRequest) {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (u.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));

  // Catalog toggles/edits.
  if (b.manage === true) {
    const id = parseInt(b.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
    if (typeof b.active === 'boolean') {
      await sql`UPDATE rewards_catalog SET active = ${b.active} WHERE id = ${id} AND team_id = ${u.team_id}`;
    }
    return NextResponse.json({ ok: true });
  }

  const id = parseInt(b.id);
  const action = b.action === 'approve' ? 'approve' : b.action === 'decline' ? 'decline' : null;
  if (!Number.isFinite(id) || !action) return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });
  const [row] = await sql`
    SELECT * FROM reward_redemptions WHERE id = ${id} AND team_id = ${u.team_id} AND status = 'pending'`;
  if (!row) return NextResponse.json({ error: 'Žádost nenalezena nebo už je vyřízená' }, { status: 404 });

  const status = action === 'approve' ? 'approved' : 'declined';
  await sql`
    UPDATE reward_redemptions SET status = ${status}, decided_by = ${u.id}, decided_at = NOW()
    WHERE id = ${id}`;

  if (action === 'approve') {
    // Deduct through the standard points ledger — standings update themselves.
    const today = new Date().toISOString().slice(0, 10);
    try {
      await sql`
        INSERT INTO shift_review_items (team_id, employee_id, work_date, kind, ref_id, points, note, flagged, created_by)
        VALUES (${u.team_id}, ${row.employee_id}, ${today}, 'redemption', ${id},
                ${-Math.abs(Number(row.cost) || 0)}, ${'Odměna: ' + row.title}, FALSE, ${u.id})
        ON CONFLICT (employee_id, work_date, kind, ref_id) DO NOTHING`;
    } catch { /* ledger missing — approval still stands */ }
  }
  audit(u.team_id, u.id, `reward.${status}`, 'redemption', id, `${row.title} · ${row.cost} b.`);
  try {
    await notifyUser(row.employee_id, {
      title: action === 'approve' ? '🎁 Odměna schválena!' : 'Odměna zamítnuta',
      body: action === 'approve'
        ? `„${row.title}" je tvoje — ${row.cost} bodů odečteno.`
        : `„${row.title}" tentokrát neprošla, body zůstávají.`,
      type: 'info',
      link: '/employee/shifts?view=rewards',
    });
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const u = await me();
  if (!u?.team_id || u.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  await sql`DELETE FROM rewards_catalog WHERE id = ${id} AND team_id = ${u.team_id}`;
  return NextResponse.json({ ok: true });
}
