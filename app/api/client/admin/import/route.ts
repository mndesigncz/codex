// Přechod z jiné věrnostní aplikace (Kartička a podobné): import členů a jejich zůstatků.
//
// Klient čte soubor a posílá ho po dávkách (do 500 členů): POST { radky, nastaveni, nahled? }.
// S `nahled: true` se nic nezapisuje, jen se spočítá, kolik účtů vznikne a kolik hostů už existuje.
// GET vrací poslední importy podniku, DELETE ?id= import vrátí (viz lib/importKartickaDb.ts).
// Oprávnění `zakaznici.import` (citlivé: zakládá účty hostů a mění body a kredit).

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { hit } from '@/lib/rateLimit';
import { ocistiRadek } from '@/lib/importKarticka';
import { importujDavku, nahledDavky, seznamImportu, vratImport, MAX_DAVKA, type NastaveniImportu } from '@/lib/importKartickaDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

export async function GET() {
  const ctx = await pozaduj('zakaznici.import');
  if (jeOdpoved(ctx)) return ctx;
  try {
    return NextResponse.json({ importy: await seznamImportu(ctx.teamId) });
  } catch {
    return NextResponse.json({ importy: [], notMigrated: true });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.import');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const surove: any[] = Array.isArray(b.radky) ? b.radky : [];
  if (surove.length > MAX_DAVKA) return NextResponse.json({ error: `Nejvýš ${MAX_DAVKA} členů najednou.` }, { status: 400 });
  const radky = surove.map((r, i) => ocistiRadek(r, i + 2)).filter((r): r is NonNullable<typeof r> => !!r);

  try {
    if (b.nahled === true) return NextResponse.json({ nahled: await nahledDavky(ctx.teamId, radky) });

    // Zápis je drahý (bcrypt, stovky řádků): omezení proti smyčce ve skriptu, ne proti člověku s velkým souborem.
    const brana = await hit(`client-import:${ctx.teamId}`, 60, 60 * 60);
    if (!brana.ok) return NextResponse.json({ error: 'Příliš mnoho dávek za hodinu. Zkuste to za chvíli.' }, { status: 429 });

    const n = b.nastaveni ?? {};
    const nastaveni: NastaveniImportu = {
      zdroj: n.zdroj === 'csv' ? 'csv' : 'karticka',
      soubor: typeof n.soubor === 'string' ? n.soubor : null,
      existujici: n.existujici === 'nastavit' ? 'nastavit' : 'preskocit',
      kampanRazitek: Number.isFinite(Number(n.kampanRazitek)) && Number(n.kampanRazitek) > 0 ? Math.round(Number(n.kampanRazitek)) : null,
      skupiny: n.skupiny !== false,
      importId: Number.isFinite(Number(n.importId)) && Number(n.importId) > 0 ? Math.round(Number(n.importId)) : null,
    };
    return NextResponse.json({ ok: true, ...(await importujDavku(ctx.teamId, ctx.meId, radky, nastaveni)) });
  } catch (e: any) {
    const zprava = String(e?.message ?? '');
    // Chyby s českou větou (neznámá kampaň, vrácený import) jdou člověku, ostatní ne.
    const lidska = /^(Nejvýš|Import nenalezen|Tenhle import|Kampaň razítek)/.test(zprava);
    console.error('[import členů]', zprava);
    return NextResponse.json({ error: lidska ? zprava : 'Import se nepovedl. Nic se nezapsalo do poloviny: zkuste to znovu, případně import vraťte.' }, { status: lidska ? 400 : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.import');
  if (jeOdpoved(ctx)) return ctx;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '', 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí import.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await vratImport(ctx.teamId, ctx.meId, id)) });
  } catch (e: any) {
    const zprava = String(e?.message ?? '');
    const lidska = /^(Import nenalezen|Tenhle import)/.test(zprava);
    console.error('[vrácení importu]', zprava);
    return NextResponse.json({ error: lidska ? zprava : 'Vrácení se nepovedlo.' }, { status: lidska ? 400 : 500 });
  }
}
