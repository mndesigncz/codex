// Odkaz na podklady pro účetní bez účtu v aplikaci.
//
// GET ?t=<token> — VEŘEJNÉ (bez přihlášení): ověří podpis, platnost (14 dní) a verzi odkazů
//   podniku (po „Zneplatnit všechny odkazy" starý odkaz nesedí) a streamuje tentýž ZIP jako
//   stažení v aplikaci. Výplaty jen, když je odkaz nese (tvůrce měl finance.mzdy).
//   Odkaz otevírá účetní v prohlížeči — chyby jsou krátká stránka, ne JSON.
// POST { od, do, mzdy? } — vytvoří odkaz (finance.exportovat; příznak mezd jen s finance.mzdy).

import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { pozadujTarif } from '@/lib/tarifServer';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';
import { audit } from '@/lib/audit';
import { podpisoveTajemstvi } from '@/lib/tajemstvi';
import { escHtml } from '@/lib/email';
import { overObdobi } from '@/lib/ucetniExport';
import { overOdkazUcetni, platnaVerze } from '@/lib/ucetniOdkaz';
import { nactiPodnik } from '@/lib/ucetniExportDb';
import { odpovedSeZipem, vytvorOdkaz } from '@/lib/ucetniServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Stránka mluví česky jako e-mail účetní, ze kterého se na ni přichází (bez layoutu aplikace).
const JAZYK_STRANKY = 'cs';

function stranka(nadpis: string, text: string, status: number): NextResponse {
  const html = `<!doctype html><html lang="${JAZYK_STRANKY}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escHtml(nadpis)}</title></head>
<body style="margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F3F4F0;color:#16181A;">
<main style="max-width:440px;margin:0 auto;padding:48px 16px;">
<h1 style="font-size:22px;margin:0 0 8px;">${escHtml(nadpis)}</h1>
<p style="font-size:15px;line-height:1.5;color:rgba(22,24,26,.7);margin:0;">${escHtml(text)}</p>
</main></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' } });
}

export async function GET(req: Request) {
  // Hádání tokenů i opakované stahování brzdí počítadlo podle adresy.
  const brana = await hit(`ucetni-odkaz:${klientIp(req.headers)}`, 30, 60 * 60);
  if (!brana.ok) return stranka('Příliš mnoho pokusů', 'Zkuste to prosím znovu za chvíli.', 429);
  let tajemstvi: string | undefined;
  try { tajemstvi = podpisoveTajemstvi(); } catch { tajemstvi = undefined; }
  const o = overOdkazUcetni(new URL(req.url).searchParams.get('t'), tajemstvi);
  if (!o.ok) {
    return o.duvod === 'vyprsel'
      ? stranka('Odkaz už neplatí', 'Odkaz na podklady platí 14 dní. O nový požádejte podnik, který vám ho poslal.', 410)
      : stranka('Odkaz nesedí', 'Tenhle odkaz na podklady je neplatný nebo neúplný. Otevřete ho přímo z e-mailu.', 400);
  }
  let podnik;
  try { podnik = await nactiPodnik(o.obsah.teamId); } catch {
    return stranka('Teď to nejde', 'Podklady se nepodařilo připravit. Zkuste to za chvíli znovu.', 503);
  }
  if (!podnik) return stranka('Podnik nenalezen', 'Podnik z odkazu už v aplikaci není.', 404);
  if (!platnaVerze(o.obsah, podnik.verze)) {
    return stranka('Odkaz byl zrušen', 'Podnik tenhle odkaz zneplatnil. O nový požádejte podnik, který vám ho poslal.', 410);
  }
  const obdobi = overObdobi(o.obsah.od, o.obsah.do);
  if (!obdobi.ok) return stranka('Odkaz nesedí', 'Období v odkazu je neplatné.', 400);
  try {
    const r = await odpovedSeZipem(o.obsah.teamId, obdobi.od, obdobi.do, { mzdy: o.obsah.mzdy, kdo: null, zdroj: 'odkaz' });
    return r ?? stranka('Podnik nenalezen', 'Podnik z odkazu už v aplikaci není.', 404);
  } catch (e) {
    console.error('ucetni/odkaz', e);
    return stranka('Podklady se nepodařilo připravit', 'Zkuste to prosím znovu za chvíli.', 500);
  }
}

export async function POST(req: Request) {
  const c = await pozaduj('finance.exportovat');
  if (jeOdpoved(c)) return c;
  const tarif = await pozadujTarif(c.teamId, 'pro');
  if (tarif) return tarif;
  const b = await req.json().catch(() => ({}));
  const o = overObdobi(b?.od, b?.do);
  if (!o.ok) return NextResponse.json({ error: o.chyba }, { status: 400 });
  const mzdy = b?.mzdy === true && c.role.opravneni.has('finance.mzdy');
  const odkaz = await vytvorOdkaz(c.teamId, o.od, o.do, mzdy);
  if (!odkaz) return NextResponse.json({ error: 'Odkaz se teď nepodařilo vytvořit. Zkus to za chvíli znovu.' }, { status: 503 });
  audit(c.teamId, c.meId, 'ucetni.odkaz', 'team', c.teamId, `${o.od} – ${o.do}${mzdy ? ' · s výplatami' : ''}`); // i18n-ok (detail auditu)
  return NextResponse.json({ ok: true, url: odkaz.url, vyprsi: odkaz.vyprsi, sMzdami: mzdy });
}
