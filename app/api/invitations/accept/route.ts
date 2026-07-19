import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';
import { linkNewMember } from '@/lib/chat';
import { notifyUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

// GET ?token= → validate invitation and return prefilled email + team name
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Chybí token' }, { status: 400 });
  const sql = neon(process.env.DATABASE_URL!);
  const [inv] = await sql`SELECT i.email, i.status, t.name as team_name FROM invitations i JOIN teams t ON t.id = i.team_id WHERE i.token = ${token}`;
  if (!inv) return NextResponse.json({ error: 'Neplatná pozvánka' }, { status: 404 });
  if (inv.status !== 'pending') return NextResponse.json({ error: 'Pozvánka již byla použita' }, { status: 410 });
  return NextResponse.json({ email: inv.email, teamName: inv.team_name });
}

// POST { token, name, password } → create employee account from invitation
export async function POST(request: Request) {
  try {
    const { token, name, password } = await request.json();
    if (!token || !name || !password) return NextResponse.json({ error: 'Všechna pole jsou povinná' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Heslo musí mít alespoň 8 znaků' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const [inv] = await sql`SELECT * FROM invitations WHERE token = ${token}`;
    if (!inv || inv.status !== 'pending') return NextResponse.json({ error: 'Neplatná nebo použitá pozvánka' }, { status: 410 });

    const [team] = await sql`SELECT id, owner_id FROM teams WHERE id = ${inv.team_id}`;
    if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

    const existing = await sql`SELECT id FROM users WHERE email = ${inv.email}`;
    if (existing.length > 0) return NextResponse.json({ error: 'Účet už existuje' }, { status: 409 });

    const passwordHash = await bcrypt.hash(password, 12);
    const newRole = inv.role === 'employer' ? 'employer' : 'employee';
    const [user] = await sql`
      INSERT INTO users (name, email, password_hash, role, avatar, job_title, team_id, employer_id)
      VALUES (${name}, ${inv.email}, ${passwordHash}, ${newRole}, '👤', ${inv.job_title || 'Barista'}, ${team.id}, ${team.owner_id})
      RETURNING id, name, email, role`;

    await sql`UPDATE invitations SET status = 'accepted' WHERE id = ${inv.id}`;
    await linkNewMember(sql, team.id, team.owner_id, user.id);

    notifyUser(team.owner_id, {
      title: 'Pozvánka přijata',
      body: `${name} přijal/a pozvánku a připojil/a se do týmu.`,
      type: 'invite',
    }).catch(() => {});

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error('accept invite error', error);
    return NextResponse.json({ error: 'Chyba serveru' }, { status: 500 });
  }
}
