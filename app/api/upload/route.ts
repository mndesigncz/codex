import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

/** Chat attachments are photos and documents, not archives — 10 MB is plenty
 *  and keeps a mis-picked video from stalling the shift's phone. */
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'Nahrávání souborů není nakonfigurováno' },
      { status: 503 },
    );
  }

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
    const blob = await put(filename, f, { access: 'public', addRandomSuffix: true });
    const type = f.type && f.type.startsWith('image/') ? 'image' : 'file';

    return NextResponse.json({ url: blob.url, type, name: filename });
  } catch (e) {
    console.error('upload failed', e);
    return NextResponse.json({ error: 'Nahrání se nezdařilo' }, { status: 500 });
  }
}
