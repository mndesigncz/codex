import { NextRequest, NextResponse } from 'next/server';
import { sendInvitationEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const { to, name, tempPassword } = await req.json();
    await sendInvitationEmail(to, name, tempPassword);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 });
  }
}
