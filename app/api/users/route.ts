import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import bcrypt from 'bcryptjs';
import { sendInvitationEmail } from '@/lib/email';

export async function GET() {
  try {
    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatar: users.avatar,
      phone: users.phone,
      jobTitle: users.jobTitle,
      shiftPreference: users.shiftPreference,
      employerId: users.employerId,
      createdAt: users.createdAt,
    }).from(users);
    return NextResponse.json(allUsers);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, role, avatar, phone, jobTitle, sendInvite } = body;

    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await db.insert(users).values({
      name,
      email,
      passwordHash,
      role: role ?? 'employee',
      avatar: avatar ?? '👤',
      phone,
      jobTitle: jobTitle ?? 'Barista',
    }).returning();

    if (sendInvite) {
      try {
        await sendInvitationEmail(email, name, password);
      } catch (e) {
        console.error('Failed to send invite email:', e);
      }
    }

    return NextResponse.json({ id: newUser.id, name: newUser.name, email: newUser.email });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
