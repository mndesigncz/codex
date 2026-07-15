import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function currentEmployer() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'employer') return null;
  return { id: parseInt((session.user as any).id) };
}

// Resolve the team owned by the current employer + confirm target is a member.
async function ownedTeam(ownerId: number) {
  const [team] = await sql`SELECT id, owner_id FROM teams WHERE owner_id = ${ownerId}`;
  return team ?? null;
}

export async function PATCH(request: Request) {
  const me = await currentEmployer();
  if (!me) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const { userId, role, jobTitle } = await request.json();
  if (!userId) return NextResponse.json({ error: 'Chybí userId' }, { status: 400 });

  const team = await ownedTeam(me.id);
  if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

  const targetId = parseInt(String(userId));
  if (targetId === team.owner_id) {
    return NextResponse.json({ error: 'Vlastníka týmu nelze upravit.' }, { status: 400 });
  }

  const [member] = await sql`SELECT id FROM users WHERE id = ${targetId} AND team_id = ${team.id}`;
  if (!member) return NextResponse.json({ error: 'Člen týmu nenalezen' }, { status: 404 });

  if (role !== undefined) {
    if (role !== 'employer' && role !== 'employee') {
      return NextResponse.json({ error: 'Neplatná role.' }, { status: 400 });
    }
    await sql`UPDATE users SET role = ${role} WHERE id = ${targetId} AND team_id = ${team.id}`;
  }

  if (jobTitle !== undefined) {
    await sql`UPDATE users SET job_title = ${jobTitle} WHERE id = ${targetId} AND team_id = ${team.id}`;
  }

  const [updated] = await sql`
    SELECT id, name, email, role, avatar, phone, job_title, shift_preference
    FROM users WHERE id = ${targetId}`;

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

  const [member] = await sql`SELECT id FROM users WHERE id = ${targetId} AND team_id = ${team.id}`;
  if (!member) return NextResponse.json({ error: 'Člen týmu nenalezen' }, { status: 404 });

  // Detach the member from the team (keeps user record + history intact).
  await sql`UPDATE users SET team_id = NULL WHERE id = ${targetId}`;

  return NextResponse.json({ ok: true });
}
