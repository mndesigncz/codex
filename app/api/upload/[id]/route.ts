// Serves uploaded files — from the PRIVATE blob store or the Postgres
// fallback. Team-scoped: a receipt photo belongs to the business that took it.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { get } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const [row] = await sql`
    SELECT mime, data, blob_path FROM uploads
    WHERE id = ${id} AND (team_id = ${u?.team_id ?? null} OR team_id IS NULL)`;
  if (!row) return NextResponse.json({ error: 'Soubor nenalezen' }, { status: 404 });

  const headers = {
    'Content-Type': row.mime || 'application/octet-stream',
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };

  if (row.blob_path && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const result = await get(row.blob_path, { access: 'private' });
      if (result) return new NextResponse(result.stream as any, { headers });
    } catch (e) {
      console.error('blob get failed', e);
    }
  }
  if (row.data) {
    return new NextResponse(Buffer.from(row.data, 'base64'), { headers });
  }
  return NextResponse.json({ error: 'Soubor je nedostupný' }, { status: 404 });
}
