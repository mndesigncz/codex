import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { planningCards } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function requireEmployer() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 }) };
  const role = (session.user as any).role as string;
  if (role !== 'employer') return { error: NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 }) };
  return { error: null };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireEmployer();
    if (error) return error;

    const id = parseInt(params.id);
    const body = await req.json();

    const updates: Record<string, any> = {};
    if (body.column !== undefined) updates.column = body.column;
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.position !== undefined) updates.position = body.position;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Žádné změny' }, { status: 400 });
    }

    const [card] = await db.update(planningCards).set(updates).where(eq(planningCards.id, id)).returning();
    if (!card) return NextResponse.json({ error: 'Karta nenalezena' }, { status: 404 });

    return NextResponse.json(card);
  } catch (error) {
    return NextResponse.json({ error: 'Nepodařilo se upravit kartu' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireEmployer();
    if (error) return error;

    const id = parseInt(params.id);
    await db.delete(planningCards).where(eq(planningCards.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Nepodařilo se smazat kartu' }, { status: 500 });
  }
}
