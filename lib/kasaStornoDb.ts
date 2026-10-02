// Storno poslední akce u kasy: zápis v databázi. Čistá logika je v lib/kasaStorno.ts.
//
// Zásady:
//  · akce se nejdřív „zabere“ (UPDATE ... SET undone_at WHERE undone_at IS NULL RETURNING): dvě obsluhy ani dvojklik
//    nevrátí totéž dvakrát; selže-li vracení, zábor se uvolní,
//  · vrací se přesně to, co akce zapsala do deníku věrnosti (ref `scan:<id>`), ne to, co by se spočítalo znovu
//    (pravidla se mezitím mohla změnit),
//  · body ani kredit nejdou pod nulu (jako všude): host mohl body mezitím utratit, obsluha uvidí skutečně vrácenou část,
//  · razítka z té akce se vrací společně s body (stornoPodleRef): razítko za návštěvu (`card:<den>`), ruční položky
//    a razítka z částky (`scan:<id>`); razítko, které už má po sobě další razítka, se nevrací (detail člena).

import { sql, awardDetail, awardCreditDetail } from './client';
import { upravUtratu } from './urovneDb';
import { stornoPodleRef, refPosledniNavstevy, vratNavstevu } from './stampsAdmin';
import {
  STORNO_MINUT, STORNOVATELNE, OPRAVNENI_STORNA, POPISEK_AKCE, castkaZOtisku, vetaNeniStorna, vetaStorna,
} from './kasaStorno';

let pripraveno: Promise<void> | null = null;

/** Sloupec undone_at v deníku akcí u kasy (stejný příkaz je v app/api/init/route.ts). */
export function zajistiStorno(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_scan_actions ADD COLUMN IF NOT EXISTS undone_at TIMESTAMP`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

/** Poslední akce hosta u kasy, kterou jde stornovat (mladší než STORNO_MINUT, nevrácená): pro tlačítko Storno. */
export async function posledniStornovatelna(teamId: number, customerId: number): Promise<{ note: string; at: string } | null> {
  try {
    await zajistiStorno();
    const [r] = await sql`
      SELECT action, fingerprint, created_at FROM client_scan_actions
      WHERE team_id = ${teamId} AND customer_id = ${customerId} AND undone_at IS NULL
        AND created_at > NOW() - (${STORNO_MINUT}::int * INTERVAL '1 minute')
      ORDER BY id DESC LIMIT 1` as any[];
    if (!r || !(STORNOVATELNE as readonly string[]).includes(String(r.action))) return null;
    const castka = String(r.action) === 'points' || String(r.action) === 'credit' ? castkaZOtisku(r.fingerprint) : 0;
    return { note: `${POPISEK_AKCE[String(r.action)]}${castka > 0 ? ` ${castka}` : ''}`, at: new Date(r.created_at).toISOString() };
  } catch { return null; }
}

export type VysledekStorna = { ok: true; message: string } | { ok: false; chyba: string; status: number };

/**
 * Stornuje poslední akci hosta u kasy (body z částky nebo platbu kreditem), pokud je mladší než STORNO_MINUT minut
 * a nikdo ji nevrátil. `opravneni` jsou oprávnění obsluhy: vrátit body smí ten, kdo je smí připsat.
 */
export async function stornujPosledniAkci(
  teamId: number, staffId: number, customerId: number, jmeno: string, opravneni: Set<string>, money: (n: number) => string,
): Promise<VysledekStorna> {
  await zajistiStorno();
  const [posledni] = await sql`
    SELECT id, action, fingerprint FROM client_scan_actions
    WHERE team_id = ${teamId} AND customer_id = ${customerId} AND undone_at IS NULL
      AND created_at > NOW() - (${STORNO_MINUT}::int * INTERVAL '1 minute')
    ORDER BY id DESC LIMIT 1` as any[];
  if (!posledni) return { ok: false, chyba: vetaNeniStorna('zadna'), status: 404 };
  const akce = String(posledni.action);
  if (!(STORNOVATELNE as readonly string[]).includes(akce)) return { ok: false, chyba: vetaNeniStorna('jina_akce', akce), status: 409 };
  if (!opravneni.has(OPRAVNENI_STORNA[akce])) {
    return { ok: false, chyba: akce === 'credit' ? 'Vracet platbu kreditem nemáš povoleno.' : 'Vracet body z částky nemáš povoleno.', status: 403 };
  }
  const id = Number(posledni.id);
  const ref = `scan:${id}`;
  // Zábor: jen jeden volající dostane řádek zpět.
  const zabrano = await sql`UPDATE client_scan_actions SET undone_at = NOW() WHERE id = ${id} AND team_id = ${teamId} AND undone_at IS NULL RETURNING id` as any[];
  if (!zabrano.length) return { ok: false, chyba: 'Tuhle akci už stornoval někdo jiný.', status: 409 };
  try {
    const [soucty] = await sql`
      SELECT COALESCE(SUM(delta), 0)::int AS body, COALESCE(SUM(credit_delta), 0)::int AS kredit
      FROM client_loyalty_ledger WHERE team_id = ${teamId} AND customer_id = ${customerId} AND ref = ${ref}` as any[];
    const bodyPuvodne = akce === 'points' || akce === 'credit' ? Number(soucty?.body) || 0 : 0;
    const kreditPuvodne = akce === 'points' || akce === 'credit' ? Number(soucty?.kredit) || 0 : 0;
    const utrata = akce === 'points' ? castkaZOtisku(posledni.fingerprint) : 0;
    // Razítka z téže akce: návštěva z kasy má odkaz `card:<den>`, ostatní akce `scan:<id>` (kampaně za položky a útratu `bill:scan:<id>`).
    const razitkovyRef = akce === 'stamp' ? await refPosledniNavstevy(teamId, customerId) : akce === 'items' || akce === 'points' ? [ref, `bill:${ref}`] : null;
    const sr = razitkovyRef ? await stornoPodleRef({ teamId, customerId, staffId, ref: razitkovyRef }) : { vety: [] as string[], chyba: null as string | null };
    if (bodyPuvodne === 0 && kreditPuvodne === 0 && utrata === 0 && sr.vety.length === 0) {
      await sql`UPDATE client_scan_actions SET undone_at = NULL WHERE id = ${id} AND team_id = ${teamId}`;
      return { ok: false, chyba: sr.chyba ?? vetaNeniStorna('nic_k_vraceni'), status: 409 };
    }
    // Návštěva, kterou akce zapsala, se nepočítá a uvolní se denní zámek razítka.
    if (sr.vety.length && (akce === 'stamp' || akce === 'points')) await vratNavstevu(teamId, customerId);
    let bodyVraceno = 0, kreditVraceno = 0;
    if (bodyPuvodne > 0) bodyVraceno = -(await awardDetail(teamId, customerId, -bodyPuvodne, 'manual', `undo:${ref}`, 'Storno poslední akce u kasy', staffId)).change;
    if (kreditPuvodne !== 0) {
      const z = await awardCreditDetail(teamId, customerId, -kreditPuvodne, 'manual', `undo:${ref}`, 'Storno poslední akce u kasy', staffId);
      kreditVraceno = Math.abs(z.change);
    }
    if (utrata > 0) await upravUtratu(teamId, customerId, -utrata);
    const razitka = [...sr.vety, ...(sr.chyba ? [`razítka z té akce se nevrátila celá: ${sr.chyba}`] : [])];
    return { ok: true, message: vetaStorna(jmeno, { bodyVraceno, bodyPuvodne, kreditVraceno, kreditPuvodne, utrata, razitka }, money) };
  } catch (e) {
    await sql`UPDATE client_scan_actions SET undone_at = NULL WHERE id = ${id} AND team_id = ${teamId}`.catch(() => {});
    throw e;
  }
}
