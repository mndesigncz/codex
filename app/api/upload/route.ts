import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { put } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/** Chat attachments and receipts are photos and documents, not archives. */
const MAX_BYTES = 10 * 1024 * 1024;
/** Postgres fallback cap — base64 grows ~33 %, keep rows sane. */
const MAX_DB_BYTES = 4 * 1024 * 1024;

// Co se do chatu, účtenek a návodů nahrává: fotky, PDF, kancelářské
// dokumenty a text. Spustitelné soubory, archivy, HTML a SVG ne. Servírování
// je i tak zamčené (typ se nebere od nahrávajícího, sandbox CSP), ale co sem
// nepatří, nemá se ani uložit — ani do úložiště, ani do zálohy.
const POVOLENE = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/heif',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  // Z telefonu do chatu: krátké video a hlasová zpráva.
  'video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav',
]);
// Některé prohlížeče u dokumentů typ nepošlou vůbec. Pak rozhodne přípona.
const PODLE_PRIPONY: Record<string, string> = {
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  heic: 'image/heic', heif: 'image/heif', mov: 'video/quicktime', m4a: 'audio/mp4', mp3: 'audio/mpeg',
};
const ZAKAZANE_PRIPONY = /\.(exe|msi|bat|cmd|com|scr|ps1|sh|js|mjs|jar|apk|dmg|html?|svg|xml|php|zip|rar|7z)$/i;

// The blob store is PRIVATE (receipts and chat photos are internal), so every
// file — blob or DB fallback — is addressed as /api/upload/<id> and served by
// the authenticated route next door. Nothing gets a public URL.
export async function POST(request: NextRequest) {
  // Nahrávat smí člen aktivního podniku (chat, účtenky, návody, značka).
  // Soubor se zapíše k podniku z členství — dřív stačilo users.team_id, takže
  // host s nastaveným podnikem ukládal soubory do cizího podniku (kolo 67).
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const meId = c.meId;

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
    const pripona = (f.name || '').toLowerCase().split('.').pop() ?? '';
    let mime = (f.type || '').toLowerCase().split(';')[0].trim().slice(0, 100);
    if (!mime || mime === 'application/octet-stream') mime = PODLE_PRIPONY[pripona] ?? 'application/octet-stream';
    if (!POVOLENE.has(mime) || ZAKAZANE_PRIPONY.test(f.name || '')) {
      return NextResponse.json({ error: 'Tenhle typ souboru nejde nahrát. Vezmu fotky, PDF, text a dokumenty Word nebo Excel.' }, { status: 415 });
    }
    // Název od uživatele se ukazuje v chatu, ale do cesty v úložišti jde
    // jen očištěný: bez lomítek, bez „..", bez řídicích znaků.
    const filename = (f.name || 'soubor').replace(/[\u0000-\u001f\u007f/\\]+/g, '_').replace(/\.\.+/g, '.').slice(0, 200) || 'soubor';
    const type = mime.startsWith('image/') ? 'image' : 'file';
    const u = { team_id: c.teamId };

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
