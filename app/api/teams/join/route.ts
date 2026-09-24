import { NextResponse } from 'next/server';
import { pridejClenstvi, pocetClenu } from '@/lib/tenant';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';
import { planInfoOf, PLAN_ENFORCED, canAddMember } from '@/lib/plan';
import { notifyUsers } from '@/lib/push';
import { clenoveSOpravnenim } from '@/lib/opravneniDb';
import { vychoziRolePodniku, typUctu, zapisRoliClenstvi } from '../_role';
import { linkNewMember } from '@/lib/chat';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';

export const dynamic = 'force-dynamic';

// Employee joins an existing team using its join code.
export async function POST(request: Request) {
  try {
    const { name, email, password, joinCode } = await request.json();

    if (!name || !email || !password || !joinCode) {
      return NextResponse.json({ error: 'Všechna pole jsou povinná' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Heslo musí mít alespoň 8 znaků' }, { status: 400 });
    }

    // Kód týmu má šest znaků — asi miliarda kombinací. Bez limitu se dal
    // zkoušet strojově a kdo trefil, dostal se jako zaměstnanec do cizího
    // podniku: rozvrh, chat, sklad. Deset pokusů z jedné adresy za čtvrt
    // hodiny člověku s překlepem stačí, skriptu ne. Počítá se každý pokus,
    // ne jen neúspěšný, ať se limit nedá obejít střídáním s platným kódem.
    const gate = await hit(`join-ip:${klientIp(request.headers)}`, 10, 15 * 60, { failClosed: true });
    if (!gate.ok) {
      return NextResponse.json({ error: `Příliš mnoho pokusů. Zkus to znovu za ${Math.ceil(gate.retryAfter / 60)} min.` }, { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } });
    }

    const sql = neon(process.env.DATABASE_URL!);

    const [team] = await sql`SELECT id, owner_id, name FROM teams WHERE join_code = ${String(joinCode).trim().toUpperCase()}`;
    if (!team) {
      return NextResponse.json({ error: 'Neplatný kód týmu' }, { status: 404 });
    }

    if (await memberLimitHit(sql, team.id)) {
      return NextResponse.json({ error: 'Tým je na plánu Zdarma plný (3 členové). Vedení může přejít na Pro v Nastavení → Předplatné.' }, { status: 403 });
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Tento email je již zaregistrován' }, { status: 409 });
    }

    // Kolo 67: kdo přijde kódem, dostane výchozí roli podniku (bez
    // nastavení Barista, tedy totéž co dřív „zaměstnanec"). Typ účtu jde
    // s rolí — určuje, které rozhraní se po přihlášení otevře.
    const role = await vychoziRolePodniku(Number(team.id));
    const ucet = typUctu(role);
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await sql`
      INSERT INTO users (name, email, password_hash, role, avatar, team_id, employer_id)
      VALUES (${name}, ${email}, ${passwordHash}, ${ucet}, '👤', ${team.id}, ${team.owner_id})
      RETURNING id, name, email, role`;

    // Členství hned při vstupu — ne až při prvním přihlášení (kolo 62).
    try {
      await pridejClenstvi(Number(user.id), Number(team.id), ucet, { jobTitle: null });
      await zapisRoliClenstvi(Number(user.id), Number(team.id), role);
    } catch { /* před migrací */ }
    await linkNewMember(sql, team.id, team.owner_id, user.id);

    // O novém členovi ví, kdo tým zve a spravuje (tym.pozvat) — dřív jen
    // vlastník, i když lidi do podniku přiváděl třeba provozní.
    clenoveSOpravnenim(Number(team.id), 'tym.pozvat').then(ids => notifyUsers(ids, {
      title: 'Nový člen týmu',
      body: `${name} se právě připojil/a do týmu.`,
      type: 'invite',
      link: '/employer/overview?view=team-settings',
    })).catch(() => {});

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error('Join error:', error);
    return NextResponse.json({ error: 'Chyba serveru' }, { status: 500 });
  }
}

async function memberLimitHit(sql: any, teamId: number): Promise<boolean> {
  if (!PLAN_ENFORCED) return false;
  let plan;
  try {
    const [row] = await sql`SELECT plan, plan_override, trial_ends_at FROM teams WHERE id = ${teamId}`;
    plan = planInfoOf(row);
  } catch { return false; }
  if (plan.effective === 'pro') return false;
  // Počítají se členové (členství NEBO zrcadlo) — i ti právě přepnutí do
  // jiného podniku, jinak se limit obešel přepnutím (kolo 62).
  try { return !canAddMember(plan, await pocetClenu(teamId)); } catch { return false; }
}
