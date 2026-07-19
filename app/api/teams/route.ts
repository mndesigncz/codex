import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { generateJoinCode } from '@/lib/team';

export const dynamic = 'force-dynamic';

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    id: parseInt((session.user as any).id),
    role: (session.user as any).role as string,
    teamId: (session.user as any).teamId as number | null,
  };
}

export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);

  try {
    // Resolve team from the user record (session teamId may be stale)
    const [dbUser] = await sql`SELECT team_id FROM users WHERE id = ${me.id}`;
    const teamId = dbUser?.team_id ?? me.teamId;
    if (!teamId) return NextResponse.json({ team: null });

    // Core columns only — never depend on newer optional columns here, so a
    // pending migration can NEVER make a team look like it disappeared.
    const [team] = await sql`SELECT id, name, owner_id, join_code, created_at FROM teams WHERE id = ${teamId}`;
    if (!team) return NextResponse.json({ team: null });

    // Optional/newer columns fetched defensively; missing column ⇒ safe default.
    let payDailyCash = false;
    let closingRequiresShift = true;
    try {
      const [extra] = await sql`SELECT pay_daily_cash, closing_requires_shift FROM teams WHERE id = ${teamId}`;
      payDailyCash = !!extra?.pay_daily_cash;
      closingRequiresShift = extra?.closing_requires_shift !== false;
    } catch { /* columns not migrated yet */ }

    const members = await sql`
      SELECT id, name, email, role, avatar, phone, job_title, shift_preference
      FROM users WHERE team_id = ${teamId} ORDER BY role DESC, name ASC`;

    return NextResponse.json({
      team: { ...team, pay_daily_cash: payDailyCash, closing_requires_shift: closingRequiresShift },
      members,
      isOwner: team?.owner_id === me.id,
    });
  } catch (e) {
    // Never surface a 500 as "no team"; report a real error the UI can show.
    return NextResponse.json({ error: 'Tým se nepodařilo načíst. Zkuste to prosím znovu.' }, { status: 500 });
  }
}

// PATCH: rename team or regenerate join code (employer only)
export async function PATCH(request: Request) {
  const me = await currentUser();
  if (!me || me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const sql = neon(process.env.DATABASE_URL!);
  const { name, regenerateCode, payDailyCash, closingRequiresShift } = await request.json();

  // Any employer of the team may manage settings (multi-employer teams).
  const [dbMe] = await sql`SELECT team_id FROM users WHERE id = ${me.id}`;
  const [team] = dbMe?.team_id
    ? await sql`SELECT id FROM teams WHERE id = ${dbMe.team_id}`
    : await sql`SELECT id FROM teams WHERE owner_id = ${me.id}`;
  if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

  if (name) await sql`UPDATE teams SET name = ${name} WHERE id = ${team.id}`;
  if (typeof payDailyCash === 'boolean') await sql`UPDATE teams SET pay_daily_cash = ${payDailyCash} WHERE id = ${team.id}`;
  if (typeof closingRequiresShift === 'boolean') await sql`UPDATE teams SET closing_requires_shift = ${closingRequiresShift} WHERE id = ${team.id}`;

  let joinCode: string | undefined;
  if (regenerateCode) {
    joinCode = generateJoinCode();
    await sql`UPDATE teams SET join_code = ${joinCode} WHERE id = ${team.id}`;
  }

  const [updated] = await sql`SELECT id, name, join_code FROM teams WHERE id = ${team.id}`;
  return NextResponse.json({ ok: true, team: updated });
}
