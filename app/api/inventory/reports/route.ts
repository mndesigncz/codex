import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { inventoryReports } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const [report] = await db.insert(inventoryReports).values({
      reportedBy: body.reportedBy,
      items: body.items,
      note: body.note,
      status: 'new',
    }).returning();

    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create inventory report' }, { status: 500 });
  }
}
