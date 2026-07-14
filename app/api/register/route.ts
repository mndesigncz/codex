import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';

export async function POST(request: Request) {
  try {
    const { name, email, password, role } = await request.json();

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'Všechna pole jsou povinná' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Heslo musí mít alespoň 8 znaků' }, { status: 400 });
    }

    if (!['employer', 'employee'].includes(role)) {
      return NextResponse.json({ error: 'Neplatný typ účtu' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Check if email already exists
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Tento email je již zaregistrován' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const avatar = role === 'employer' ? '👔' : '👤';

    const [user] = await sql`
      INSERT INTO users (name, email, password_hash, role, avatar)
      VALUES (${name}, ${email}, ${passwordHash}, ${role}, ${avatar})
      RETURNING id, name, email, role
    `;

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Chyba serveru' }, { status: 500 });
  }
}
