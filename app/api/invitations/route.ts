import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { planInfoOf, PLAN_ENFORCED, canAddMember } from '@/lib/plan';
import { generateInviteToken } from '@/lib/team';
import { sendTeamInvitation } from '@/lib/email';

export const dynamic = 'force-dynamic';

async function currentEmployer() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'employer') return null;
  return { id: parseInt((session.user as any).id), name: session.user.name as string };
}

export async function GET() {
  const me = await currentEmployer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const sql = neon(process.env.DATABASE_URL!);
  const [team] = await sql`SELECT id FROM teams WHERE owner_id = ${me.id}`;
  if (!team) return NextResponse.json({ invitations: [] });
  // token is included so the employer can copy a working join link and share
  // it directly (email delivery is best-effort and may be unconfigured).
  const invitations = await sql`
    SELECT id, email, job_title, status, token, created_at FROM invitations
    WHERE team_id = ${team.id} ORDER BY created_at DESC`;
  return NextResponse.json({ invitations });
}

export async function POST(request: Request) {
  const me = await currentEmployer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const { email, jobTitle, role } = await request.json();
  if (!email) return NextResponse.json({ error: 'Email je povinný' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  // Any employer of the team can invite (multi-employer teams).
  const [dbMe] = await sql`SELECT team_id FROM users WHERE id = ${me.id}`;
  const [team] = dbMe?.team_id
    ? await sql`SELECT id, name FROM teams WHERE id = ${dbMe.team_id}`
    : await sql`SELECT id, name FROM teams WHERE owner_id = ${me.id}`;
  if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

  // Existující účet jde pozvat do DALŠÍHO podniku (přijetí mu přidá členství).
  // Nejde pozvat tablet ani hosta, a nejde pozvat někoho, kdo už tu je.
  const [existingUser] = await sql`SELECT id, role, team_id FROM users WHERE email = ${email}`;
  if (existingUser) {
    if (existingUser.role === 'kiosk' || existingUser.role === 'customer') {
      return NextResponse.json({ error: 'Tenhle e-mail patří tabletu nebo hostovi — do týmu ho pozvat nejde.' }, { status: 409 });
    }
    let uzClen = Number(existingUser.team_id) === Number(team.id);
    try {
      const [m] = await sql`SELECT 1 FROM team_members WHERE user_id = ${existingUser.id} AND team_id = ${team.id}`;
      uzClen = uzClen || !!m;
    } catch { /* před migrací */ }
    if (uzClen) return NextResponse.json({ error: 'Tenhle člověk už v týmu je.' }, { status: 409 });
  }

  const token = generateInviteToken();
  const invRole = role === 'employer' ? 'employer' : 'employee';
  try {

  if (await memberLimitHit(sql, team.id)) {
    return NextResponse.json({ error: 'Tým je na plánu Zdarma plný (3 členové). Vedení může přejít na Pro v Nastavení → Předplatné.' }, { status: 403 });
  }
    await sql`
      INSERT INTO invitations (team_id, email, token, job_title, role, invited_by, status)
      VALUES (${team.id}, ${email}, ${token}, ${jobTitle || 'Barista'}, ${invRole}, ${me.id}, 'pending')`;
  } catch {
    // role column not migrated yet — invite as a regular employee
    await sql`
      INSERT INTO invitations (team_id, email, token, job_title, invited_by, status)
      VALUES (${team.id}, ${email}, ${token}, ${jobTitle || 'Barista'}, ${me.id}, 'pending')`;
  }

  // The join link always works and is returned so the UI can offer it for
  // manual sharing. The email is a best-effort convenience on top.
  // `sendTeamInvitation` nevyhazuje — chybu vrací. Dřív se `emailSent`
  // nastavilo na `true` i tehdy, když Resend pozvánku odmítl.
  const mail = await sendTeamInvitation(email, team.name, me.name, token);

  return NextResponse.json({
    ok: true, token, path: `/join?token=${token}`,
    emailSent: mail.sent, emailError: mail.error,
  });
}

// DELETE ?id= — revoke a pending invitation (typo in the e-mail, wrong person…).
// The token stops working immediately; the row stays for the audit trail.
export async function DELETE(request: Request) {
  const me = await currentEmployer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const sql = neon(process.env.DATABASE_URL!);
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });

  const [meRow] = await sql`SELECT team_id FROM users WHERE id = ${me.id}`;
  const [team] = meRow?.team_id
    ? await sql`SELECT id FROM teams WHERE id = ${meRow.team_id}`
    : await sql`SELECT id FROM teams WHERE owner_id = ${me.id}`;
  if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

  const [row] = await sql`
    UPDATE invitations SET status = 'revoked'
    WHERE id = ${id} AND team_id = ${team.id} AND status = 'pending'
    RETURNING id`;
  if (!row) return NextResponse.json({ error: 'Pozvánka nenalezena nebo už není aktivní' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

async function memberLimitHit(sql: any, teamId: number): Promise<boolean> {
  if (!PLAN_ENFORCED) return false;
  let plan;
  try {
    const [row] = await sql`SELECT plan, plan_override, trial_ends_at FROM teams WHERE id = ${teamId}`;
    plan = planInfoOf(row);
  } catch { return false; }
  if (plan.effective === 'pro') return false;
  try {
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM users WHERE team_id = ${teamId} AND role <> 'kiosk'`;
    return !canAddMember(plan, Number(n) || 0);
  } catch { return false; }
}
