import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recipes } from '@/lib/db/schema';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  try {
    const all = await db.select().from(recipes);
    return NextResponse.json(all);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch recipes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await req.json();
    const createdBy = parseInt((session?.user as any)?.id ?? '1');

    const [recipe] = await db.insert(recipes).values({
      ...body,
      ingredients: typeof body.ingredients === 'string' ? body.ingredients : JSON.stringify(body.ingredients),
      createdBy,
    }).returning();

    return NextResponse.json(recipe);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create recipe' }, { status: 500 });
  }
}
