// Členové a skupiny v databázi: načtení členů s úrovní, slevou a skupinami, dynamické
// skupiny (pravidla se promítají do client_group_members, takže kupony a slevy
// skupin fungují stejně jako u ručních) a poznámky k hostovi.
// Čistá logika: lib/clenoveFiltr.ts. Sloupce se zajišťují i tady (IF NOT EXISTS při
// prvním použití); stejné příkazy jsou v app/api/init/route.ts (blok „Kolo 81“).

import { sql, ensureProfile } from './client';
import { zajistiSchemaClenu } from './clenoveSchema';
import { audit } from './audit';
import { posliKupon } from './kuponyRozeslani';
import { jeVidetelnyHostum, stavKuponu } from './kuponyPravidla';
import type { PrijemceZpravy } from './zpravyKanaly';
import { maKampane } from './stamps';
import { tierForMember, tierRulesFromProfile } from './clientSlots';
import { efektivniSleva } from './slevy';
import { pragueToday } from './pragueTime';
import { vyberPodlePravidel, normalizujPravidla, type ClenFiltrovany, type PravidlaSkupiny } from './clenoveFiltr';

let pripraveno: Promise<void> | null = null;

/** Zajistí sloupce skupin a tabulku poznámek. Jednou za studený start. */
export function zajistiClenove(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS discount_pct INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS description TEXT`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS color TEXT`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS rules JSONB`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS rules_refreshed_at TIMESTAMP`;
      await sql`
        CREATE TABLE IF NOT EXISTS client_member_notes (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          customer_id INTEGER NOT NULL,
          body TEXT NOT NULL,
          created_by INTEGER,
          created_at TIMESTAMP DEFAULT NOW()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_member_notes_customer ON client_member_notes (team_id, customer_id)`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS coupon_id INTEGER`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS promo_id INTEGER`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS muted INTEGER NOT NULL DEFAULT 0`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

export interface SkupinaClena { id: number; name: string; color: string | null }

export interface ClenTymu extends ClenFiltrovany {
  email: string | null;
  birthday: string | null;
  credit: number;
  level: string;
  level_label: string;
  /** Úroveň po pauze snížená (tier_inactive_months). */
  level_reduced: boolean;
  /** Člen zablokovaný správcem: nesbírá body ani razítka a nedostává zprávy. */
  blocked: boolean;
  discount: number;
  discount_source: 'uroven' | 'skupina' | null;
  discount_name: string | null;
  skupiny: SkupinaClena[];
}

/** Členové podniku s údaji pro filtry (jeden dotaz, bez N+1). Bez skupin, úrovní a slev. */
export async function nactiZaklad(teamId: number): Promise<Omit<ClenTymu, 'level' | 'level_label' | 'level_reduced' | 'discount' | 'discount_source' | 'discount_name' | 'skupiny'>[]> {
  const rows = await sql`
    SELECT m.customer_id AS id, us.name, us.email, us.birthday, m.points, m.stamps, m.visits, m.joined_at, m.last_visit_at,
           COALESCE((to_jsonb(m)->>'spend')::int, 0) AS spend,
           COALESCE((to_jsonb(m)->>'credit')::int, 0) AS credit,
           COALESCE((to_jsonb(m)->>'blocked')::boolean, FALSE) AS blocked,
           COALESCE(oc.n, 0) AS open_coupons
    FROM client_memberships m
    JOIN users us ON us.id = m.customer_id
    LEFT JOIN (
      SELECT customer_id, COUNT(*)::int AS n FROM client_coupon_claims
      WHERE team_id = ${teamId} AND redeemed_at IS NULL GROUP BY customer_id
    ) oc ON oc.customer_id = m.customer_id
    WHERE m.team_id = ${teamId}` as any[];
  // Razítka: s kampaněmi je zdrojem pravdy průběh kampaní, ne staré počítadlo na členství (dvojí počítadlo).
  const razitkaBy = new Map<number, number>();
  try {
    if (await maKampane(teamId)) {
      const sp = await sql`
        SELECT p.customer_id, COALESCE(SUM(p.stamps), 0)::int AS s FROM client_stamp_progress p
        JOIN client_stamp_campaigns c ON c.id = p.campaign_id AND c.active = TRUE
        WHERE p.team_id = ${teamId} GROUP BY p.customer_id` as any[];
      for (const r of sp) razitkaBy.set(Number(r.customer_id), Number(r.s) || 0);
      for (const r of rows) if (!razitkaBy.has(Number(r.id))) razitkaBy.set(Number(r.id), 0);
    }
  } catch { /* před migrací zůstane počítadlo z členství */ }
  return rows.map(r => ({
    id: Number(r.id), name: String(r.name ?? ''), email: r.email ? String(r.email) : null,
    birthday: r.birthday ? String(r.birthday) : null,
    points: Number(r.points) || 0, stamps: razitkaBy.size ? (razitkaBy.get(Number(r.id)) ?? 0) : (Number(r.stamps) || 0), visits: Number(r.visits) || 0,
    spend: Number(r.spend) || 0, credit: Number(r.credit) || 0,
    joined_at: r.joined_at ?? null, last_visit_at: r.last_visit_at ?? null,
    open_coupons: Number(r.open_coupons) || 0, blocked: r.blocked === true,
  }));
}

/** Členové s úrovní, efektivní slevou a skupinami (štítky v seznamu). */
export async function nactiClenyTymu(teamId: number): Promise<ClenTymu[]> {
  await zajistiClenove();
  const [zaklad, profil, sk] = await Promise.all([
    nactiZaklad(teamId),
    ensureProfile(teamId),
    sql`
      SELECT gm.customer_id, g.id, g.name, g.color, COALESCE(g.discount_pct, 0) AS discount_pct
      FROM client_group_members gm
      JOIN client_groups g ON g.id = gm.group_id AND g.team_id = gm.team_id
      WHERE gm.team_id = ${teamId}
      ORDER BY g.name, g.id` as Promise<any[]>,
  ]);
  const pravidla = tierRulesFromProfile(profil);
  const poHostu = new Map<number, { id: number; name: string; color: string | null; discount: number }[]>();
  for (const r of sk) {
    const c = Number(r.customer_id);
    if (!poHostu.has(c)) poHostu.set(c, []);
    poHostu.get(c)!.push({ id: Number(r.id), name: String(r.name), color: r.color ? String(r.color) : null, discount: Number(r.discount_pct) || 0 });
  }
  return zaklad.map(c => {
    const t = tierForMember({ visits: c.visits, spend: c.spend, lastVisitAt: c.last_visit_at }, pravidla);
    const gs = poHostu.get(c.id) ?? [];
    const s = efektivniSleva({ uroven: t, skupiny: gs.filter(g => g.discount > 0).map(g => ({ name: g.name, discount: g.discount })) });
    return {
      ...c, level: t.id, level_label: t.label, level_reduced: !!t.reduced,
      discount: s.pct, discount_source: s.zdroj, discount_name: s.nazev,
      skupiny: gs.map(g => ({ id: g.id, name: g.name, color: g.color })),
    };
  });
}

/** Pražský kontext pro filtry (měsíc podle pražského dne, ne podle UTC). */
export function kontextFiltru(): { now: Date; mesic: number } {
  return { now: new Date(), mesic: parseInt(pragueToday().slice(5, 7), 10) };
}

/** Jak dlouho platí vypočtené členství dynamické skupiny, než se přepočítá znovu. */
export const OBNOVA_SKUPIN_MIN = 30;

/**
 * Přepočítá členy dynamických skupin podniku. Bez `force` jen skupiny, které se dlouho
 * nepřepočítaly; přepočet si skupina atomicky přivlastní (UPDATE … RETURNING), takže dva
 * souběžné požadavky nepřepočítají totéž dvakrát. Vrací počet přepočítaných skupin.
 */
export async function obnovDynamickeSkupiny(teamId: number, opts: { force?: boolean; groupId?: number } = {}): Promise<number> {
  await zajistiClenove();
  const skupiny = await sql`
    SELECT id, rules FROM client_groups
    WHERE team_id = ${teamId} AND rules IS NOT NULL
      AND (${opts.groupId ?? 0} = 0 OR id = ${opts.groupId ?? 0})` as any[];
  if (!skupiny.length) return 0;
  const minuty = opts.force ? 0 : OBNOVA_SKUPIN_MIN;
  let clenove: ClenFiltrovany[] | null = null;
  let hotovo = 0;
  for (const g of skupiny) {
    const pravidla = normalizujPravidla(g.rules);
    if (!pravidla) continue;
    const [vzal] = await sql`
      UPDATE client_groups SET rules_refreshed_at = NOW()
      WHERE id = ${g.id} AND team_id = ${teamId}
        AND (rules_refreshed_at IS NULL OR rules_refreshed_at < NOW() - (${minuty} || ' minutes')::interval)
      RETURNING id`;
    if (!vzal) continue;
    clenove ??= await nactiZaklad(teamId);
    await prepocitejClenyDynamicke(teamId, Number(g.id), pravidla, clenove);
    hotovo += 1;
  }
  return hotovo;
}

/** Noční přepočet dynamických skupin všech podniků (cron), ať kupony a slevy skupin nejedou na starém stavu. */
export async function obnovVsechnyDynamickeSkupiny(): Promise<number> {
  await zajistiClenove();
  const tymy = await sql`SELECT DISTINCT team_id FROM client_groups WHERE rules IS NOT NULL` as any[];
  let n = 0;
  for (const t of tymy) {
    try { n += await obnovDynamickeSkupiny(Number(t.team_id), { force: true }); }
    catch (e) { console.error('[skupiny] noční přepočet selhal', t.team_id, e); }
  }
  return n;
}

/** Jedna skupina: smaže ty, kdo už pravidla nesplňují, a doplní nové. */
export async function prepocitejClenyDynamicke(teamId: number, groupId: number, pravidla: PravidlaSkupiny, clenove?: ClenFiltrovany[]): Promise<number> {
  const zdroj: ClenFiltrovany[] = clenove ?? await nactiZaklad(teamId);
  const ids = vyberPodlePravidel(zdroj, pravidla, kontextFiltru());
  await sql`DELETE FROM client_group_members WHERE group_id = ${groupId} AND team_id = ${teamId} AND NOT (customer_id = ANY(${ids}))`;
  if (ids.length) {
    await sql`
      INSERT INTO client_group_members (group_id, customer_id, team_id)
      SELECT ${groupId}, m.customer_id, ${teamId} FROM client_memberships m
      WHERE m.team_id = ${teamId} AND m.customer_id = ANY(${ids})
      ON CONFLICT (group_id, customer_id) DO NOTHING`;
  }
  return ids.length;
}

export interface PoznamkaHosta { id: number; body: string; created_at: string; created_by: number | null; autor: string | null }

export async function poznamkyHosta(teamId: number, customerId: number): Promise<PoznamkaHosta[]> {
  await zajistiClenove();
  const rows = await sql`
    SELECT n.id, n.body, n.created_at, n.created_by, us.name AS autor
    FROM client_member_notes n LEFT JOIN users us ON us.id = n.created_by
    WHERE n.team_id = ${teamId} AND n.customer_id = ${customerId}
    ORDER BY n.created_at DESC, n.id DESC LIMIT 50` as any[];
  return rows.map(r => ({ id: Number(r.id), body: String(r.body), created_at: String(r.created_at), created_by: r.created_by == null ? null : Number(r.created_by), autor: r.autor ? String(r.autor) : null }));
}

// ---- Blokace, příjemci zpráv, sloučení a odebrání člena (okruh Z a G, kolo 81) ----------

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

  await sql`
    UPDATE client_memberships SET
      points = points + ${Number(d.points) || 0},
      stamps = stamps + ${Number(d.stamps) || 0},
      visits = visits + ${Number(d.visits) || 0},
      spend = spend + ${Number(d.spend) || 0},
      credit = credit + ${Number(d.credit) || 0},
      joined_at = LEAST(joined_at, ${d.joined_at ?? null}::timestamp),
      last_visit_at = GREATEST(last_visit_at, ${d.last_visit_at ?? null}::timestamp),
      blocked = (blocked OR ${d.blocked === true})
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
  // Poznámky k hostovi (client_member_notes) přejdou na hlavního člena.
  await zajistiClenove();
  await sql`UPDATE client_member_notes SET customer_id = ${hlavniId} WHERE team_id = ${teamId} AND customer_id = ${duplicitaId}`;
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
  await zajistiClenove();
  await sql`DELETE FROM client_member_notes WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
  void audit(teamId, kdoId, 'client.clen.smazan', 'client', customerId, `${u?.name ?? 'člen'} · ${Number(m.points) || 0} bodů`);
  return { ok: true, name: String(u?.name ?? ''), body: Number(m.points) || 0 };
}


export interface KuponNabidky { id: number; title: string; row: any }

/** Kupon podniku, který jde členům poslat (zveřejněný, neskončený). Posílání samo řeší lib/kuponyRozeslani. */
export async function kuponKPripsani(teamId: number, couponId: number): Promise<KuponNabidky | null> {
  if (!Number.isInteger(couponId) || couponId <= 0) return null;
  const [c] = await sql`SELECT * FROM client_coupons WHERE id = ${couponId} AND team_id = ${teamId} AND kind = 'offer'`;
  if (!c || !jeVidetelnyHostum(c) || stavKuponu(c, pragueToday()) === 'vyprselo') return null;
  return { id: Number(c.id), title: String(c.title), row: c };
}

/**
 * Pošle kupon členům jednou cestou s ostatními rozesílkami kuponů (limit na hosta, 18+, kusy, kdo ho drží).
 * Bez vlastního oznámení: zpráva automatizace nebo rozesílky ho nese sama. Vrací, kolika členům se připsal.
 */
export async function pripisKuponClenum(teamId: number, couponId: number, ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const k = await kuponKPripsani(teamId, couponId);
  if (!k) return 0;
  const v = await posliKupon(teamId, k.row, { druh: 'hoste', hostIds: ids }, { zkouska: false, ticho: true });
  return v.poslano;
}
