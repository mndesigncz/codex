import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
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
  const invitations = await sql`
    SELECT id, email, job_title, status, created_at FROM invitations
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

  const existingUser = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existingUser.length > 0) {
    return NextResponse.json({ error: 'Uživatel s tímto emailem už existuje' }, { status: 409 });
  }

  const token = generateInviteToken();
  const invRole = role === 'employer' ? 'employer' : 'employee';
  try {
    await sql`
      INSERT INTO invitations (team_id, email, token, job_title, role, invited_by, status)
      VALUES (${team.id}, ${email}, ${token}, ${jobTitle || 'Barista'}, ${invRole}, ${me.id}, 'pending')`;
  } catch {
    // role column not migrated yet — invite as a regular employee
    await sql`
      INSERT INTO invitations (team_id, email, token, job_title, invited_by, status)
      VALUES (${team.id}, ${email}, ${token}, ${jobTitle || 'Barista'}, ${me.id}, 'pending')`;
  }

  try {
    await sendTeamInvitation(email, team.name, me.name, token);
  } catch (e) {
    console.error('invite email failed', e);
    return NextResponse.json({ ok: true, warning: 'Pozvánka uložena, ale email se nepodařilo odeslat.' });
  }

  return NextResponse.json({ ok: true });
}
