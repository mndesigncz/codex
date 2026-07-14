import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { planningCards } from '@/lib/db/schema';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const cards = await db.select().from(planningCards);
    return NextResponse.json(cards);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch planning cards' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await req.json();
    const createdBy = parseInt((session?.user as any)?.id ?? '1');

    const [card] = await db.insert(planningCards).values({
      title: body.title,
      description: body.description,
      column: body.column ?? 'ideas',
      position: body.position ?? 0,
      createdBy,
    }).returning();

    return NextResponse.json(card);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 });
  }
}
