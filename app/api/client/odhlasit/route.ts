// Odhlášení z e-mailů od podniků odkazem z e-mailu. Bez přihlášení: platnost drží podpis v odkazu
// (lib/zpravyEmail). POST dělá změnu (poštovní klient ho umí poslat jedním klepnutím, hlavička
// List-Unsubscribe-Post), GET nic nemění a jen odpoví, komu odkaz patří — skenery odkazů v poště
// by jinak odhlásily každého, komu e-mail přišel.
//
// Souhlasy jsou po podnicích (spuštění, balík G): odkaz s podnikem odhlásí e-maily jen toho podniku
// (řádek v consents s kanálem „odkaz_email“), odkaz bez podniku (starší e-maily) všech.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { overTokenOdhlaseniPodniku } from '@/lib/zpravyEmail';
import { odvolejEmaily, obnovEmail, souhlasHostaPodniku } from '@/lib/consentsDb';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function zmenEmail(userId: number, zapnout: boolean): Promise<boolean> {
  try {
    const r = await sql`
      UPDATE users SET notif_prefs = COALESCE(notif_prefs, '{}'::jsonb) || jsonb_build_object('novinkyEmail', ${zapnout}::boolean, 'novinkyEmailAt', ${new Date().toISOString()}::text)
      WHERE id = ${userId} AND role = 'customer' RETURNING id`;
    return r.length > 0;
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  const t = new URL(req.url).searchParams.get('t');
  const tok = overTokenOdhlaseniPodniku(t);
  if (!tok) return NextResponse.json({ error: 'Odkaz na odhlášení není platný.' }, { status: 400 });
  try {
    const [u] = await sql`SELECT notif_prefs FROM users WHERE id = ${tok.userId} AND role = 'customer'`;
    if (!u) return NextResponse.json({ error: 'Odkaz na odhlášení není platný.' }, { status: 400 });
    if (tok.teamId != null) {
      const s = await souhlasHostaPodniku(tok.userId, tok.teamId);
      if (s) return NextResponse.json({ ok: true, odhlasen: !s.email });
    }
    return NextResponse.json({ ok: true, odhlasen: u.notif_prefs?.novinkyEmail === false });
  } catch {
    return NextResponse.json({ error: 'Odhlášení se nepodařilo načíst. Zkus to znovu.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const b = await req.json().catch(() => ({}));
  const tok = overTokenOdhlaseniPodniku(url.searchParams.get('t') ?? b.t);
  if (!tok) return NextResponse.json({ error: 'Odkaz na odhlášení není platný.' }, { status: 400 });
  const gate = await hit(`odhlasit:${klientIp(req.headers)}`, 30, 3600);
  if (!gate.ok) return NextResponse.json({ error: 'Moc pokusů za sebou. Zkus to za chvíli.' }, { status: 429 });
  // `zpet: true` vrátí e-maily zpět (kdo se odhlásil omylem). Souhlas s oznámeními v aplikaci se tím nemění.
  const zapnout = b.zpet === true;
  const [u] = await sql`SELECT id FROM users WHERE id = ${tok.userId} AND role = 'customer'`.catch(() => []) as any[];
  if (!u) return NextResponse.json({ error: 'Odkaz na odhlášení není platný.' }, { status: 400 });
  if (tok.teamId != null) {
    const ok = zapnout ? await obnovEmail(tok.userId, tok.teamId) : (await odvolejEmaily(tok.userId, tok.teamId)) !== null;
    if (ok) return NextResponse.json({ ok: true, odhlasen: !zapnout });
  } else if (!zapnout) {
    // Starý odkaz bez podniku: odvolat e-maily všech podniků (a níž i globální příznak).
    await odvolejEmaily(tok.userId, null);
  }
  if (!(await zmenEmail(tok.userId, zapnout))) return NextResponse.json({ error: 'Odhlášení se nepodařilo uložit. Zkus to znovu.' }, { status: 503 });
  return NextResponse.json({ ok: true, odhlasen: !zapnout });
}
