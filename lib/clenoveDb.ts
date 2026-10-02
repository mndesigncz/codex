// Členové podniku v databázi: sloučení duplicit, smazání člena, hromadné body a kupony,
// příjemci zpráv. Čistá logika je v lib/clenoveSeznam.ts a lib/zpravyEmail.ts.
//
// Schéma nemá cizí klíče ani transakce přes HTTP ovladač, proto je pořadí kroků
// vždy takové, aby přerušení v půlce nic neztratilo: nejdřív se atomicky „přivlastní“
// řádek (DELETE … RETURNING), teprve pak se jeho hodnoty přičtou jinam.

import { sql, couponCode } from './client';
import { zajistiSchemaClenu } from './clenoveSchema';
import { audit } from './audit';
import type { PrijemceZpravy } from './zpravyEmail';

export async function jeZablokovan(teamId: number, customerId: number): Promise<boolean> {
  try {
    const [r] = await sql`SELECT blocked FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
    return r?.blocked === true;
  } catch { return false; }
}

/** Člen se jménem, kontaktem, souhlasy a blokací — to, co potřebuje rozesílka. Bez `ids` všichni členové podniku. */
export interface PrijemceSDetaily extends PrijemceZpravy { name: string; lang: string | null }

export async function nactiPrijemce(teamId: number, ids?: number[]): Promise<PrijemceSDetaily[]> {
  await zajistiSchemaClenu();
  const rows = (ids
    ? await sql`
        SELECT m.customer_id AS id, us.name, us.email, us.lang, us.notif_prefs AS prefs, m.blocked
        FROM client_memberships m JOIN users us ON us.id = m.customer_id
        WHERE m.team_id = ${teamId} AND m.customer_id = ANY(${ids})`
    : await sql`
        SELECT m.customer_id AS id, us.name, us.email, us.lang, us.notif_prefs AS prefs, m.blocked
        FROM client_memberships m JOIN users us ON us.id = m.customer_id
        WHERE m.team_id = ${teamId}`) as any[];
  return rows.map(r => ({
    id: Number(r.id), name: String(r.name ?? ''), email: r.email ?? null, lang: r.lang ?? null,
    blocked: r.blocked === true, prefs: r.prefs && typeof r.prefs === 'object' ? r.prefs : null,
  }));
}

/** Členové ručně sestavené skupiny nebo, když má pravidlo, členové podle pravidla (řeší lib/broadcasts). */
export async function clenoveRucniSkupiny(teamId: number, groupId: number): Promise<number[]> {
  const rows = await sql`SELECT customer_id FROM client_group_members WHERE team_id = ${teamId} AND group_id = ${groupId}` as any[];
  return rows.map(r => Number(r.customer_id));
}

// ---- Sloučení duplicit ---------------------------------------------------------------

export type VysledekSlouceni =
  | { ok: true; body: number; navstev: number; presunuto: { denik: number; kupony: number } }
  | { ok: false; status: number; error: string };

/**
 * Sloučí členství `duplicitaId` do `hlavniId` v jednom podniku: body, razítka, návštěvy, útrata a kredit
 * se sečtou, deník, kupony, rezervace, objednávky a skupiny přejdou na hlavního člena. Účet duplicity
 * zůstává (je to cizí člověk s heslem), jen přijde o členství v tomhle podniku.
 */
export async function slucClena(teamId: number, hlavniId: number, duplicitaId: number, kdoId: number | null): Promise<VysledekSlouceni> {
  if (!Number.isInteger(hlavniId) || !Number.isInteger(duplicitaId) || hlavniId === duplicitaId) {
    return { ok: false, status: 400, error: 'Vyber dva různé členy.' };
  }
  await zajistiSchemaClenu();
  const [h] = await sql`SELECT m.*, us.name FROM client_memberships m JOIN users us ON us.id = m.customer_id WHERE m.team_id = ${teamId} AND m.customer_id = ${hlavniId}`;
  const [dn] = await sql`SELECT m.*, us.name FROM client_memberships m JOIN users us ON us.id = m.customer_id WHERE m.team_id = ${teamId} AND m.customer_id = ${duplicitaId}`;
  if (!h || !dn) return { ok: false, status: 404, error: 'Jeden z členů v podniku není.' };

  // Přivlastnění: kdo smaže řádek duplicity, ten ho sloučí. Druhý souběžný pokus nic nenajde.
  const [d] = await sql`DELETE FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ${duplicitaId} RETURNING *`;
  if (!d) return { ok: false, status: 409, error: 'Tohle sloučení už proběhlo.' };

  const poznD = String(d.note ?? '').trim() || null;
  await sql`
    UPDATE client_memberships SET
      points = points + ${Number(d.points) || 0},
      stamps = stamps + ${Number(d.stamps) || 0},
      visits = visits + ${Number(d.visits) || 0},
      spend = spend + ${Number(d.spend) || 0},
      credit = credit + ${Number(d.credit) || 0},
      joined_at = LEAST(joined_at, ${d.joined_at ?? null}::timestamp),
      last_visit_at = GREATEST(last_visit_at, ${d.last_visit_at ?? null}::timestamp),
      blocked = (blocked OR ${d.blocked === true}),
      note = CASE WHEN ${poznD}::text IS NULL THEN note
                  WHEN note IS NULL OR note = '' THEN ${poznD}::text
                  ELSE LEFT(note || ' | ' || ${poznD}::text, 500) END
    WHERE team_id = ${teamId} AND customer_id = ${hlavniId}`;

  const denik = await sql`UPDATE client_loyalty_ledger SET customer_id = ${hlavniId} WHERE team_id = ${teamId} AND customer_id = ${duplicitaId} RETURNING id` as any[];
  const kupony = await sql`UPDATE client_coupon_claims SET customer_id = ${hlavniId} WHERE team_id = ${teamId} AND customer_id = ${duplicitaId} RETURNING id` as any[];
  await sql`UPDATE client_reservations SET customer_id = ${hlavniId} WHERE team_id = ${teamId} AND customer_id = ${duplicitaId}`;
  await sql`UPDATE client_orders SET customer_id = ${hlavniId} WHERE team_id = ${teamId} AND customer_id = ${duplicitaId}`;
  await sql`UPDATE client_vouchers SET customer_id = ${hlavniId} WHERE team_id = ${teamId} AND customer_id = ${duplicitaId}`;
  await sql`UPDATE client_bill_awards SET customer_id = ${hlavniId} WHERE team_id = ${teamId} AND customer_id = ${duplicitaId}`;
  // Hodnocení mají unikát (host, odkaz): přesune se jen to, co hlavní člen nemá.
  await sql`
    UPDATE client_reviews SET customer_id = ${hlavniId}
    WHERE team_id = ${teamId} AND customer_id = ${duplicitaId}
      AND NOT EXISTS (SELECT 1 FROM client_reviews r2 WHERE r2.customer_id = ${hlavniId} AND r2.ref = client_reviews.ref)`;
  // Skupiny: členství duplicity přejde na hlavního, zbytek zmizí.
  await sql`
    INSERT INTO client_group_members (group_id, customer_id, team_id)
    SELECT group_id, ${hlavniId}, team_id FROM client_group_members WHERE team_id = ${teamId} AND customer_id = ${duplicitaId}
    ON CONFLICT (group_id, customer_id) DO NOTHING`;
  await sql`DELETE FROM client_group_members WHERE team_id = ${teamId} AND customer_id = ${duplicitaId}`;
  // Razítkové karty: kde mají oba rozdělanou stejnou kampaň, razítka se sečtou.
  await sql`
    UPDATE client_stamp_progress SET
      stamps = client_stamp_progress.stamps + dup.stamps,
      completed = client_stamp_progress.completed + dup.completed,
      started_at = LEAST(client_stamp_progress.started_at, dup.started_at),
      last_stamp_at = GREATEST(client_stamp_progress.last_stamp_at, dup.last_stamp_at),
      last_completed_at = GREATEST(client_stamp_progress.last_completed_at, dup.last_completed_at)
    FROM client_stamp_progress dup
    WHERE client_stamp_progress.team_id = ${teamId} AND client_stamp_progress.customer_id = ${hlavniId}
      AND dup.team_id = ${teamId} AND dup.customer_id = ${duplicitaId} AND dup.campaign_id = client_stamp_progress.campaign_id`;
  await sql`
    DELETE FROM client_stamp_progress
    WHERE team_id = ${teamId} AND customer_id = ${duplicitaId}
      AND campaign_id IN (SELECT campaign_id FROM client_stamp_progress p2 WHERE p2.team_id = ${teamId} AND p2.customer_id = ${hlavniId})`;
  await sql`UPDATE client_stamp_progress SET customer_id = ${hlavniId} WHERE team_id = ${teamId} AND customer_id = ${duplicitaId}`;
  await sql`DELETE FROM client_automatizace_log WHERE team_id = ${teamId} AND customer_id = ${duplicitaId}`;
  await sql`
    INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note)
    VALUES (${teamId}, ${hlavniId}, 0, 'manual', ${`slouceni:${duplicitaId}`}, ${`Sloučeno s členem ${String(dn.name).slice(0, 60)} (${Number(d.points) || 0} bodů, ${Number(d.visits) || 0} návštěv)`})`;
  void audit(teamId, kdoId, 'client.clen.slouceni', 'client', hlavniId, `${dn.name} → ${h.name} · ${Number(d.points) || 0} bodů`);
  return { ok: true, body: Number(h.points) + (Number(d.points) || 0), navstev: Number(h.visits) + (Number(d.visits) || 0), presunuto: { denik: denik.length, kupony: kupony.length } };
}

// ---- Smazání člena -------------------------------------------------------------------

export type VysledekSmazani = { ok: true; name: string; body: number } | { ok: false; status: number; error: string };

/**
 * Odebere člena z podniku: členství, body, razítka, kupony, deník a skupiny. Účet hosta zůstává (může být
 * členem jinde); rezervace, objednávky a poukazy patří podniku a zůstávají.
 */
export async function smazClenaZPodniku(teamId: number, customerId: number, kdoId: number | null): Promise<VysledekSmazani> {
  if (!Number.isInteger(customerId)) return { ok: false, status: 400, error: 'Neplatný člen.' };
  await zajistiSchemaClenu();
  const [u] = await sql`SELECT name FROM users WHERE id = ${customerId}`;
  const [m] = await sql`DELETE FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ${customerId} RETURNING points`;
  if (!m) return { ok: false, status: 404, error: 'Člen v podniku není.' };
  await sql`DELETE FROM client_group_members WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
  await sql`DELETE FROM client_stamp_progress WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
  await sql`DELETE FROM client_coupon_claims WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
  await sql`DELETE FROM client_loyalty_ledger WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
  await sql`DELETE FROM client_automatizace_log WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
  void audit(teamId, kdoId, 'client.clen.smazan', 'client', customerId, `${u?.name ?? 'člen'} · ${Number(m.points) || 0} bodů`);
  return { ok: true, name: String(u?.name ?? ''), body: Number(m.points) || 0 };
}

// ---- Hromadné akce ------------------------------------------------------------------

export const MAX_HROMADNE = 2000;

/** Jen členové tohoto podniku, bez duplicit a nesmyslů. Cizí id se tiše zahodí. */
export async function platniClenove(teamId: number, ids: unknown): Promise<number[]> {
  const vstup = Array.isArray(ids) ? ids.map(x => Math.round(Number(x))).filter(n => Number.isInteger(n) && n > 0) : [];
  const unikatni = Array.from(new Set(vstup)).slice(0, MAX_HROMADNE);
  if (!unikatni.length) return [];
  const rows = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ANY(${unikatni})` as any[];
  return rows.map(r => Number(r.customer_id));
}

/**
 * Body všem vybraným najednou: jedním příkazem a jedním řádkem deníku na člena. Záporné číslo odečte
 * (nikdy pod nulu). Blokovaným členům se body nepřičítají.
 */
export async function hromadneBody(teamId: number, ids: number[], delta: number, poznamka: string, kdoId: number | null): Promise<{ upraveno: number; blokovanych: number }> {
  if (!ids.length || !delta) return { upraveno: 0, blokovanych: 0 };
  await zajistiSchemaClenu();
  const rows = await sql`
    UPDATE client_memberships SET points = GREATEST(0, points + ${delta})
    WHERE team_id = ${teamId} AND customer_id = ANY(${ids}) AND (${delta} < 0 OR blocked = FALSE)
    RETURNING customer_id` as any[];
  const hotovo = rows.map(r => Number(r.customer_id));
  if (hotovo.length) {
    await sql`
      INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note)
      SELECT ${teamId}, x, ${delta}, 'manual', ${`hromadne:${Date.now()}`}, ${poznamka || 'Hromadná úprava bodů'}
      FROM unnest(${hotovo}::int[]) AS x`;
  }
  void audit(teamId, kdoId, 'client.clen.hromadne_body', 'client', null, `${delta > 0 ? '+' : ''}${delta} b. · ${hotovo.length} členů${poznamka ? ` · ${poznamka}` : ''}`);
  return { upraveno: hotovo.length, blokovanych: ids.length - hotovo.length };
}

export interface KuponNabidky { id: number; title: string }

/** Kupon podniku, který jde členům připsat (nabídka, ne odměna za razítka). */
export async function kuponKPripsani(teamId: number, couponId: number): Promise<KuponNabidky | null> {
  if (!Number.isInteger(couponId) || couponId <= 0) return null;
  const [c] = await sql`SELECT id, title FROM client_coupons WHERE id = ${couponId} AND team_id = ${teamId} AND active = TRUE AND kind = 'offer'`;
  return c ? { id: Number(c.id), title: String(c.title) } : null;
}

/** Připíše kupon členům, kteří ho ještě nemají (nepoužitý). Vrací, komu se připsal. Blokovaní ho nedostanou. */
export async function pripisKuponClenum(teamId: number, couponId: number, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  await zajistiSchemaClenu();
  const kody = ids.map(() => couponCode());
  const rows = await sql`
    INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code)
    SELECT ${couponId}, x.cid, ${teamId}, x.kod FROM unnest(${ids}::int[], ${kody}::text[]) AS x(cid, kod)
    WHERE NOT EXISTS (SELECT 1 FROM client_coupon_claims c WHERE c.coupon_id = ${couponId} AND c.customer_id = x.cid AND c.redeemed_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM client_memberships m WHERE m.team_id = ${teamId} AND m.customer_id = x.cid AND m.blocked = TRUE)
    RETURNING customer_id` as any[];
  return rows.map(r => Number(r.customer_id));
}
