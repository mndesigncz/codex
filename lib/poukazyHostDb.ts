// Dárkové poukazy a host: poukaz v aplikaci hosta (customer_id), body za nákup poukazu, nastavení poukazů
// a data pro export do účetnictví. Čistá logika je v lib/poukazy.ts a lib/poukazyUcetni.ts.
//
// Zásady (jako v lib/poukazyDb.ts):
//  · přiřazení a převzetí jsou JEDEN příkaz s podmínkou ve WHERE (host převezme poukaz, jen když ho nemá nikdo jiný),
//  · body za nákup se nejdřív „zaberou“ (UPDATE ... WHERE points_awarded = 0 RETURNING), pak se připíšou a při chybě
//    se zábor vrátí: dvojklik ani opakování nepřipíše body dvakrát,
//  · hostovi se nikdy nevrací jména z poukazu (obdarovaný, kupující), poznámka ani e-mail.

import { sql, award } from './client';
import { audit } from './audit';
import { pragueDayOf, parseDbTime } from './pragueTime';
import { menaPodniku } from './menaPodniku';
import { zajistiTabulkyPoukazu, poukazPodleId, type Poukaz } from './poukazyDb';
import { bodyZaNakupPoukazu, stavPoukazu, type NastaveniPoukazu, type StavPoukazu } from './poukazy';
import type { PohybPoukazu, RadekSouhrnu } from './poukazyUcetni';

// ---- Nastavení --------------------------------------------------------------------------------------

export async function nactiNastaveniPoukazu(teamId: number): Promise<NastaveniPoukazu> {
  try {
    await zajistiTabulkyPoukazu();
    const [r] = await sql`SELECT voucher_min_bill, voucher_points_per_100 FROM client_profiles WHERE team_id = ${teamId}`;
    return { minUtrata: Math.max(0, Math.trunc(Number(r?.voucher_min_bill)) || 0), bodyZaNakup: Math.max(0, Math.trunc(Number(r?.voucher_points_per_100)) || 0) };
  } catch { return { minUtrata: 0, bodyZaNakup: 0 }; }
}

/** Uloží nastavení (už ověřené normalizujNastaveniPoukazu) a zapíše do historie změn. False = podnik nemá profil. */
export async function ulozNastaveniPoukazu(teamId: number, userId: number, n: NastaveniPoukazu): Promise<boolean> {
  await zajistiTabulkyPoukazu();
  const rows = await sql`UPDATE client_profiles SET voucher_min_bill = ${n.minUtrata}, voucher_points_per_100 = ${n.bodyZaNakup} WHERE team_id = ${teamId} RETURNING team_id` as any[];
  if (!rows.length) return false;
  await audit(teamId, userId, 'klient.poukaz.nastaveni', 'client_profile', teamId,
    `poukazy: uplatnění od účtu ${n.minUtrata || 'bez podmínky'}, bodů za nákup ${n.bodyZaNakup || 'žádné'} za 100`);
  return true;
}

/** Je zapnuté „kredit a poukaz bez bodů“? (Pravidlo bodů: z části zaplacené poukazem body nejsou.) */
export async function poukazBezBodu(teamId: number): Promise<boolean> {
  try {
    const [r] = await sql`SELECT points_exclude_prepaid FROM client_profiles WHERE team_id = ${teamId}`;
    return r?.points_exclude_prepaid !== false;
  } catch { return true; }
}

/** Změna šablony vzhledu existujícího poukazu (tisk a e-mail). Zrušený poukaz se neupravuje. */
export async function zmenVzhled(teamId: number, userId: number, id: number, design: string, dnes: string): Promise<Poukaz | null> {
  await zajistiTabulkyPoukazu();
  const rows = await sql`UPDATE client_vouchers SET design = ${design} WHERE id = ${id} AND team_id = ${teamId} AND status <> 'void' RETURNING code` as any[];
  if (!rows.length) return null;
  await audit(teamId, userId, 'klient.poukaz.upraven', 'client_voucher', id, `${rows[0].code}: vzhled ${design}`);
  return poukazPodleId(teamId, id, dnes);
}

// ---- Poukaz v aplikaci hosta --------------------------------------------------------------------------

/** Člen podniku (jen člen může být majitelem nebo kupujícím poukazu). Vrací jméno, nebo null. */
export async function jmenoClena(teamId: number, customerId: number): Promise<string | null> {
  const [r] = await sql`
    SELECT u.name FROM client_memberships m JOIN users u ON u.id = m.customer_id
    WHERE m.team_id = ${teamId} AND m.customer_id = ${customerId}`;
  return r ? String(r.name ?? '') : null;
}

/** Správce přiřadí poukaz hostovi (nebo ho odpojí: customerId = null). Zrušený poukaz se nepřiřazuje. */
export async function priradPoukaz(teamId: number, userId: number, id: number, customerId: number | null, dnes: string): Promise<{ ok: true; poukaz: Poukaz } | { ok: false; chyba: string; status: number }> {
  await zajistiTabulkyPoukazu();
  let jmeno: string | null = null;
  if (customerId != null) {
    jmeno = await jmenoClena(teamId, customerId);
    if (jmeno == null) return { ok: false, chyba: 'Tenhle host není členem podniku.', status: 404 };
  }
  const rows = await sql`
    UPDATE client_vouchers SET customer_id = ${customerId}::int, claimed_at = CASE WHEN ${customerId}::int IS NULL THEN NULL ELSE NOW() END
    WHERE id = ${id} AND team_id = ${teamId} AND status <> 'void' RETURNING id, code` as any[];
  if (!rows.length) return { ok: false, chyba: 'Poukaz nenalezen, nebo je zrušený.', status: 404 };
  await audit(teamId, userId, 'klient.poukaz.prirazen', 'client_voucher', id,
    customerId == null ? `${rows[0].code}: odpojen od hosta` : `${rows[0].code}: přiřazen hostovi ${jmeno || `č. ${customerId}`}`);
  const p = await poukazPodleId(teamId, id, dnes);
  return p ? { ok: true, poukaz: p } : { ok: false, chyba: 'Poukaz nenalezen.', status: 404 };
}

/**
 * Host si poukaz přidá do aplikace podle kódu. Smí to jen u platného poukazu, který nepatří nikomu jinému;
 * stejný host to může zopakovat (idempotentní). Každé selhání je pro hosta stejné `false`, ať se nedá hádat, které
 * kódy existují (stejně jako u náhledu zůstatku). Podmínka je v jednom UPDATE: dva hosté s týmž kódem poukaz nepřevezmou oba.
 */
export async function prevezmiPoukaz(teamId: number, customerId: number, kod: string, dnes: string): Promise<boolean> {
  await zajistiTabulkyPoukazu();
  const rows = await sql`
    UPDATE client_vouchers SET customer_id = ${customerId}, claimed_at = COALESCE(claimed_at, NOW())
    WHERE team_id = ${teamId} AND code = ${kod} AND status = 'active' AND balance > 0
      AND (valid_until IS NULL OR valid_until >= ${dnes}::date)
      AND (customer_id IS NULL OR customer_id = ${customerId})
    RETURNING id, code` as any[];
  if (rows.length) await audit(teamId, customerId, 'klient.poukaz.prevzat', 'client_voucher', Number(rows[0].id), `${rows[0].code}: host si ho přidal do aplikace`);
  return rows.length > 0;
}

/** Host poukaz z aplikace odebere (zůstane platný, jen přestane být „jeho“). Jen vlastní poukaz. */
export async function odeberPoukazHostovi(customerId: number, id: number): Promise<boolean> {
  await zajistiTabulkyPoukazu();
  const rows = await sql`UPDATE client_vouchers SET customer_id = NULL, claimed_at = NULL WHERE id = ${id} AND customer_id = ${customerId} RETURNING team_id, code` as any[];
  if (rows.length) await audit(Number(rows[0].team_id), customerId, 'klient.poukaz.odebran', 'client_voucher', id, `${rows[0].code}: host ho odebral ze své aplikace`);
  return rows.length > 0;
}

export interface PoukazHosta {
  id: number; code: string; balance: number; value: number; currency: string; validUntil: string | null; stav: StavPoukazu;
  design: string; business: string; slug: string | null;
}

/**
 * Poukazy hosta napříč podniky: platné i vyčerpané a propadlé (host ví, proč už nejdou použít), zrušené ne.
 * Bez jmen, poznámek a e-mailů. Chyba nebo chybějící sloupec = žádné poukazy (stránka Moje nesmí spadnout).
 */
export async function poukazyHosta(customerId: number, dnes: string): Promise<PoukazHosta[]> {
  try {
    await zajistiTabulkyPoukazu();
    const rows = await sql`
      SELECT v.id, v.code, v.balance, v.value_amount, v.currency, to_char(v.valid_until, 'YYYY-MM-DD') AS valid_until, v.status, v.design,
             p.slug, COALESCE(NULLIF(t.share_theme->>'businessName', ''), t.name) AS business
      FROM client_vouchers v
      JOIN teams t ON t.id = v.team_id LEFT JOIN client_profiles p ON p.team_id = v.team_id
      WHERE v.customer_id = ${customerId} AND v.status <> 'void'
      ORDER BY (v.balance > 0 AND (v.valid_until IS NULL OR v.valid_until >= ${dnes}::date)) DESC, v.valid_until NULLS LAST, v.id DESC
      LIMIT 50` as any[];
    return rows.map(r => ({
      id: Number(r.id), code: String(r.code), balance: Number(r.balance), value: Number(r.value_amount), currency: String(r.currency),
      validUntil: r.valid_until ?? null, stav: stavPoukazu({ value_amount: Number(r.value_amount), balance: Number(r.balance), valid_until: r.valid_until ?? null, status: String(r.status) }, dnes),
      design: String(r.design ?? 'klasik'), business: String(r.business ?? ''), slug: r.slug ?? null,
    }));
  } catch { return []; }
}

// ---- Body za nákup poukazu ------------------------------------------------------------------------------

/**
 * Připíše kupujícímu členovi body za nákup poukazu (nastavení: bodů za každých 100). Jednou za poukaz.
 * Nic se nepřipíše, když body nejsou zapnuté, poukaz nemá kupujícího nebo už byly připsány. Vrací počet bodů.
 */
export async function pripisBodyZaNakup(teamId: number, poukaz: Pick<Poukaz, 'id' | 'code' | 'value_amount' | 'buyer_customer_id'>): Promise<number> {
  if (poukaz.buyer_customer_id == null) return 0;
  const nastaveni = await nactiNastaveniPoukazu(teamId);
  const body = bodyZaNakupPoukazu(poukaz.value_amount, nastaveni.bodyZaNakup);
  if (body <= 0) return 0;
  // Zábor: jen jeden volající, který viděl points_awarded = 0, dostane řádek zpět.
  const zabrano = await sql`
    UPDATE client_vouchers SET points_awarded = ${body}
    WHERE id = ${poukaz.id} AND team_id = ${teamId} AND points_awarded = 0 AND buyer_customer_id = ${poukaz.buyer_customer_id}
    RETURNING id` as any[];
  if (!zabrano.length) return 0;
  try {
    await award(teamId, poukaz.buyer_customer_id, body, 'manual', `voucher:${poukaz.id}`, 'Nákup dárkového poukazu');
  } catch (e) {
    await sql`UPDATE client_vouchers SET points_awarded = 0 WHERE id = ${poukaz.id} AND team_id = ${teamId}`.catch(() => {});
    throw e;
  }
  return body;
}

// ---- Export do účetnictví -----------------------------------------------------------------------------------

/** Pohyby poukazů v měsících od–do (pražské měsíce): prodeje (založení) a uplatnění, vrácení a zrušení. */
export async function pohybyProExport(teamId: number, odMesic: string, doMesic: string): Promise<PohybPoukazu[]> {
  await zajistiTabulkyPoukazu();
  const od = `${odMesic}-01`;
  const [rok, mes] = doMesic.split('-').map(Number);
  const konec = mes === 12 ? `${rok + 1}-01-01` : `${rok}-${String(mes + 1).padStart(2, '0')}-01`;
  // created_at je UTC bez zóny: rozsah se bere v pražském čase, a pohyb po půlnoci patří do pražského dne.
  const [prodeje, pouziti] = await Promise.all([
    sql`
      SELECT v.created_at AS at, v.code, v.value_amount AS amount, v.value_amount AS balance_after, v.currency, us.name AS by_name, v.note
      FROM client_vouchers v LEFT JOIN users us ON us.id = v.created_by
      WHERE v.team_id = ${teamId}
        AND (v.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague' >= ${od}::date
        AND (v.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague' < ${konec}::date
      ORDER BY v.created_at LIMIT 20000` as unknown as Promise<any[]>,
    sql`
      SELECT u.created_at AS at, v.code, u.kind, u.amount, u.balance_after, v.currency, us.name AS by_name, u.note
      FROM client_voucher_uses u JOIN client_vouchers v ON v.id = u.voucher_id AND v.team_id = u.team_id LEFT JOIN users us ON us.id = u.by_user
      WHERE u.team_id = ${teamId}
        AND (u.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague' >= ${od}::date
        AND (u.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague' < ${konec}::date
      ORDER BY u.created_at LIMIT 20000` as unknown as Promise<any[]>,
  ]);
  const out: PohybPoukazu[] = [];
  for (const r of prodeje) out.push({ at: r.at, kind: 'sale', code: String(r.code), amount: Number(r.amount), balance_after: Number(r.balance_after), currency: String(r.currency), by_name: r.by_name ?? null, note: r.note ?? null });
  for (const r of pouziti) {
    const kind = ['use', 'refund', 'void'].includes(String(r.kind)) ? String(r.kind) as PohybPoukazu['kind'] : 'use';
    out.push({ at: r.at, kind, code: String(r.code), amount: Number(r.amount), balance_after: r.balance_after != null ? Number(r.balance_after) : null, currency: String(r.currency), by_name: r.by_name ?? null, note: r.note ?? null });
  }
  return out;
}

/** Měsíční souhrn pro export (jen poukazy v měně podniku, jako přehled). Měsíce bez pohybu dostanou nuly. */
export async function souhrnProExport(teamId: number, odMesic: string, doMesic: string): Promise<{ radky: RadekSouhrnu[]; mena: string }> {
  const mena = (await menaPodniku(teamId)).currency;
  const pohyby = (await pohybyProExport(teamId, odMesic, doMesic)).filter(p => p.currency.toUpperCase() === mena.toUpperCase());
  const mesice: string[] = [];
  for (let m = odMesic; m <= doMesic;) {
    mesice.push(m);
    const [r, c] = m.split('-').map(Number);
    m = c === 12 ? `${r + 1}-01` : `${r}-${String(c + 1).padStart(2, '0')}`;
  }
  const mapa = new Map<string, RadekSouhrnu>(mesice.map(m => [m, { mesic: m, pocetProdanych: 0, prodano: 0, uplatneno: 0, vraceno: 0, cistoUplatneno: 0 }]));
  for (const p of pohyby) {
    const d = parseDbTime(p.at as any);
    const r = d ? mapa.get(pragueDayOf(d).slice(0, 7)) : undefined;
    if (!r) continue;
    if (p.kind === 'sale') { r.pocetProdanych++; r.prodano += p.amount; }
    else if (p.kind === 'use') r.uplatneno += p.amount;
    else if (p.kind === 'refund') r.vraceno += p.amount;
  }
  for (const r of mapa.values()) r.cistoUplatneno = r.uplatneno - r.vraceno;
  return { radky: [...mapa.values()], mena };
}
