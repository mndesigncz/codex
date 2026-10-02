// Automatizace zpráv členům: uvítací série, po první návštěvě, po dokončení karty,
// narozeninový kupon a „Chybíš nám“. GET vrací nastavení všech pravidel, počty a deník odeslání,
// PUT uloží jedno pravidlo, POST s akce:'test' pošle zkoušku jen autorovi.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { zajistiSchemaClenu } from '@/lib/clenoveSchema';
import { nactiAutomatizace, ulozAutomatizaci, logAutomatizace, poctyAutomatizace } from '@/lib/automatizaceDb';
import { jeDruhAutomatizace, zpravaAutomatizace } from '@/lib/automatizace';
import { zkusebniZprava } from '@/lib/broadcasts';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const ctx = await pozaduj('zakaznici.zpravy');
  if (jeOdpoved(ctx)) return ctx;
  await zajistiSchemaClenu();
  const [stavy, pocty, log] = await Promise.all([
    nactiAutomatizace(ctx.teamId),
    poctyAutomatizace(ctx.teamId),
    // Jména členů v deníku vidí jen ten, kdo smí členy vidět.
    logAutomatizace(ctx.teamId, null, 40, ctx.role.opravneni.has('zakaznici.zobrazit')),
  ]);
  let kupony: any[] = [];
  try { kupony = await sql`SELECT id, title FROM client_coupons WHERE team_id = ${ctx.teamId} AND active = TRUE AND kind = 'offer' ORDER BY title, id LIMIT 100` as any[]; } catch { kupony = []; }
  return NextResponse.json({
    pravidla: stavy,
    pocty,
    log,
    kupony: kupony.map(k => ({ id: Number(k.id), title: String(k.title) })),
    muzePravidla: ctx.role.opravneni.has('vernost.pravidla'),
  });
}

export async function PUT(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zpravy');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  if (!jeDruhAutomatizace(b.druh)) return NextResponse.json({ error: 'Neznámá automatizace.' }, { status: 400 });
  const r = await ulozAutomatizaci(ctx.teamId, ctx.meId, b.druh, b.enabled === true, b.config, ctx.role.opravneni.has('vernost.pravidla'));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, pravidlo: r.stav });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.zpravy');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  if (b.akce !== 'test' || !jeDruhAutomatizace(b.druh)) return NextResponse.json({ error: 'Neznámá akce.' }, { status: 400 });
  const stav = (await nactiAutomatizace(ctx.teamId)).find(s => s.druh === b.druh);
  if (!stav) return NextResponse.json({ error: 'Neznámá automatizace.' }, { status: 400 });
  // Zkouška se řídí tím, co je právě na obrazovce (nemusí být uložené), jinak uloženým nastavením.
  const cfg = b.config && typeof b.config === 'object' ? b.config : stav.config;
  const krok = Math.max(0, Math.round(Number(b.krok)) || 0);
  const zdroj = b.druh === 'uvitani' ? cfg?.kroky?.[krok] : cfg;
  const zprava = zpravaAutomatizace(b.druh, cfg, { jmeno: 'Jano', podnik: 'váš podnik', dny: Number(cfg?.dny) || undefined, body: Number(cfg?.body_bodu) || 0 }, krok);
  if (!zprava) return NextResponse.json({ error: 'Zpráva potřebuje nadpis.' }, { status: 400 });
  const r = await zkusebniZprava(ctx.meId, ctx.teamId, { title: zprava.title, body: zprava.body, audience: 'all', channels: 'push+email', linkKind: 'loyalty', scheduledAt: null, couponId: zdroj?.kuponId ?? null, promoId: null });
  if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: 400 });
  return NextResponse.json({ ok: true, ...r.v });
}
