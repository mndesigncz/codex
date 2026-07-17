import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { messages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
  const __s = await getServerSession(authOptions);
  if (!__s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get('channel') ?? 'general';

    const channelMessages = await db.select().from(messages)
      .where(eq(messages.channel, channel));

    return NextResponse.json(channelMessages);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
  const __s = await getServerSession(authOptions);
  if (!__s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
    const body = await req.json();
    const { senderId, channel, content } = body;

    const [newMessage] = await db.insert(messages).values({
      senderId,
      channel: channel ?? 'general',
      content,
    }).returning();

    return NextResponse.json(newMessage);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
