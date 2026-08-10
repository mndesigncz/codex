// "Nahlásit chybějící položky" — the list an employee sends to the employer.
//
// The author comes from the session; taking it from the request body would let
// a report be filed under a colleague's name.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);

  try {
    const body = await req.json();
    const items = typeof body.items === 'string' ? body.items : JSON.stringify(body.items ?? []);
    const note = body.note ? String(body.note).trim().slice(0, 1000) || null : null;

    const [row] = await sql`
      INSERT INTO inventory_reports (reported_by, items, note, status)
      VALUES (${meId}, ${items}, ${note}, 'new')
      RETURNING *`;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Hlášení se nepodařilo vytvořit' }, { status: 500 });
  }
}
