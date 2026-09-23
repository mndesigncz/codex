import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, zneplatniStav } from '@/lib/auth';
import { jeClenem } from '@/lib/tenant';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function currentEmployer() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'employer') return null;
  return { id: parseInt((session.user as any).id) };
}

// Resolve the employer's team — ANY employer of the team may manage members
// (multi-employer teams); the original owner stays protected below.
async function ownedTeam(employerId: number) {
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${employerId}`;
  if (!u?.team_id) return null;
  const [team] = await sql`SELECT id, owner_id FROM teams WHERE id = ${u.team_id}`;
  return team ?? null;
}

// Kdo je zrovna přepnutý jinam, je pořád člen — a musí jít upravit i
// odebrat. Členství NEBO zrcadlo řeší jedno místo v lib/tenant (kolo 62).
const jeClen = (userId: number, teamId: number) => jeClenem(userId, teamId);

export async function PATCH(request: Request) {
  const me = await currentEmployer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const { userId, role, jobTitle, hourlyRate } = await request.json();
  if (!userId) return NextResponse.json({ error: 'Chybí userId' }, { status: 400 });

  const team = await ownedTeam(me.id);
  if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

  const targetId = parseInt(String(userId));
  const onlyRate = role === undefined && jobTitle === undefined && hourlyRate !== undefined;
  // The owner's role/job stays protected, but their hourly rate may be set.
  if (targetId === team.owner_id && !onlyRate) {
    return NextResponse.json({ error: 'Vlastníka týmu nelze upravit.' }, { status: 400 });
  }

  if (!(await jeClen(targetId, team.id))) return NextResponse.json({ error: 'Člen týmu nenalezen' }, { status: 404 });

  if (role !== undefined) {
    if (role !== 'employer' && role !== 'employee') {
      return NextResponse.json({ error: 'Neplatná role.' }, { status: 400 });
    }
    // Role se mění v členství, ne jen v zrcadle. Dřív se přepsal jen
    // users.role — a degradovaný manažer si přepnutím podniku sem a zpět
    // obnovil roli vedení z team_members, kde zůstala stará.
    try { await sql`UPDATE team_members SET role = ${role} WHERE user_id = ${targetId} AND team_id = ${team.id}`; } catch { /* před migrací */ }
    await sql`UPDATE users SET role = ${role} WHERE id = ${targetId} AND team_id = ${team.id}`;
    zneplatniStav(targetId);
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
  const me = await currentEmployer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Chybí userId' }, { status: 400 });

  const team = await ownedTeam(me.id);
  if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

  const targetId = parseInt(userId);
  if (targetId === team.owner_id) {
    return NextResponse.json({ error: 'Vlastníka týmu nelze odebrat.' }, { status: 400 });
  }

  if (!(await jeClen(targetId, team.id))) return NextResponse.json({ error: 'Člen týmu nenalezen' }, { status: 404 });

  // Odebrat znamená smazat ČLENSTVÍ. Dřív se jen vynulovalo users.team_id
  // a řádek v team_members zůstal — propuštěný zaměstnanec se pak přes
  // přepínač podniků (POST /api/teams/switch) vrátil zpátky, i do chatu.
  try { await sql`DELETE FROM team_members WHERE user_id = ${targetId} AND team_id = ${team.id}`; } catch { /* před migrací */ }
  // Zrcadlo se nuluje jen tehdy, když byl aktivní právě tenhle podnik —
  // jiný podnik, kde člověk dál pracuje, mu nebereme. Historie zůstává.
  await sql`UPDATE users SET team_id = NULL WHERE id = ${targetId} AND team_id = ${team.id}`;
  zneplatniStav(targetId);
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
