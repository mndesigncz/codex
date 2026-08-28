import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { put } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/** Chat attachments and receipts are photos and documents, not archives. */
const MAX_BYTES = 10 * 1024 * 1024;
/** Postgres fallback cap — base64 grows ~33 %, keep rows sane. */
const MAX_DB_BYTES = 4 * 1024 * 1024;

// The blob store is PRIVATE (receipts and chat photos are internal), so every
// file — blob or DB fallback — is addressed as /api/upload/<id> and served by
// the authenticated route next door. Nothing gets a public URL.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  }
  const meId = parseInt((session.user as any).id);

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Chybí soubor' }, { status: 400 });
    }

    const f = file as File;
    if (f.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Soubor je příliš velký (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).` },
        { status: 413 },
      );
    }
    const filename = f.name || 'soubor';
    const mime = (f.type || 'application/octet-stream').slice(0, 100);
    const type = mime.startsWith('image/') ? 'image' : 'file';
    const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;

    let blobPath: string | null = null;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(filename, f, { access: 'private', addRandomSuffix: true });
        blobPath = blob.pathname;
      } catch (e) {
        console.error('blob upload failed, falling back to DB', e);
      }
    }

    let data: string | null = null;
    if (!blobPath) {
      if (f.size > MAX_DB_BYTES) {
        return NextResponse.json(
          { error: `Úložiště souborů je nedostupné a záložní režim zvládne max ${Math.round(MAX_DB_BYTES / 1024 / 1024)} MB.` },
          { status: 503 },
        );
      }
      data = Buffer.from(await f.arrayBuffer()).toString('base64');
    }

    const [row] = await sql`
      INSERT INTO uploads (team_id, user_id, name, mime, data, blob_path)
      VALUES (${u?.team_id ?? null}, ${meId}, ${filename.slice(0, 200)}, ${mime}, ${data}, ${blobPath})
      RETURNING id`;
    return NextResponse.json({ url: `/api/upload/${row.id}`, type, name: filename });
  } catch (e) {
    console.error('upload failed', e);
    return NextResponse.json({ error: 'Nahrání se nezdařilo' }, { status: 500 });
  }
}
