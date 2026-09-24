// Rewards shop: the employer prices rewards in points, employees redeem them,
// approval deducts the points through the same ledger reviews use — so the
// standings stay a single source of truth.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';
import { audit } from '@/lib/audit';
import { pointsAvailableFor } from '@/lib/pointsBalance';
import { teamIsPro, PRO_ONLY_MSG } from '@/lib/planServer';
import { pragueToday } from '@/lib/pragueTime';
import { ciselnikPodniku, tymyCiselniku } from '@/lib/tenant';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Volající z brány oprávnění. Každý člen vidí aktivní katalog a své žádosti
// a smí žádat o odměnu; správa katalogu je odmeny.katalog, vyřizování žádostí
// odmeny.schvalovat. `kiosk` je typ účtu — sdílený tablet body nemá.
async function me() {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  let name = '';
  try { const [u] = await sql`SELECT name FROM users WHERE id = ${c.meId}`; name = String(u?.name ?? ''); } catch { /* jméno je jen do upozornění */ }
  return { id: c.meId, team_id: c.teamId, name, kiosk: c.role.typ === 'kiosk', opr: c.role.opravneni };
}

export async function GET() {
  const u = await me();
  if (jeOdpoved(u)) return u;
  const teamId = u.team_id;
  const spravujeKatalog = u.opr.has('odmeny.katalog');
  const schvaluje = u.opr.has('odmeny.schvalovat');
  try {
    // Sdílené číselníky (kolo 60): katalog může spravovat jiný podnik
    // organizace. Které podniky čteme, rozhoduje jediné místo (lib/tenant.ts);
    // tady se pole jen dosadí do predikátu. Vlastní odměny první, ať se
    // zaměstnanci i vedení nejdřív ukáže to, co si podnik nastavil sám.
    // Zdroj vidí jen své řádky, ale vedení má vědět, že úprava se propíše do
    // celé organizace — proto chip „sdíleno"; jméno zdroje pro „Spravuje: …"
    // vidí každý člen organizace i v seznamu podniků. Zaměstnanec katalog
    // jen čte, takže oba údaje dostane jen vedení.
    const { tymy, jsemZdroj, spravuje } = await ciselnikPodniku(teamId, 'odmeny');
    const rows = spravujeKatalog
      ? await sql`
          SELECT id, team_id, title, icon, cost, active, created_at FROM rewards_catalog
          WHERE team_id = ANY(${tymy})
          ORDER BY (team_id = ${teamId}) DESC, cost ASC, id ASC`
      : await sql`
          SELECT id, team_id, title, icon, cost, active, created_at FROM rewards_catalog
          WHERE team_id = ANY(${tymy}) AND active = TRUE
          ORDER BY (team_id = ${teamId}) DESC, cost ASC, id ASC`;
    const catalog = (rows as any[]).map(r => {
      const zOrganizace = Number(r.team_id) !== teamId;
      return spravujeKatalog
        ? { ...r, zOrganizace, sdileno: !zOrganizace && jsemZdroj, spravuje: zOrganizace ? spravuje : null }
        : { ...r, zOrganizace };
    });
    const redemptions = schvaluje
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
  if (jeOdpoved(u)) return u;
  const b = await req.json().catch(() => ({}));
  if (!(await teamIsPro(u.team_id))) {
    return NextResponse.json({ error: PRO_ONLY_MSG }, { status: 403 });
  }

  // Správa katalogu — odmeny.katalog.
  if (b.manage === true) {
    if (!u.opr.has('odmeny.katalog')) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
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
  if (u.kiosk) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const rewardId = parseInt(b.rewardId);
  if (!Number.isFinite(rewardId)) return NextResponse.json({ error: 'Chybí odměna' }, { status: 400 });
  // Vyměnit jde i odměnu ze zdrojového podniku organizace (kolo 60): cíl se
  // ověřuje proti viditelným podnikům, nikdy proti holému id. Žádost sama
  // zůstává řádkem TOHOTO podniku (team_id = u.team_id, title i cost
  // zkopírované), takže body se odečtou tam, kde člověk pracuje.
  const tymy = await tymyCiselniku(u.team_id, 'odmeny');
  const [reward] = await sql`
    SELECT id, title, cost FROM rewards_catalog
    WHERE id = ${rewardId} AND team_id = ANY(${tymy}) AND active = TRUE`;
  if (!reward) return NextResponse.json({ error: 'Odměna nenalezena' }, { status: 404 });

  // Points must exist before they're spent — pending requests count as spoken for.
  const available = await pointsAvailableFor(u.team_id, u.id);
  if (available < Number(reward.cost)) {
    return NextResponse.json(
      { error: `Nemáš dost bodů — k dispozici ${available}, odměna stojí ${reward.cost}.` },
      { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO reward_redemptions (team_id, employee_id, reward_id, title, cost)
    VALUES (${u.team_id}, ${u.id}, ${rewardId}, ${reward.title}, ${reward.cost})
    RETURNING *`;
  try {
    // Kolo 62: podle členství, ne zrcadla. Kolo 67: žádost dostane ten,
    // kdo ji smí vyřídit (odmeny.schvalovat).
    const employers = await clenoveSOpravnenim(u.team_id, 'odmeny.schvalovat');
    await notifyUsers(employers, {
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
  if (jeOdpoved(u)) return u;
  const b = await req.json().catch(() => ({}));
  const zakazano = () => NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  // Catalog toggles/edits — odmeny.katalog.
  if (b.manage === true) {
    if (!u.opr.has('odmeny.katalog')) return zakazano();
    const id = parseInt(b.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
    if (typeof b.active === 'boolean') {
      await sql`UPDATE rewards_catalog SET active = ${b.active} WHERE id = ${id} AND team_id = ${u.team_id}`;
    }
    return NextResponse.json({ ok: true });
  }

  // Vyřízení žádosti — odmeny.schvalovat.
  if (!u.opr.has('odmeny.schvalovat')) return zakazano();
  const id = parseInt(b.id);
  const action = b.action === 'approve' ? 'approve' : b.action === 'decline' ? 'decline' : null;
  if (!Number.isFinite(id) || !action) return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });
  const [row] = await sql`
    SELECT * FROM reward_redemptions WHERE id = ${id} AND team_id = ${u.team_id} AND status = 'pending'`;
  if (!row) return NextResponse.json({ error: 'Žádost nenalezena nebo už je vyřízená' }, { status: 404 });

  // Balance may have moved since the request was filed — approving must not
  // drive the ledger negative. (Available already excludes this pending row's
  // cost, so add it back before comparing.)
  if (action === 'approve') {
    const available = await pointsAvailableFor(u.team_id, row.employee_id) + (Number(row.cost) || 0);
    if (available < Number(row.cost)) {
      return NextResponse.json(
        { error: `Zaměstnanec už nemá dost bodů (${available} k dispozici, odměna stojí ${row.cost}).` },
        { status: 400 });
    }
  }

  const status = action === 'approve' ? 'approved' : 'declined';
  // Atomicky přes status='pending': dva souběžné požadavky (dvojklik) tak
  // nevyřídí tutéž žádost dvakrát a nepošlou dvojí oznámení/audit. Body jsou
  // navíc chráněné idempotentním ledgerem níž (ON CONFLICT DO NOTHING).
  const done = await sql`
    UPDATE reward_redemptions SET status = ${status}, decided_by = ${u.id}, decided_at = NOW()
    WHERE id = ${id} AND status = 'pending' RETURNING id`;
  if (!done.length) return NextResponse.json({ error: 'Žádost už je vyřízená' }, { status: 409 });

  if (action === 'approve') {
    // Deduct through the standard points ledger — standings update themselves.
    const today = pragueToday();
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
  const c = await pozaduj('odmeny.katalog');
  if (jeOdpoved(c)) return c;
  const u = { team_id: c.teamId };
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  await sql`DELETE FROM rewards_catalog WHERE id = ${id} AND team_id = ${u.team_id}`;
  return NextResponse.json({ ok: true });
}
