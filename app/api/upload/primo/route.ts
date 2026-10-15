// Přímé nahrávání do Vercel Blob (spuštění, balík S).
//
// Serverless funkce přijme nejvýš 4,5 MB, takže video do chatu nebo sken
// faktury přes app/api/upload neprojde. Velký soubor proto prohlížeč nahraje
// rovnou do úložiště (`upload()` z @vercel/blob/client) a server jen:
//   GET                      → { zapnuto, predpona } (bez BLOB_READ_WRITE_TOKEN zapnuto: false)
//   POST blob.generate-client-token → krátký token jen pro cestu pod vlastní předponou,
//                              jen povolený typ a velikost (handleUpload)
//   POST { akce: 'zapsat', pathname, name } → ověří, že soubor v úložišti je
//                              a leží pod předponou volajícího, a zapíše ho do
//                              `uploads` (stejný tvar odpovědi jako app/api/upload)
// Úložiště je soukromé: soubor se čte jen přes /api/upload/<id> s přihlášením.
// Bez tokenu úložiště se aplikace chová jako dřív (klient pošle soubor
// klasicky přes app/api/upload).

import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { head } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { hit } from '@/lib/rateLimit';
import { MAX_PRIMO_BYTES, povolenyTyp, cistyNazev, predponaNahravani, patriPodPredponu, HLASKA_TYP } from '@/lib/nahravaniPravidla';

export const dynamic = 'force-dynamic';

const zapnuto = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export async function GET() {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  if (!zapnuto() || c.teamId == null) return NextResponse.json({ zapnuto: false });
  return NextResponse.json({ zapnuto: true, predpona: predponaNahravani(c.teamId, c.meId), max: MAX_PRIMO_BYTES });
}

export async function POST(request: NextRequest) {
  // Nahrávat smí člen aktivního podniku — stejně jako app/api/upload.
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  if (!zapnuto()) return NextResponse.json({ error: 'Přímé nahrávání není zapnuté.' }, { status: 501 });
  if (c.teamId == null) return NextResponse.json({ error: 'Nejdřív si vyber podnik.' }, { status: 400 });
  const teamId = c.teamId;
  const body = await request.json().catch(() => null) as (HandleUploadBody & { akce?: string; pathname?: string; name?: string }) | null;
  if (!body) return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });

  if (body.akce === 'zapsat') {
    const pathname = String(body.pathname ?? '');
    if (!patriPodPredponu(pathname, teamId, c.meId)) return NextResponse.json({ error: 'Soubor nenalezen' }, { status: 404 });
    const sql = neon(process.env.DATABASE_URL!);
    // Dvakrát odeslané „zapsat" vrátí týž záznam, ne druhý řádek.
    const [byl] = await sql`SELECT id, name, mime FROM uploads WHERE blob_path = ${pathname} AND team_id = ${teamId} AND user_id = ${c.meId}`;
    if (byl) return NextResponse.json({ url: `/api/upload/${byl.id}`, type: String(byl.mime).startsWith('image/') ? 'image' : 'file', name: byl.name });
    let info: Awaited<ReturnType<typeof head>>;
    try { info = await head(pathname); } catch { return NextResponse.json({ error: 'Soubor nenalezen' }, { status: 404 }); }
    // Typ a velikost znovu podle úložiště, ne podle toho, co tvrdí prohlížeč.
    const nazev = cistyNazev(body.name || pathname.slice(pathname.lastIndexOf('/') + 1));
    const mime = povolenyTyp(nazev, info.contentType);
    if (!mime || info.size > MAX_PRIMO_BYTES) return NextResponse.json({ error: HLASKA_TYP }, { status: 415 });
    const [row] = await sql`
      INSERT INTO uploads (team_id, user_id, name, mime, data, blob_path)
      VALUES (${teamId}, ${c.meId}, ${nazev}, ${mime}, ${null}, ${pathname})
      RETURNING id`;
    return NextResponse.json({ url: `/api/upload/${row.id}`, type: mime.startsWith('image/') ? 'image' : 'file', name: nazev });
  }

  // Tokeny: dvacet za deset minut na člověka stačí i na dávku fotek z akce.
  const brana = await hit(`nahravani-primo:${c.meId}`, 20, 10 * 60);
  if (!brana.ok) return NextResponse.json({ error: 'Moc nahrávání najednou. Zkus to za chvíli.' }, { status: 429 });
  try {
    const odpoved = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!patriPodPredponu(pathname, teamId, c.meId)) throw new Error('Cesta mimo vlastní složku.');
        let p: { name?: unknown; type?: unknown; size?: unknown } = {};
        try { p = JSON.parse(clientPayload ?? '{}'); } catch { /* prázdné */ }
        const mime = povolenyTyp(String(p.name ?? pathname), String(p.type ?? ''));
        if (!mime) throw new Error(HLASKA_TYP);
        return { allowedContentTypes: [mime], maximumSizeInBytes: MAX_PRIMO_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(odpoved);
  } catch (e) {
    const zprava = (e as Error)?.message === HLASKA_TYP ? HLASKA_TYP : 'Nahrání se nezdařilo.';
    return NextResponse.json({ error: zprava }, { status: 400 });
  }
}
