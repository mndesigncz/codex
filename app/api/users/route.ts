import { NextRequest, NextResponse } from 'next/server';
import { pridejClenstvi, pocetClenu } from '@/lib/tenant';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { sendInvitationEmail } from '@/lib/email';
import { planInfoOf, canAddMember, MEMBER_LIMIT_MSG } from '@/lib/plan';

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

  // Členství NEBO zrcadlo (kolo 62): výběry lidí (rozvrh, docházka) dřív
  // neviděly člena přepnutého do jiného podniku. Vlastní JOIN kvůli
  // createdAt, které helper nevrací; tablet tu záměrně zůstává (jde přes
  // zrcadlo). Role a pozice jsou z členství v TOMHLE podniku.
  const rows = await sql`
    SELECT u.id, u.name, u.email, COALESCE(m.role, u.role) AS role, u.avatar, u.phone,
           COALESCE(m.job_title, u.job_title) AS "jobTitle", u.shift_preference AS "shiftPreference", u.created_at AS "createdAt"
    FROM users u LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${c.teamId}
    WHERE (m.user_id IS NOT NULL OR u.team_id = ${c.teamId})
      AND COALESCE(m.role, u.role) IN ('employer', 'employee', 'kiosk')
    ORDER BY COALESCE(m.role, u.role) DESC, u.name ASC`;
  return NextResponse.json(rows);
}

// POST (employer) — create an employee account inside MY team.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 400 });

  // Same limit the invitation flows enforce — this direct form must not be a
  // side door around the Free plan's team size.
  try {
    const [row] = await sql`SELECT plan, plan_override, trial_ends_at FROM teams WHERE id = ${c.teamId}`;
    // Stejné počítání jako u pozvánek: členství NEBO zrcadlo (kolo 62).
    if (!canAddMember(planInfoOf(row), await pocetClenu(c.teamId))) {
      return NextResponse.json({ error: MEMBER_LIMIT_MSG }, { status: 403 });
    }
  } catch { /* plan columns not migrated — no limit */ }

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
  // Členství hned při založení — ne až při prvním přihlášení (kolo 62):
  // sazbu, kterou vedení nastaví ještě před ním, má členství nést.
  try { await pridejClenstvi(Number(newUser.id), Number(c.teamId), 'employee', { jobTitle: jobTitle ?? 'Barista' }); } catch { /* před migrací */ }

  // Účet vznikl, ať e-mail dopadne jakkoli — ale jestli přístupové údaje
  // odešly, se nesmí jen předpokládat. Bez nich se člověk nepřihlásí.
  let emailSent = false;
  let emailError: string | null = null;
  if (sendInvite) {
    const mail = await sendInvitationEmail(email, name, password);
    emailSent = mail.sent;
    emailError = mail.error;
  }

  return NextResponse.json({
    id: newUser.id, name: newUser.name, email: newUser.email,
    emailSent, emailError,
  });
}
