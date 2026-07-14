import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shifts, shiftRequests } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');

    if (employeeId) {
      const employeeShifts = await db.select().from(shifts)
        .where(eq(shifts.employeeId, parseInt(employeeId)));
      return NextResponse.json(employeeShifts);
    }

    const allShifts = await db.select().from(shifts);
    const allRequests = await db.select().from(shiftRequests);
    return NextResponse.json({ shifts: allShifts, requests: allRequests });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch shifts' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employeeId, date, startTime, endTime, type } = body;

    const [newShift] = await db.insert(shifts).values({
      employeeId,
      date,
      startTime,
      endTime,
      type,
    }).returning();

    return NextResponse.json(newShift);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create shift' }, { status: 500 });
  }
}
