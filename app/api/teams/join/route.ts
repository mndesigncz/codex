import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { linkNewMember } from '@/lib/chat';

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

    const sql = neon(process.env.DATABASE_URL!);

    const [team] = await sql`SELECT id, owner_id, name FROM teams WHERE join_code = ${joinCode.trim().toUpperCase()}`;
    if (!team) {
      return NextResponse.json({ error: 'Neplatný kód týmu' }, { status: 404 });
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Tento email je již zaregistrován' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await sql`
      INSERT INTO users (name, email, password_hash, role, avatar, team_id, employer_id)
      VALUES (${name}, ${email}, ${passwordHash}, 'employee', '👤', ${team.id}, ${team.owner_id})
      RETURNING id, name, email, role`;

    await linkNewMember(sql, team.id, team.owner_id, user.id);

    notifyUser(team.owner_id, {
      title: 'Nový člen týmu',
      body: `${name} se právě připojil/a do týmu.`,
      type: 'invite',
      link: '/',
    }).catch(() => {});

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error('Join error:', error);
    return NextResponse.json({ error: 'Chyba serveru' }, { status: 500 });
  }
}
