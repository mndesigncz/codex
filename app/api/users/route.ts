import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { sendInvitationEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | null };
}

// GET — members of MY team only (no cross-team listing, no password hashes).
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json([]);

  const rows = await sql`
    SELECT id, name, email, role, avatar, phone,
           job_title AS "jobTitle", shift_preference AS "shiftPreference", created_at AS "createdAt"
    FROM users WHERE team_id = ${c.teamId}
    ORDER BY role DESC, name ASC`;
  return NextResponse.json(rows);
}

// POST (employer) — create an employee account inside MY team.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { name, email, password, avatar, phone, jobTitle, sendInvite } = body;
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Chybí jméno, e-mail nebo heslo' }, { status: 400 });
  }

  const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing) return NextResponse.json({ error: 'Účet s tímto e-mailem už existuje' }, { status: 409 });

  const passwordHash = await bcrypt.hash(String(password), 10);
  // Role is always 'employee' — an employer account can never be created here.
  const [newUser] = await sql`
    INSERT INTO users (name, email, password_hash, role, avatar, phone, job_title, employer_id, team_id)
    VALUES (${name}, ${email}, ${passwordHash}, 'employee', ${avatar ?? '👤'}, ${phone ?? null},
            ${jobTitle ?? 'Barista'}, ${c.meId}, ${c.teamId})
    RETURNING id, name, email`;

  if (sendInvite) {
    try {
      await sendInvitationEmail(email, name, password);
    } catch (e) {
      console.error('Failed to send invite email:', e);
    }
  }

  return NextResponse.json({ id: newUser.id, name: newUser.name, email: newUser.email });
}
