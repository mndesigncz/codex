import { NextResponse } from 'next/server';
import { zneplatniStav } from '@/lib/auth';
import { jeClenem } from '@/lib/tenant';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved, roleClena, vlastniRole, zneplatniOpravneni, type Kontext } from '@/lib/opravneniDb';
import { systemovaRole, smiPriraditRoli, smiSpravovatClena, typNaUcet, type TypRole } from '@/lib/opravneni';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Kdo je zrovna přepnutý jinam, je pořád člen — a musí jít upravit i
// odebrat. Členství NEBO zrcadlo řeší jedno místo v lib/tenant (kolo 62).
const jeClen = (userId: number, teamId: number) => jeClenem(userId, teamId);

// Kolo 67: místo „vedení smí všechno" se každé pole hlídá svým
// oprávněním a pravidly proti eskalaci (lib/opravneni.ts): nikdo nesáhne
// na člena, který má víc práv než on, a nikdo nepřidělí roli širší, než
// je jeho vlastní. Když chybí oprávnění k jedinému poli, neuloží se nic —
// půlka změny by vypadala jako úspěch.
async function cilClena(c: Kontext, targetId: number) {
  const r = await roleClena(targetId, c.teamId, { cerstve: true });
  return {
    jeVlastnik: !!r?.jeVlastnik, jeTo: targetId === c.meId,
    soucasna: r ? [...r.opravneni] : [], soucasnaKlic: r?.klic ?? null,
  };
}

export async function PATCH(request: Request) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const b = await request.json().catch(() => ({}));
  const { userId, jobTitle, hourlyRate } = b ?? {};
  if (!userId) return NextResponse.json({ error: 'Chybí userId' }, { status: 400 });
  const targetId = parseInt(String(userId));
  if (!(await jeClen(targetId, c.teamId))) return NextResponse.json({ error: 'Člen týmu nenalezen' }, { status: 404 });
  const V = { jeVlastnik: c.role.jeVlastnik, opravneni: c.role.opravneni };
  const cil = await cilClena(c, targetId);
  const ma = (k: string) => c.role.opravneni.has(k);

  // Nová role: systémová (klíč), vlastní (id), nebo starý tvar role=employer|employee.
  let nova: { klic: string | null; roleId: number | null; typ: TypRole; opravneni: string[]; nazev: string } | null = null;
  const chceRoli = b?.roleId !== undefined || b?.roleKlic !== undefined || b?.role !== undefined;
  if (chceRoli) {
    if (!ma('tym.role_prirazovat')) return NextResponse.json({ error: 'Na přidělování rolí nemáš oprávnění.' }, { status: 403 });
    if (b?.roleId != null) {
      const r = (await vlastniRole(c.teamId)).find(x => x.id === Number(b.roleId));
      if (!r) return NextResponse.json({ error: 'Role nenalezena.' }, { status: 404 });
      nova = { klic: null, roleId: r.id, typ: r.typ, opravneni: r.opravneni, nazev: r.nazev };
    } else {
      const klic = b?.roleKlic ?? (b?.role === 'employer' ? 'vedeni' : b?.role === 'employee' ? 'barista' : null);
      const r = systemovaRole(klic);
      if (!r) return NextResponse.json({ error: 'Neplatná role.' }, { status: 400 });
      nova = { klic: r.klic, roleId: null, typ: r.typ, opravneni: r.opravneni, nazev: r.nazev };
    }
    const v = smiPriraditRoli(V, cil, { opravneni: nova.opravneni, klic: nova.klic });
    if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 403 });
  }
  if (jobTitle !== undefined) {
    if (!ma('tym.upravit')) return NextResponse.json({ error: 'Na úpravu členů nemáš oprávnění.' }, { status: 403 });
    const v = smiSpravovatClena(V, cil);
    if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 403 });
  }
  if (hourlyRate !== undefined) {
    if (!ma('finance.sazby_upravit')) return NextResponse.json({ error: 'Na úpravu sazeb nemáš oprávnění.' }, { status: 403 });
    // Sazbu vlastníka nastaví jen on sám; vlastní sazbu si nikdo jiný nezvedá.
    if (cil.jeVlastnik ? !c.role.jeVlastnik : cil.jeTo && !c.role.jeVlastnik) {
      return NextResponse.json({ error: cil.jeTo ? 'Vlastní sazbu si nastavit nemůžeš.' : 'Sazbu vlastníka nastavuje jen on.' }, { status: 403 });
    }
    if (!cil.jeVlastnik && !cil.jeTo) {
      const v = smiSpravovatClena(V, cil);
      if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 403 });
    }
  }
  const team = { id: c.teamId };

  if (nova) {
    const ucet = typNaUcet(nova.typ);
    // Role se mění v členství, ne jen v zrcadle (kolo 55). Typ účtu jde
    // s rolí: určuje rozhraní a koho se týká rozvrh a žebříček.
    try {
      await sql`UPDATE team_members SET role = ${ucet}, role_id = ${nova.roleId}, role_klic = ${nova.klic} WHERE user_id = ${targetId} AND team_id = ${team.id}`;
    } catch {
      try { await sql`UPDATE team_members SET role = ${ucet} WHERE user_id = ${targetId} AND team_id = ${team.id}`; } catch { /* před migrací */ }
    }
    await sql`UPDATE users SET role = ${ucet} WHERE id = ${targetId} AND team_id = ${team.id}`;
    zneplatniStav(targetId);
    zneplatniOpravneni(targetId, team.id);
    audit(team.id, c.meId, 'role.assign', 'user', targetId, `${cil.soucasnaKlic ?? 'vlastní'} → ${nova.nazev}`);
  }

  // Sazba a pozice platí PRO TENHLE podnik: pravda je v team_members (kolo
  // 55), users.* je jen zrcadlo aktivního podniku. Dřív se psalo jen do
  // zrcadla s podmínkou team_id = tenhle podnik — člen přepnutý do jiného
  // podniku dostal „ok" a nic se nezměnilo. Když se nezapíše nikam, řekne
  // se to, místo úspěchu nad nezměněným řádkem.
  let zapsano = false;
  if (hourlyRate !== undefined) {
    const rate = Math.max(0, Math.round(Number(hourlyRate)) || 0);
    try {
      const r = await sql`UPDATE team_members SET hourly_rate = ${rate} WHERE user_id = ${targetId} AND team_id = ${team.id} RETURNING user_id`;
      zapsano = zapsano || r.length > 0;
    } catch { /* před migrací */ }
    try {
      const r = await sql`UPDATE users SET hourly_rate = ${rate} WHERE id = ${targetId} AND team_id = ${team.id} RETURNING id`;
      zapsano = zapsano || r.length > 0;
    } catch { /* column not migrated yet */ }
  }

  if (jobTitle !== undefined) {
    try {
      const r = await sql`UPDATE team_members SET job_title = ${jobTitle} WHERE user_id = ${targetId} AND team_id = ${team.id} RETURNING user_id`;
      zapsano = zapsano || r.length > 0;
    } catch { /* před migrací */ }
    const r = await sql`UPDATE users SET job_title = ${jobTitle} WHERE id = ${targetId} AND team_id = ${team.id} RETURNING id`;
    zapsano = zapsano || r.length > 0;
  }

  if ((hourlyRate !== undefined || jobTitle !== undefined) && !zapsano) {
    return NextResponse.json({ error: 'Změna se neuložila — člen je právě přepnutý do jiného podniku a členství tu nemá zapsané. Ať se sem jednou přihlásí, nebo ho pozvi znovu.' }, { status: 409 });
  }

  // Vrací se pozice pro TENHLE podnik, ne z aktivního zrcadla.
  let updated: any;
  try {
    [updated] = await sql`
      SELECT u.id, u.name, u.email, COALESCE(m.role, u.role) AS role, u.avatar, u.phone,
             COALESCE(m.job_title, u.job_title) AS job_title, u.shift_preference
      FROM users u LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${team.id}
      WHERE u.id = ${targetId}`;
  } catch {
    [updated] = await sql`
      SELECT id, name, email, role, avatar, phone, job_title, shift_preference
      FROM users WHERE id = ${targetId}`;
  }

  return NextResponse.json({ ok: true, member: updated });
}

export async function DELETE(request: Request) {
  const c = await pozaduj('tym.odebrat');
  if (jeOdpoved(c)) return c;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Chybí userId' }, { status: 400 });
  const team = { id: c.teamId };
  const targetId = parseInt(userId);
  if (!(await jeClen(targetId, team.id))) return NextResponse.json({ error: 'Člen týmu nenalezen' }, { status: 404 });
  const v = smiSpravovatClena({ jeVlastnik: c.role.jeVlastnik, opravneni: c.role.opravneni }, await cilClena(c, targetId));
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 403 });
  if (targetId === c.meId) return NextResponse.json({ error: 'Sám sebe odebrat nemůžeš — odejdi z podniku v nastavení účtu.' }, { status: 400 });
  // Odebrat znamená smazat ČLENSTVÍ. Dřív se jen vynulovalo users.team_id
  // a řádek v team_members zůstal — propuštěný zaměstnanec se pak přes
  // přepínač podniků (POST /api/teams/switch) vrátil zpátky, i do chatu.
  try { await sql`DELETE FROM team_members WHERE user_id = ${targetId} AND team_id = ${team.id}`; } catch { /* před migrací */ }
  // Zrcadlo se nuluje jen tehdy, když byl aktivní právě tenhle podnik —
  // jiný podnik, kde člověk dál pracuje, mu nebereme. Historie zůstává.
  await sql`UPDATE users SET team_id = NULL WHERE id = ${targetId} AND team_id = ${team.id}`;
  zneplatniStav(targetId);
  zneplatniOpravneni(targetId, team.id);
  audit(team.id, c.meId, 'team.remove', 'user', targetId, 'Odebrán z podniku');
  // Chat access rides on conversation_members, not on team_id — drop the rows
  // so an ex-member can't keep reading or writing in the team's conversations.
  try {
    await sql`
      DELETE FROM conversation_members
      WHERE user_id = ${targetId} AND conversation_id IN (
        SELECT id FROM conversations WHERE team_id = ${team.id})`;
  } catch { /* conversations may not be migrated yet */ }

  return NextResponse.json({ ok: true });
}
