import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { dailyReports } from '@/lib/db/schema';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const all = await db.select().from(dailyReports).orderBy(dailyReports.date);
    return NextResponse.json(all.reverse());
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await req.json();
    const createdBy = parseInt((session?.user as any)?.id ?? '1');

    const [report] = await db.insert(dailyReports).values({
      date: body.date,
      revenue: body.revenue,
      customers: body.customers,
      notes: body.notes,
      createdBy,
    }).returning();

    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
  }
}
