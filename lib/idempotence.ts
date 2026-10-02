// Idempotence akcí u kasy (databázová část; čistý klíč je v lib/idempotenceKlic.ts).
//
// Stejný klíč dvakrát = jedna akce. První volání klíč zabere (INSERT … ON
// CONFLICT DO NOTHING je atomický), provede akci a uloží odpověď; druhé volání
// vrátí uloženou odpověď s `opakovani: true`. Neúspěšná akce (4xx/5xx nebo
// výjimka) klíč uvolní, ať jde po opravě zkusit znovu se stejným klíčem.

import { NextResponse } from 'next/server';
import { sql } from './client';
import { ocistiKlic } from './idempotenceKlic';
import { zajistiRazitka } from './stampsSchema';
import { parseDbTime } from './pragueTime';

/** Rozpracovaná akce starší než tohle (ms) se bere za zapomenutou (spadl proces) a klíč se uvolní. */
const ZAPOMENUTA_MS = 120_000;

export async function sIdempotenci(teamId: number, req: Request, body: any, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  const klic = ocistiKlic(req.headers.get('idempotency-key') ?? body?.idempotencyKey);
  if (!klic) return fn();
  try { await zajistiRazitka(); } catch { return fn(); }
  let zabrano = await sql`
    INSERT INTO client_kasa_idem (team_id, idem_key) VALUES (${teamId}, ${klic})
    ON CONFLICT (team_id, idem_key) DO NOTHING RETURNING idem_key`;
  if (!zabrano.length) {
    const [r] = await sql`SELECT response, status, created_at FROM client_kasa_idem WHERE team_id = ${teamId} AND idem_key = ${klic}`;
    if (r?.response) return NextResponse.json({ ...r.response, opakovani: true }, { status: Number(r.status) || 200 });
    const vznik = parseDbTime(r?.created_at);
    const stari = vznik ? Date.now() - vznik.getTime() : 0;
    if (stari < ZAPOMENUTA_MS) return NextResponse.json({ error: 'Tahle akce se právě zpracovává. Počkej chvilku a zkontroluj stav hosta.' }, { status: 409 });
    // Zapomenutá: uvolnit a zabrat znovu (jen jeden ze souběžných pokusů uspěje).
    await sql`DELETE FROM client_kasa_idem WHERE team_id = ${teamId} AND idem_key = ${klic} AND response IS NULL`;
    zabrano = await sql`INSERT INTO client_kasa_idem (team_id, idem_key) VALUES (${teamId}, ${klic}) ON CONFLICT (team_id, idem_key) DO NOTHING RETURNING idem_key`;
    if (!zabrano.length) return NextResponse.json({ error: 'Tahle akce se právě zpracovává. Počkej chvilku.' }, { status: 409 });
  }
  if (Math.random() < 0.02) sql`DELETE FROM client_kasa_idem WHERE created_at < NOW() - INTERVAL '2 days'`.catch(() => {});
  let res: NextResponse;
  try { res = await fn(); }
  catch (e) { await sql`DELETE FROM client_kasa_idem WHERE team_id = ${teamId} AND idem_key = ${klic}`.catch(() => {}); throw e; }
  try {
    if (res.status >= 200 && res.status < 300) {
      const data = await res.clone().json().catch(() => null);
      if (data) await sql`UPDATE client_kasa_idem SET response = ${JSON.stringify(data)}::jsonb, status = ${res.status} WHERE team_id = ${teamId} AND idem_key = ${klic}`;
      else await sql`DELETE FROM client_kasa_idem WHERE team_id = ${teamId} AND idem_key = ${klic}`;
    } else {
      await sql`DELETE FROM client_kasa_idem WHERE team_id = ${teamId} AND idem_key = ${klic}`;
    }
  } catch { /* uložení odpovědi nesmí shodit už provedenou akci */ }
  return res;
}
