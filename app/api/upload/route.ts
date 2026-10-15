import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { put } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';
import { MAX_BYTES, povolenyTyp, cistyNazev, HLASKA_TYP } from '@/lib/nahravaniPravidla';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/** Postgres fallback cap — base64 grows ~33 %, keep rows sane. */
const MAX_DB_BYTES = 4 * 1024 * 1024;

// Co se smí nahrát (typy, přípony, limit) je v lib/nahravaniPravidla.ts —
// stejná pravidla platí pro přímé nahrávání do úložiště (./primo).

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
    const mime = povolenyTyp(f.name, f.type);
    if (!mime) return NextResponse.json({ error: HLASKA_TYP }, { status: 415 });
    // Název od uživatele se ukazuje v chatu, ale do cesty v úložišti jde
    // jen očištěný: bez lomítek, bez „..", bez řídicích znaků.
    const filename = cistyNazev(f.name);
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
