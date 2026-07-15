import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

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
    const filename = f.name || 'soubor';
    const blob = await put(filename, f, { access: 'public', addRandomSuffix: true });
    const type = f.type && f.type.startsWith('image/') ? 'image' : 'file';

    return NextResponse.json({ url: blob.url, type, name: filename });
  } catch (e) {
    console.error('upload failed', e);
    return NextResponse.json({ error: 'Nahrání se nezdařilo' }, { status: 500 });
  }
}
