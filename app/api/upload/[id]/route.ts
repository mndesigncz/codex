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
  // Bez týmu se soubor nevydá nikomu jinému než jeho autorovi. Dřív tu bylo
  // „OR team_id IS NULL", takže co nahrál uživatel bez týmu, četl kdokoli.
  const [row] = await sql`
    SELECT mime, name, data, blob_path FROM uploads
    WHERE id = ${id}
      AND (team_id = ${u?.team_id ?? -1} OR (team_id IS NULL AND user_id = ${meId}))`;
  if (!row) return NextResponse.json({ error: 'Soubor nenalezen' }, { status: 404 });

  // Typ obsahu se NIKDY nebere z toho, co poslal nahrávající. Kdyby ano,
  // stačilo by nahrát „obrázek" s typem text/html a skriptem — prohlížeč by
  // ho spustil na doméně aplikace a mohl by jménem oběti volat celé API.
  // Obrázky a PDF se zobrazují, protože to je k něčemu; všechno ostatní se
  // stahuje jako neškodná binárka.
  const declared = String(row.mime || '').toLowerCase().split(';')[0].trim();
  const INLINE_OK = new Set([
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'application/pdf',
  ]);
  const inline = INLINE_OK.has(declared);
  const safeName = String(row.name || 'soubor').replace(/[^\w.\- ]+/g, '_').slice(0, 100);
  const headers: Record<string, string> = {
    'Content-Type': inline ? declared : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    // I kdyby se sem něco spustitelného přece jen dostalo, ať nemá co volat.
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; object-src 'none'; sandbox",
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
