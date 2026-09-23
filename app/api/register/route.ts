import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';
import { generateJoinCode } from '@/lib/team';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';

export const dynamic = 'force-dynamic';

// Self-registration is EMPLOYER ONLY. Employees join an existing team via
// a join code (/api/teams/join) or an email invitation (/api/invitations/accept).
export async function POST(request: Request) {
  try {
    const { name, email, password, teamName, ref } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Všechna pole jsou povinná' }, { status: 400 });
    }
    // Každá registrace zakládá podnik, tým a (s kartou) zkušební předplatné.
    // Pět za hodinu z jedné adresy poctivému nevadí; skript by jinak mohl
    // databázi zaplnit prázdnými podniky a zkoušet, které e-maily existují.
    const gate = await hit(`register-ip:${klientIp(request.headers)}`, 5, 60 * 60);
    if (!gate.ok) {
      return NextResponse.json({ error: `Příliš mnoho registrací z této sítě. Zkus to znovu za ${Math.ceil(gate.retryAfter / 60)} min.` }, { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Heslo musí mít alespoň 8 znaků' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Tento email je již zaregistrován' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create the employer account
    const [user] = await sql`
      INSERT INTO users (name, email, password_hash, role, avatar, job_title)
      VALUES (${name}, ${email}, ${passwordHash}, 'employer', '👔', 'Provozovatel')
      RETURNING id, name, email, role`;

    // Create their team with a unique join code
    let joinCode = generateJoinCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await sql`SELECT id FROM teams WHERE join_code = ${joinCode}`;
      if (clash.length === 0) break;
      joinCode = generateJoinCode();
    }
    // Nový podnik začíná na plánu Zdarma; 30 dní Pro/Max zdarma si zapne
    // v Nastavení → Předplatné s kartou (trial ve Stripe). Odkaz ?ref=KÓD
    // zapíše, kdo ho doporučil — měsíc zdarma dostane, až podnik poprvé zaplatí.
    let referredBy: number | null = null;
    if (ref) {
      try {
        const { teamByReferralCode } = await import('@/lib/billing');
        referredBy = await teamByReferralCode(String(ref));
      } catch { /* před migrací */ }
    }
    let team: any;
    try {
      [team] = await sql`
        INSERT INTO teams (name, owner_id, join_code, plan, referred_by_team_id)
        VALUES (${teamName || `Podnik ${name}`}, ${user.id}, ${joinCode}, 'free', ${referredBy})
        RETURNING id, join_code`;
    } catch {
     try {
      [team] = await sql`
        INSERT INTO teams (name, owner_id, join_code, plan)
        VALUES (${teamName || `Podnik ${name}`}, ${user.id}, ${joinCode}, 'free')
        RETURNING id, join_code`;
     } catch {
      // plan columns not migrated yet
      [team] = await sql`
        INSERT INTO teams (name, owner_id, join_code)
        VALUES (${teamName || `Podnik ${name}`}, ${user.id}, ${joinCode})
        RETURNING id, join_code`;
     }
    }

    // Link owner to team
    await sql`UPDATE users SET team_id = ${team.id} WHERE id = ${user.id}`;

    // Auto-create the team-wide chat channel
    await sql`
      INSERT INTO conversations (team_id, type, name)
      VALUES (${team.id}, 'team', 'Týmový chat')`;

    return NextResponse.json({ ok: true, user, joinCode: team.join_code });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Chyba serveru' }, { status: 500 });
  }
}
