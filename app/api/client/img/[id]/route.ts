// Obrázky podniku pro hosty. Běžné /api/upload je týmové — host tým nemá,
// takže by logo ani fotku neviděl. Tady se soubor vydá bez přihlášení, ale
// JEN když na něj opravdu ukazuje profil zapnutého podniku: id se hledá
// v logu, fotce a galerii, ne v celé tabulce nahraných souborů.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { get } from '@vercel/blob';
import { sql } from '@/lib/client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Zobrazit se smí jen obrázek, a jen typ, který prohlížeč nespustí. */
const INLINE_OK = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const url = `/api/client/img/${id}`;
  let [ref] = await sql`
    SELECT team_id FROM client_profiles
    WHERE enabled = TRUE AND (logo_url = ${url} OR cover_url = ${url} OR gallery @> ${JSON.stringify([url])}::jsonb)
    LIMIT 1`;
  if (!ref) {
    // Fotka veřejné akce zapnutého podniku se hostům vydat smí.
    try {
      [ref] = await sql`
        SELECT e.team_id FROM events e
        JOIN client_profiles p ON p.team_id = e.team_id AND p.enabled = TRUE
        WHERE e.public = TRUE AND e.status <> 'cancelled' AND e.photos @> ${JSON.stringify([url])}::jsonb
        LIMIT 1`;
    } catch { /* photos bez migrace */ }
  }
  if (!ref) {
    // Vedení si potřebuje prohlédnout fotky i u akce, která ještě veřejná
    // není — vlastnímu týmu se soubor vydá po přihlášení.
    const session = await getServerSession(authOptions);
    const meId = session?.user ? parseInt((session.user as any).id) : NaN;
    if (Number.isFinite(meId)) {
      [ref] = await sql`
        SELECT up.team_id FROM uploads up JOIN users us ON us.team_id = up.team_id
        WHERE up.id = ${id} AND us.id = ${meId} LIMIT 1`;
    }
  }
  if (!ref) return NextResponse.json({ error: 'Obrázek nenalezen' }, { status: 404 });

  const [row] = await sql`SELECT mime, data, blob_path FROM uploads WHERE id = ${id} AND team_id = ${ref.team_id}`;
  if (!row) return NextResponse.json({ error: 'Obrázek nenalezen' }, { status: 404 });
  const declared = String(row.mime || '').toLowerCase().split(';')[0].trim();
  if (!INLINE_OK.has(declared)) return NextResponse.json({ error: 'Nepodporovaný typ' }, { status: 415 });

  const headers: Record<string, string> = {
    'Content-Type': declared,
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; object-src 'none'; sandbox",
  };
  if (row.blob_path && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const r = await get(row.blob_path, { access: 'private' });
      if (r) return new NextResponse(r.stream as any, { headers });
    } catch { /* spadne na zálohu v databázi */ }
  }
  if (row.data) return new NextResponse(Buffer.from(row.data, 'base64'), { headers });
  return NextResponse.json({ error: 'Obrázek nenalezen' }, { status: 404 });
}
