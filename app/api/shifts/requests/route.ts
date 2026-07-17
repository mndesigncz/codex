import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { shiftRequests } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
  const __s = await getServerSession(authOptions);
  if (!__s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');

    if (employeeId) {
      const myRequests = await db.select().from(shiftRequests)
        .where(eq(shiftRequests.employeeId, parseInt(employeeId)));
      return NextResponse.json(myRequests);
    }

    const all = await db.select().from(shiftRequests);
    return NextResponse.json(all);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
  const __s = await getServerSession(authOptions);
  if (!__s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
    const body = await req.json();
    const [request] = await db.insert(shiftRequests).values({
      employeeId: body.employeeId,
      requestType: body.requestType,
      date: body.date,
      note: body.note,
      status: 'pending',
    }).returning();

    return NextResponse.json(request);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}
