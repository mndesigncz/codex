import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { neon } from '@neondatabase/serverless';
import { authOptions } from '@/lib/auth';
import { maOpravneni } from '@/lib/opravneniDb';
import { hit } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
import { escHtml } from '@/lib/email';
import { pragueToday } from '@/lib/pragueTime';
import { overOdkazZalohy } from '@/lib/pravni/zalohaOdkaz';
import { dumpTeam, POPIS_VYNECHANEHO } from '../_data';

export const dynamic = 'force-dynamic';
// Záloha stahuje obsah mnoha tabulek — default 10 s nestačí.
export const maxDuration = 60;

// Stažení zálohy z odkazu v denním e-mailu (GET ?t=<podepsaný token>).
//
// Tři zámky za sebou: podpis a platnost odkazu (7 dní), přihlášení a oprávnění
// data.zaloha v PODNIKU Z ODKAZU (ne v tom, který má člověk zrovna aktivní).
// Záloha se skládá až teď a jde rovnou ven — nikde se neukládá. Každé stažení
// je v historii změn podniku.
//
// Odkaz otevírá člověk v prohlížeči, ne aplikace — chyby jsou proto krátká
// stránka s větou a odkazem, ne JSON.

// Stránka mluví česky stejně jako e-mail se zálohou, ze kterého se na ni přichází
// (žádný layout aplikace s jazykem z cookie tu není).
const JAZYK_STRANKY = 'cs';

function stranka(nadpis: string, text: string, status: number, odkaz?: { href: string; popis: string }): NextResponse {
  const html = `<!doctype html><html lang="${JAZYK_STRANKY}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escHtml(nadpis)}</title></head>
<body style="margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F3F4F0;color:#16181A;">
<main style="max-width:440px;margin:0 auto;padding:48px 16px;">
<h1 style="font-size:22px;margin:0 0 8px;">${escHtml(nadpis)}</h1>
<p style="font-size:15px;line-height:1.5;color:rgba(22,24,26,.7);margin:0 0 20px;">${escHtml(text)}</p>
${odkaz ? `<a href="${escHtml(odkaz.href)}" style="display:inline-flex;align-items:center;min-height:44px;padding:0 22px;border-radius:999px;background:#16181A;color:#fff;text-decoration:none;font-weight:600;">${escHtml(odkaz.popis)}</a>` : ''}
</main></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t');
  const overeni = overOdkazZalohy(token, process.env.NEXTAUTH_SECRET);
  if (!overeni.ok) {
    return overeni.duvod === 'vyprsel'
      ? stranka('Odkaz už neplatí', 'Odkaz na zálohu platí 7 dní. Novější najdeš v posledním e-mailu se zálohou.', 410)
      : stranka('Odkaz nesedí', 'Tenhle odkaz na zálohu je neplatný nebo neúplný. Otevři ho přímo z e-mailu.', 400);
  }

  const session = await getServerSession(authOptions);
  const meId = Number((session?.user as { id?: unknown } | undefined)?.id);
  if (!session?.user || !Number.isFinite(meId)) {
    return stranka('Nejdřív se přihlas', 'Zálohu stáhne jen přihlášený člověk s oprávněním „Dostávat zálohu dat“. Přihlas se a otevři odkaz z e-mailu znovu.', 401, { href: '/login', popis: 'Přihlásit se' });
  }

  let smi = false;
  try { smi = await maOpravneni(meId, overeni.teamId, 'data.zaloha'); } catch {
    return stranka('Teď to nejde', 'Oprávnění se nepodařilo ověřit. Zkus to za chvíli znovu.', 503);
  }
  if (!smi) {
    return stranka('Na zálohu nemáš oprávnění', 'Zálohu tohoto podniku smí stáhnout jen člen s oprávněním „Dostávat zálohu dat“. Pokud ho máš mít, požádej vedení podniku.', 403, { href: '/', popis: 'Do aplikace' });
  }

  // Skládání zálohy je drahé: pár stažení za hodinu stačí.
  const brana = await hit(`zaloha-stazeni:${meId}`, 10, 60 * 60, { failClosed: true });
  if (!brana.ok) return stranka('Příliš mnoho stažení', 'Zkus to znovu za chvíli.', 429);

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const [team] = await sql`SELECT name FROM teams WHERE id = ${overeni.teamId}`;
    if (!team) return stranka('Podnik nenalezen', 'Podnik z odkazu už neexistuje.', 404);
    const { dump, rowCount } = await dumpTeam(sql, overeni.teamId);
    audit(overeni.teamId, meId, 'data.zaloha.stazeni', 'team', overeni.teamId, `${rowCount} řádků`);
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), team: team.name, rowCount, vynechano: POPIS_VYNECHANEHO, data: dump }, null, 2);
    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="managero-zaloha-${pragueToday()}.json"`,
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (e) {
    console.error('backup/stahnout', e);
    return stranka('Zálohu se nepodařilo vytvořit', 'Zkus to prosím znovu za chvíli.', 500);
  }
}
