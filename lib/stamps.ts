// Razítkové kampaně (po vzoru Kartičky). Podnik jich má libovolně vedle sebe
// — „10+1 dýmka", „5+1 čaj" — každá s vlastním pravidlem:
//   · visit      … jedno razítko za návštěvu (nejvýš jedno denně na kampaň)
//   · products   … razítko za každý kus vybrané položky nebo kategorie na účtence
//   · min_value  … razítko za útratu nad částku (volitelně za každý násobek)
// Plná karta se promění v kupon s kódem (jeden řádek kuponu na kampaň, ne na
// každé dokončení) a karta se točí dál podle repeat_mode. Zdrojem položek je
// účtenka ze Storyous (billDetail) nebo ručně zadané položky u kasy.
//
// Souběhy: připsání razítek je optimistické (sloupec `ver`): načte se průběh,
// spočítá se plán (čistá funkce planPripsani v lib/razitkaPravidla.ts) a zapíše
// se jen když se průběh mezitím nezměnil. Dva souběžné dotazy tak neztratí
// razítko ani nevydají dvě odměny za jednu kartu. Každá změna se zapisuje do
// deníku client_stamp_events (storno, statistiky, export).

import { sql, couponCode } from './client';
import { pragueToday, dayPlus, parseDbTime } from './pragueTime';
import { zajistiRazitka } from './stampsSchema';
import { czForm, type CzNoun } from './czech';
import {
  planPripsani, platiTed, spocitejRazitka, vyberKampane, normalizujDny, normalizujSekce, prumerDni, stavKampane,
  type OpakovaniKarty, type PravidloRazitka, type RadekUctu, type PrubehKarty,
} from './razitkaPravidla';

export interface StampCampaign {
  id: number; team_id: number; name: string; description: string; conditions: string;
  active: boolean; draft: boolean; archived_at: string | null;
  valid_since: string | null; valid_till: string | null;
  required_stamps: number; rule_type: PravidloRazitka;
  stamp_items: { itemId: number }[]; stamp_sections: { sectionId: number }[];
  excluded_items: { itemId: number }[]; excluded_sections: { sectionId: number }[];
  min_value: number | null; min_value_multiple: boolean;
  one_per_order: boolean; reward_title: string; reward_items: { itemId: number }[];
  days_to_finish: number; days_to_redeem: number;
  repeat_mode: OpakovaniKarty;
  stack_cards: boolean; position: number;
  max_completions: number; daily_cap: number; valid_days: number[]; hour_from: string | null; hour_till: string | null;
  combinable: boolean; card_color: string | null; card_icon: string | null; card_image: string | null;
}

export function normalizeItemRefs(raw: any): { itemId: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => ({ itemId: Number(x?.itemId) }))
    .filter(x => Number.isFinite(x.itemId) && x.itemId > 0)
    .slice(0, 200);
}

export function shapeCampaign(r: any): StampCampaign {
  return {
    id: Number(r.id), team_id: Number(r.team_id), name: String(r.name),
    description: String(r.description ?? ''), conditions: String(r.conditions ?? ''),
    active: r.active !== false, draft: r.draft === true, archived_at: r.archived_at ? String(r.archived_at) : null,
    valid_since: r.valid_since ?? null, valid_till: r.valid_till ?? null,
    required_stamps: Math.max(1, Number(r.required_stamps) || 1),
    rule_type: ['visit', 'products', 'min_value'].includes(r.rule_type) ? r.rule_type : 'visit',
    stamp_items: normalizeItemRefs(r.stamp_items), stamp_sections: normalizujSekce(r.stamp_sections),
    excluded_items: normalizeItemRefs(r.excluded_items), excluded_sections: normalizujSekce(r.excluded_sections),
    min_value: r.min_value == null ? null : Number(r.min_value),
    min_value_multiple: r.min_value_multiple === true, one_per_order: r.one_per_order === true,
    reward_title: String(r.reward_title ?? ''), reward_items: normalizeItemRefs(r.reward_items),
    days_to_finish: Math.max(0, Number(r.days_to_finish) || 0),
    days_to_redeem: Math.max(0, Number(r.days_to_redeem) || 0),
    repeat_mode: ['immediately', 'one_day', 'one_week', 'one_month', 'one_time'].includes(r.repeat_mode) ? r.repeat_mode : 'immediately',
    stack_cards: r.stack_cards !== false, position: Number(r.position) || 0,
    max_completions: Math.max(0, Number(r.max_completions) || 0), daily_cap: Math.max(0, Number(r.daily_cap) || 0),
    valid_days: normalizujDny(r.valid_days),
    hour_from: r.hour_from ? String(r.hour_from) : null, hour_till: r.hour_till ? String(r.hour_till) : null,
    combinable: r.combinable !== false,
    card_color: r.card_color ? String(r.card_color) : null, card_icon: r.card_icon ? String(r.card_icon) : null,
    card_image: r.card_image ? String(r.card_image) : null,
  };
}

/** Kampaně platné právě teď podle dat: běží (ne koncept, ne pozastavená, ne archivovaná) a jsou v okně od–do. */
export async function activeCampaigns(teamId: number, today: string): Promise<StampCampaign[]> {
  try {
    await zajistiRazitka();
    const rows = await sql`
      SELECT * FROM client_stamp_campaigns
      WHERE team_id = ${teamId} AND active = TRUE AND draft = FALSE AND archived_at IS NULL
        AND (valid_since IS NULL OR valid_since <= ${today})
        AND (valid_till IS NULL OR valid_till >= ${today})
      ORDER BY position, id`;
    return (rows as any[]).map(shapeCampaign);
  } catch { return []; }
}

/** Skončené kampaně, ve kterých host něco měl (pro vysvětlení, proč karta zmizela). */
export async function skonceneKampane(teamId: number, customerId: number, today: string): Promise<{ id: number; name: string; validTill: string | null; stamps: number; completed: number; duvod: 'ended' | 'archived' | 'paused' }[]> {
  try {
    await zajistiRazitka();
    const rows = await sql`
      SELECT c.*, p.stamps AS p_stamps, p.completed AS p_completed FROM client_stamp_campaigns c
      JOIN client_stamp_progress p ON p.campaign_id = c.id AND p.customer_id = ${customerId}
      WHERE c.team_id = ${teamId} AND c.draft = FALSE AND (p.stamps > 0 OR p.completed > 0)
      ORDER BY c.position, c.id` as any[];
    const out: { id: number; name: string; validTill: string | null; stamps: number; completed: number; duvod: 'ended' | 'archived' | 'paused' }[] = [];
    for (const r of rows) {
      const st = stavKampane({ active: r.active !== false, draft: r.draft === true, archived_at: r.archived_at, valid_since: r.valid_since ?? null, valid_till: r.valid_till ?? null }, today);
      if (st === 'ended' || st === 'archived' || st === 'paused') {
        out.push({ id: Number(r.id), name: String(r.name), validTill: r.valid_till ?? null, stamps: Number(r.p_stamps) || 0, completed: Number(r.p_completed) || 0, duvod: st });
      }
    }
    return out;
  } catch { return []; }
}

/** Jména položek nabídky (odměna kampaně) podle ID. Bez ohledu na podnik: ID jsou jedinečná a jména z veřejné nabídky. */
export async function jmenaPolozek(ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  try {
    const rows = await sql`SELECT id, name FROM menu_items WHERE id = ANY(${ids})`;
    return new Map((rows as any[]).map(r => [Number(r.id), String(r.name)]));
  } catch { return new Map(); }
}

/** Průběhy člena napříč kampaněmi (mapa campaign_id → progress). */
export async function progressFor(teamId: number, customerId: number): Promise<Map<number, any>> {
  try {
    const rows = await sql`
      SELECT * FROM client_stamp_progress WHERE team_id = ${teamId} AND customer_id = ${customerId}`;
    return new Map((rows as any[]).map(r => [Number(r.campaign_id), r]));
  } catch { return new Map(); }
}

/** Průběh z řádku databáze ve tvaru pro čisté funkce. */
export function prubehZRadku(r: any): PrubehKarty & { ver: number } {
  return {
    stamps: Number(r?.stamps ?? 0), completed: Number(r?.completed ?? 0),
    started_at: parseDbTime(r?.started_at), last_completed_at: parseDbTime(r?.last_completed_at), ver: Number(r?.ver ?? 0),
  };
}

export interface VysledekPripsani {
  added: number; stamps: number; completions: number;
  skipped?: string;
  /** Razítka, která se nevešla (bez přenosu, denní strop, poslední karta). */
  lost: number; lostWhy?: string;
  /** Rozdělaná karta vypršela: tolik razítek propadlo. */
  expiredCount: number;
  /** Kódy kuponů, které vznikly dokončením karty. */
  codes: string[];
}

export interface MoznostiPripsani {
  kind?: 'visit' | 'bill' | 'manual' | 'points' | 'bulk';
  staffId?: number | null;
  /** Celková částka účtenky (pro výnosnost kampaně). */
  amount?: number | null;
  /** Ruční připsání vedením se denním stropem neřídí. */
  ignoreDailyCap?: boolean;
}

const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };
const CZ_RAZITKO = (n: number) => czForm(n, RAZITKO);

/** Kolik razítek host dnes (pražský den) na kampani získal z návštěv, účtenek a částek. */
async function razitekDnes(c: StampCampaign, customerId: number, dnes: string): Promise<number> {
  if (c.daily_cap <= 0) return 0;
  const [r] = await sql`
    SELECT COALESCE(SUM(delta), 0)::int AS n FROM client_stamp_events
    WHERE team_id = ${c.team_id} AND campaign_id = ${c.id} AND customer_id = ${customerId}
      AND undone_at IS NULL AND delta > 0 AND kind IN ('visit', 'bill', 'points')
      AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date = ${dnes}::date`;
  return Number(r?.n ?? 0);
}

/** Text odměny pro popis kuponu: název kampaně a případné položky odměny. */
async function popisOdmeny(c: StampCampaign): Promise<string> {
  let polozky = '';
  const ids = c.reward_items.map(x => x.itemId);
  if (ids.length) {
    try {
      const rows = await sql`
        SELECT mi.name FROM menu_items mi
        JOIN menu_sections ms ON ms.id = mi.section_id
        JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${c.team_id}
        WHERE mi.id = ANY(${ids}) ORDER BY mi.name`;
      const jmena = (rows as any[]).map(r => String(r.name));
      if (jmena.length) polozky = ` Odměna: ${jmena.join(', ')}.`;
    } catch { /* nabídka bez migrace */ }
  }
  return `Za plnou kartu „${c.name}“.${polozky}`;
}

/**
 * Řádek kuponu pro odměnu kampaně. Jeden na kampaň a lhůtu uplatnění (dřív
 * každé dokončení vyrobilo vlastní řádek a seznam kuponů zarostl). Název a popis
 * se při dalším dokončení srovnají s aktuálním nastavením kampaně.
 */
async function odmenovyKupon(c: StampCampaign, validUntil: string | null): Promise<number> {
  const titul = c.reward_title || `Odměna — ${c.name}`;
  const popis = await popisOdmeny(c);
  const [ex] = await sql`
    SELECT id FROM client_coupons
    WHERE team_id = ${c.team_id} AND campaign_id = ${c.id} AND kind = 'stamps' AND valid_until IS NOT DISTINCT FROM ${validUntil}::text
    ORDER BY id LIMIT 1`;
  if (ex) {
    await sql`UPDATE client_coupons SET title = ${titul}, description = ${popis} WHERE id = ${ex.id}`;
    return Number(ex.id);
  }
  const [coupon] = await sql`
    INSERT INTO client_coupons (team_id, title, description, cost_points, active, kind, valid_until, campaign_id)
    VALUES (${c.team_id}, ${titul}, ${popis}, 0, TRUE, 'stamps', ${validUntil}, ${c.id})
    RETURNING id`;
  return Number(coupon.id);
}

async function zapisUdalost(c: StampCampaign, customerId: number, e: {
  delta: number; kind: string; ref: string; note: string; staffId: number | null; amount: number | null;
  completions: number; tookDays: number | null; expired: number;
  before: { stamps: number; completed: number; started: Date | null; lastStamp: Date | null; lastCompleted: Date | null };
  claimIds: number[];
}): Promise<void> {
  await sql`
    INSERT INTO client_stamp_events (team_id, campaign_id, customer_id, delta, kind, ref, note, staff_id, amount, completions, took_days, expired,
      stamps_before, completed_before, started_before, last_stamp_before, last_completed_before, claim_ids)
    VALUES (${c.team_id}, ${c.id}, ${customerId}, ${e.delta}, ${e.kind}, ${e.ref}, ${e.note}, ${e.staffId}, ${e.amount}, ${e.completions}, ${e.tookDays}, ${e.expired},
      ${e.before.stamps}, ${e.before.completed}, ${e.before.started ? e.before.started.toISOString() : null}, ${e.before.lastStamp ? e.before.lastStamp.toISOString() : null},
      ${e.before.lastCompleted ? e.before.lastCompleted.toISOString() : null}, ${JSON.stringify(e.claimIds)}::jsonb)`;
}

/**
 * Připíše kampani `count` razítek jednomu členovi. Řeší vypršení rozdělané
 * karty (days_to_finish od začátku karty), cooldown po dokončení (kalendářní
 * den / týden / měsíc), limit dokončených karet a denní strop, překlopení plné
 * karty na kupon a — při stack_cards — víc dokončení z jedné dávky. Zápis je
 * optimistický (viz hlavička souboru). Vrací, co se stalo, ať to obsluha vidí lidsky.
 */
export async function addStamps(
  c: StampCampaign, customerId: number, count: number, ref: string, poznamka = '', opt: MoznostiPripsani = {},
): Promise<VysledekPripsani> {
  await zajistiRazitka();
  const nic = (extra: Partial<VysledekPripsani> = {}): VysledekPripsani => ({ added: 0, stamps: 0, completions: 0, lost: 0, expiredCount: 0, codes: [], ...extra });
  if (count <= 0) return nic();
  const dnes = pragueToday();
  const kind = opt.kind ?? (ref.startsWith('bill:') ? 'bill' : ref === 'card' ? 'visit' : 'manual');
  const dnesN = opt.ignoreDailyCap ? 0 : await razitekDnes(c, customerId, dnes);
  const pravidlo = opt.ignoreDailyCap ? { ...c, daily_cap: 0 } : c;

  for (let pokus = 0; pokus < 6; pokus++) {
    await sql`
      INSERT INTO client_stamp_progress (campaign_id, customer_id, team_id)
      VALUES (${c.id}, ${customerId}, ${c.team_id})
      ON CONFLICT (campaign_id, customer_id) DO NOTHING`;
    const [row] = await sql`SELECT * FROM client_stamp_progress WHERE campaign_id = ${c.id} AND customer_id = ${customerId}`;
    const cur = prubehZRadku(row);
    const now = new Date();
    const plan = planPripsani(pravidlo, cur, count, now, dnesN);
    if (plan.skipped) return nic({ stamps: cur.stamps, skipped: plan.skipped });

    // Zápis jen když se průběh mezitím nezměnil (ver). Jinak se zkusí znovu s čerstvými daty.
    const zapsano = await sql`
      UPDATE client_stamp_progress SET
        stamps = ${plan.rest},
        completed = completed + ${plan.completions},
        started_at = ${plan.startedAt.toISOString()},
        last_stamp_at = NOW(),
        last_completed_at = CASE WHEN ${plan.completions} > 0 THEN NOW() ELSE last_completed_at END,
        expired_stamps = expired_stamps + ${plan.expiredCount},
        expired_at = CASE WHEN ${plan.expiredCount} > 0 THEN NOW() ELSE expired_at END,
        ver = ver + 1
      WHERE campaign_id = ${c.id} AND customer_id = ${customerId} AND ver = ${cur.ver}
      RETURNING ver`;
    if (!zapsano.length) continue;
    const novaVer = Number(zapsano[0].ver);

    // Každé dokončení = kód kuponu (host ho ukáže u kasy). Při pádu se průběh vrátí.
    const codes: string[] = []; const claimIds: number[] = [];
    try {
      if (plan.completions > 0) {
        const validUntil = c.days_to_redeem > 0 ? dayPlus(dnes, c.days_to_redeem) : null;
        const kuponId = await odmenovyKupon(c, validUntil);
        for (let i = 0; i < plan.completions; i++) {
          const code = couponCode();
          const [cl] = await sql`
            INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code)
            VALUES (${kuponId}, ${customerId}, ${c.team_id}, ${code}) RETURNING id`;
          codes.push(code); claimIds.push(Number(cl.id));
        }
      }
      const shrnuti = plan.completions > 0
        ? `${c.name}: +${plan.added} ${CZ_RAZITKO(plan.added)}, karta dokončena${plan.completions > 1 ? ` ${plan.completions}×` : ''}`
        : `${c.name}: +${plan.added} ${CZ_RAZITKO(plan.added)} (${plan.rest}/${c.required_stamps})`;
      const extra = (plan.expiredCount > 0 ? ` · propadlo ${plan.expiredCount} ${CZ_RAZITKO(plan.expiredCount)} z vypršené karty` : '')
        + (plan.lost > 0 ? ` · nepřipsáno ${plan.lost} ${CZ_RAZITKO(plan.lost)}` : '');
      await zapisUdalost(c, customerId, {
        delta: plan.added, kind, ref, note: (shrnuti + extra + poznamka).slice(0, 300), staffId: opt.staffId ?? null, amount: opt.amount ?? null,
        completions: plan.completions, tookDays: plan.tookDays, expired: plan.expiredCount,
        before: { stamps: cur.stamps, completed: cur.completed, started: cur.started_at, lastStamp: parseDbTime(row?.last_stamp_at), lastCompleted: cur.last_completed_at },
        claimIds,
      });
      await sql`
        INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note)
        VALUES (${c.team_id}, ${customerId}, 0, 'visit', ${ref}, ${(shrnuti + extra + poznamka).slice(0, 300)})`;
    } catch (e) {
      // Vrátit průběh i vydané kódy, ať po pádu nezbyde půl akce.
      if (claimIds.length) await sql`DELETE FROM client_coupon_claims WHERE id = ANY(${claimIds}) AND redeemed_at IS NULL`.catch(() => {});
      await sql`
        UPDATE client_stamp_progress SET stamps = ${cur.stamps}, completed = ${cur.completed},
          started_at = ${(cur.started_at ?? now).toISOString()}, last_completed_at = ${cur.last_completed_at ? cur.last_completed_at.toISOString() : null},
          expired_stamps = GREATEST(0, expired_stamps - ${plan.expiredCount}), ver = ver + 1
        WHERE campaign_id = ${c.id} AND customer_id = ${customerId} AND ver = ${novaVer}`.catch(() => {});
      throw e;
    }
    return { added: plan.added, stamps: plan.rest, completions: plan.completions, lost: plan.lost, lostWhy: plan.lostWhy, expiredCount: plan.expiredCount, codes };
  }
  throw new Error('Razítka se zrovna připisují z jiného zařízení. Zkus to znovu.');
}

/**
 * Ruční odebrání razítek (chyba obsluhy, reklamace). Nejde pod nulu, dokončené
 * karty a vydané odměny se nemění. Zapíše se do deníku s důvodem.
 */
export async function odeberRazitka(c: StampCampaign, customerId: number, count: number, ref: string, duvod: string, staffId: number | null): Promise<{ removed: number; stamps: number }> {
  await zajistiRazitka();
  for (let pokus = 0; pokus < 6; pokus++) {
    const [row] = await sql`SELECT * FROM client_stamp_progress WHERE campaign_id = ${c.id} AND customer_id = ${customerId}`;
    if (!row) return { removed: 0, stamps: 0 };
    const cur = prubehZRadku(row);
    const removed = Math.min(Math.max(0, Math.round(count)), cur.stamps);
    if (removed <= 0) return { removed: 0, stamps: cur.stamps };
    const zapsano = await sql`
      UPDATE client_stamp_progress SET stamps = stamps - ${removed}, ver = ver + 1
      WHERE campaign_id = ${c.id} AND customer_id = ${customerId} AND ver = ${cur.ver} RETURNING stamps`;
    if (!zapsano.length) continue;
    const note = `${c.name}: −${removed} ${CZ_RAZITKO(removed)} ručně${duvod ? ` (${duvod})` : ''}`.slice(0, 300);
    await zapisUdalost(c, customerId, {
      delta: -removed, kind: 'manual', ref, note, staffId, amount: null, completions: 0, tookDays: null, expired: 0,
      before: { stamps: cur.stamps, completed: cur.completed, started: cur.started_at, lastStamp: parseDbTime(row.last_stamp_at), lastCompleted: cur.last_completed_at }, claimIds: [],
    });
    await sql`INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note) VALUES (${c.team_id}, ${customerId}, 0, 'manual', ${ref}, ${note})`;
    return { removed, stamps: Number(zapsano[0].stamps) };
  }
  throw new Error('Razítka se zrovna mění z jiného zařízení. Zkus to znovu.');
}

export interface VysledekStorna { ok: boolean; zprava: string; vracenoRazitek: number; kampane: string[] }

/**
 * Storno poslední akce s razítky: vrátí průběh do stavu před ní a zruší
 * neuplatněné odměny, které z ní vznikly. Akce z jedné účtenky (víc kampaní)
 * se vrací společně. Body a kredit z účtenky storno nemění.
 */
export async function stornujPosledni(teamId: number, customerId: number, opt: { campaignId?: number | null; staffId?: number | null } = {}): Promise<VysledekStorna> {
  await zajistiRazitka();
  const [posledni] = opt.campaignId
    ? await sql`SELECT * FROM client_stamp_events WHERE team_id = ${teamId} AND customer_id = ${customerId} AND campaign_id = ${opt.campaignId} AND undone_at IS NULL AND delta <> 0 ORDER BY id DESC LIMIT 1`
    : await sql`SELECT * FROM client_stamp_events WHERE team_id = ${teamId} AND customer_id = ${customerId} AND undone_at IS NULL AND delta <> 0 ORDER BY id DESC LIMIT 1`;
  if (!posledni) return { ok: false, zprava: 'Není co stornovat — host nemá žádnou akci s razítky.', vracenoRazitek: 0, kampane: [] };
  const skupina = posledni.ref
    ? (await sql`SELECT * FROM client_stamp_events WHERE team_id = ${teamId} AND customer_id = ${customerId} AND ref = ${posledni.ref} AND undone_at IS NULL AND delta <> 0 AND id <= ${posledni.id} ORDER BY id DESC`) as any[]
    : [posledni];
  let vraceno = 0; const nazvy: string[] = [];
  for (const e of skupina) {
    // Smí se vracet jen to, co je v kampani poslední (jinak by se přepsaly pozdější razítka).
    const [pozdejsi] = await sql`
      SELECT id FROM client_stamp_events WHERE team_id = ${teamId} AND customer_id = ${customerId} AND campaign_id = ${e.campaign_id}
        AND undone_at IS NULL AND delta <> 0 AND id > ${e.id} LIMIT 1`;
    if (pozdejsi) return { ok: false, zprava: 'Po téhle akci přibyla další razítka. Stornuj nejdřív ty.', vracenoRazitek: vraceno, kampane: nazvy };
    const claimIds: number[] = Array.isArray(e.claim_ids) ? e.claim_ids.map(Number).filter(Number.isFinite) : [];
    if (claimIds.length) {
      const [uplatnena] = await sql`SELECT id FROM client_coupon_claims WHERE id = ANY(${claimIds}) AND redeemed_at IS NOT NULL LIMIT 1`;
      if (uplatnena) return { ok: false, zprava: 'Odměna z té karty už byla uplatněná, storno nejde. Uprav razítka ručně v administraci.', vracenoRazitek: vraceno, kampane: nazvy };
    }
    const [row] = await sql`SELECT * FROM client_stamp_progress WHERE campaign_id = ${e.campaign_id} AND customer_id = ${customerId}`;
    if (!row) continue;
    const zapsano = await sql`
      UPDATE client_stamp_progress SET
        stamps = ${Number(e.stamps_before) || 0}, completed = ${Number(e.completed_before) || 0},
        started_at = ${e.started_before ? parseDbTime(e.started_before)!.toISOString() : null},
        last_stamp_at = ${e.last_stamp_before ? parseDbTime(e.last_stamp_before)!.toISOString() : null},
        last_completed_at = ${e.last_completed_before ? parseDbTime(e.last_completed_before)!.toISOString() : null},
        expired_stamps = GREATEST(0, expired_stamps - ${Number(e.expired) || 0}), ver = ver + 1
      WHERE campaign_id = ${e.campaign_id} AND customer_id = ${customerId} AND ver = ${Number(row.ver) || 0}
      RETURNING stamps`;
    if (!zapsano.length) return { ok: false, zprava: 'Karta se mezitím změnila z jiného zařízení. Zkus storno znovu.', vracenoRazitek: vraceno, kampane: nazvy };
    if (claimIds.length) await sql`DELETE FROM client_coupon_claims WHERE id = ANY(${claimIds}) AND redeemed_at IS NULL`;
    await sql`UPDATE client_stamp_events SET undone_at = NOW() WHERE id = ${e.id}`;
    const [kamp] = await sql`SELECT name FROM client_stamp_campaigns WHERE id = ${e.campaign_id}`;
    nazvy.push(String(kamp?.name ?? `#${e.campaign_id}`));
    vraceno += Math.abs(Number(e.delta) || 0);
    if (e.kind === 'visit') {
      // Návštěva z téhle akce se nepočítá a host může razítko dostat znovu ještě dnes.
      await sql`UPDATE client_memberships SET visits = GREATEST(0, visits - 1), last_visit_at = NULL WHERE customer_id = ${customerId} AND team_id = ${teamId}`;
    }
    await sql`INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note) VALUES (${teamId}, ${customerId}, 0, 'manual', ${e.ref ?? null}, ${`Storno razítek: ${kamp?.name ?? ''} (${Number(e.delta) > 0 ? '−' : '+'}${Math.abs(Number(e.delta))})`})`;
  }
  return { ok: true, zprava: `Storno hotovo: ${nazvy.join(', ')}.`, vracenoRazitek: vraceno, kampane: nazvy };
}

/** Návštěva z účtenky: počítá se jednou za pražský den (jako razítko u kasy), úrovně a „chybíš nám“ ji potřebují. */
export async function zapisNavstevuZUctenky(teamId: number, customerId: number): Promise<boolean> {
  const [m] = await sql`
    UPDATE client_memberships SET visits = visits + 1, last_visit_at = NOW()
    WHERE customer_id = ${customerId} AND team_id = ${teamId}
      AND (last_visit_at IS NULL OR
           (last_visit_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date
             < (NOW() AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date)
    RETURNING visits`;
  return !!m;
}

export interface RadekPolozky { productId?: string | null; itemId?: number | null; qty: number; /** Cena jednoho kusu (pokladna) — pro útratu bez vyloučených položek. */ price?: number | null }

/**
 * Razítka z účtenky nebo z ručně zadaných položek: spočítá zásah pravidel všech
 * produktových kampaní a útratových kampaní, vybere, které účtenku dostanou
 * (kombinovatelnost), a připíše je. Párování jde přes nabídku podniku
 * (menu_items.pos_product_id), ruční položky přímo přes itemId.
 */
export async function applyBillToCampaigns(
  teamId: number, customerId: number, today: string,
  bill: { billId: string; total: number; items: RadekPolozky[] },
  bonus: { razitka: number; poznamka: string } = { razitka: 0, poznamka: '' },
  opt: { staffId?: number | null; kind?: 'bill' | 'points' } = {},
): Promise<{ lines: string[]; anything: boolean; expiredCount: number; lost: number; codes: string[] }> {
  const out = { lines: [] as string[], anything: false, expiredCount: 0, lost: 0, codes: [] as string[] };
  const campaigns = (await activeCampaigns(teamId, today)).filter(c => c.rule_type !== 'visit');
  if (!campaigns.length) return out;

  // Jedním dotazem: položky nabídky podle pokladního ID i podle ID (ruční položky) s jejich kategorií.
  const posIds = Array.from(new Set(bill.items.map(i => i.productId).filter((x): x is string => !!x)));
  const itemIds = Array.from(new Set(bill.items.map(i => i.itemId).filter((x): x is number => !!x && x > 0)));
  const byPos = new Map<string, { itemId: number; sectionId: number }>();
  const byId = new Map<number, { itemId: number; sectionId: number }>();
  if (posIds.length || itemIds.length) {
    try {
      const rows = await sql`
        SELECT mi.id, mi.section_id, mi.pos_product_id FROM menu_items mi
        JOIN menu_sections ms ON ms.id = mi.section_id
        JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${teamId}
        WHERE mi.pos_product_id = ANY(${posIds}) OR mi.id = ANY(${itemIds})`;
      for (const r of rows as any[]) {
        const v = { itemId: Number(r.id), sectionId: Number(r.section_id) };
        byId.set(v.itemId, v);
        if (r.pos_product_id != null && !byPos.has(String(r.pos_product_id))) byPos.set(String(r.pos_product_id), v);
      }
    } catch { /* nabídka bez migrace */ }
  }
  const radky: RadekUctu[] = bill.items.map(it => {
    const v = (it.itemId ? byId.get(it.itemId) : null) ?? (it.productId ? byPos.get(it.productId) : null) ?? null;
    const qty = Math.max(0, Math.round(it.qty));
    return { itemId: v?.itemId ?? null, sectionId: v?.sectionId ?? null, qty, price: it.price != null ? it.price * Math.max(0, it.qty) : null };
  });

  const zasahy: { c: StampCampaign; count: number }[] = [];
  for (const c of campaigns) {
    const okno = platiTed(c);
    if (!okno.ok) { out.lines.push(`${c.name}: ${okno.proc}`); continue; }
    zasahy.push({ c, count: spocitejRazitka(c, { total: bill.total, radky }).count });
  }
  const { vybrane, vynechane } = vyberKampane(zasahy);
  for (const v of vynechane) out.lines.push(`${v.c.name}: účtenku už dostala karta „${vybrane[0].c.name}“ (kampaně se nekombinují).`);
  for (const { c, count } of vybrane) {
    // Jedna účtenka smí do jedné kampaně jen jednou (dvojí načtení, ruční opakování).
    const [uz] = await sql`
      SELECT id FROM client_stamp_events WHERE team_id = ${teamId} AND campaign_id = ${c.id} AND customer_id = ${customerId}
        AND ref = ${`bill:${bill.billId}`} AND undone_at IS NULL AND delta > 0 LIMIT 1`;
    if (uz) { out.lines.push(`${c.name}: z téhle účtenky už razítka dostala.`); continue; }
    // Bonusová akce přidá razítka navíc jen kampaním, kterým účtenka razítko dala.
    const r = await addStamps(c, customerId, count + Math.max(0, bonus.razitka), `bill:${bill.billId}`, bonus.razitka > 0 ? bonus.poznamka : '',
      { kind: opt.kind ?? 'bill', staffId: opt.staffId ?? null, amount: bill.total });
    out.expiredCount += r.expiredCount; out.lost += r.lost; out.codes.push(...r.codes);
    if (r.skipped) { out.lines.push(`${c.name}: ${r.skipped}`); continue; }
    out.anything = true;
    let line = r.completions > 0
      ? `${c.name}: karta dokončena${r.completions > 1 ? ` ${r.completions}×` : ''} — odměna je v kuponech`
      : `${c.name}: +${r.added} (${r.stamps}/${c.required_stamps})`;
    if (r.expiredCount > 0) line += ` · rozdělaná karta vypršela, propadlo ${r.expiredCount} ${CZ_RAZITKO(r.expiredCount)}`;
    if (r.lost > 0) line += ` · ${r.lost} ${CZ_RAZITKO(r.lost)} se nevešlo`;
    out.lines.push(line);
  }
  return out;
}

/**
 * Má podnik kampaň „za návštěvu“ (v jakémkoli stavu)? Pak razítko za návštěvu řídí kampaně a jednoduché
 * razítko podle stamp_target (staré počítadlo na členství) neplatí — jinak by běžela dvě počítadla vedle sebe.
 * Podnik jen s kampaněmi za položky nebo útratu jednoduché razítko za návštěvu dál používá.
 */
export async function maKampane(teamId: number): Promise<boolean> {
  try {
    await zajistiRazitka();
    const [r] = await sql`SELECT 1 AS x FROM client_stamp_campaigns WHERE team_id = ${teamId} AND rule_type = 'visit' LIMIT 1`;
    return !!r;
  } catch { return false; }
}

/** Kampaně „za návštěvu“, které běží (podle dat) a které z nich platí právě teď (den v týdnu, hodiny). */
export async function navstevniKampane(teamId: number, today: string): Promise<{ vse: StampCampaign[]; platne: StampCampaign[]; proc: string | null }> {
  const vse = (await activeCampaigns(teamId, today)).filter(c => c.rule_type === 'visit');
  const platne = vse.filter(c => platiTed(c).ok);
  return { vse, platne, proc: vse.length && !platne.length ? (platiTed(vse[0]).proc ?? null) : null };
}

/** Razítko za návštěvu všem platným kampaním „za návštěvu“. Denní zámek návštěvy hlídá volající (stampVisit). */
export async function razitkaZaNavstevu(teamId: number, customerId: number, ref: string, extra: number, note: string, staffId: number | null): Promise<{
  parts: string[]; rewarded: boolean; stamps: number; expiredCount: number; lost: number;
}> {
  const { vse } = await navstevniKampane(teamId, pragueToday());
  const out = { parts: [] as string[], rewarded: false, stamps: 0, expiredCount: 0, lost: 0 };
  for (const vc of vse) {
    const okno = platiTed(vc);
    if (!okno.ok) { out.parts.push(`${vc.name}: ${okno.proc}`); continue; }
    const r = await addStamps(vc, customerId, 1 + Math.max(0, extra), ref, note, { kind: 'visit', staffId });
    out.expiredCount += r.expiredCount; out.lost += r.lost;
    if (r.skipped) { out.parts.push(`${vc.name}: ${r.skipped}`); continue; }
    if (r.completions > 0) out.rewarded = true;
    if (out.stamps === 0) out.stamps = r.stamps;
    let t = r.completions > 0 ? `${vc.name}: karta plná — odměna je v kuponech` : `${vc.name}: ${r.stamps}/${vc.required_stamps}`;
    if (r.expiredCount > 0) t += ` (rozdělaná karta vypršela, propadlo ${r.expiredCount} ${CZ_RAZITKO(r.expiredCount)})`;
    if (r.lost > 0) t += ` (${r.lost} ${CZ_RAZITKO(r.lost)} se nevešlo)`;
    out.parts.push(t);
  }
  return out;
}

// ---- Správa a přehledy (admin) -------------------------------------------------------------------

/** Statistiky jedné kampaně: odměny, doba sbírání, top hosté, výnosnost a rozpad po dnech. */
export async function statistikyKampane(teamId: number, campaignId: number, today: string) {
  await zajistiRazitka();
  const [souhrn] = await sql`
    SELECT COUNT(*)::int AS hostu, COALESCE(SUM(stamps), 0)::int AS otevrena, COALESCE(SUM(completed), 0)::int AS dokonceno,
           COALESCE(SUM(expired_stamps), 0)::int AS propadla
    FROM client_stamp_progress WHERE team_id = ${teamId} AND campaign_id = ${campaignId}`;
  const [odmeny] = await sql`
    SELECT COUNT(*)::int AS vydano,
           COUNT(cl.redeemed_at)::int AS uplatneno,
           COUNT(*) FILTER (WHERE cl.redeemed_at IS NULL AND c.valid_until IS NOT NULL AND c.valid_until < ${today})::int AS propadlo
    FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
    WHERE cl.team_id = ${teamId} AND c.campaign_id = ${campaignId} AND c.kind = 'stamps'`;
  const doby = await sql`
    SELECT took_days FROM client_stamp_events
    WHERE team_id = ${teamId} AND campaign_id = ${campaignId} AND completions > 0 AND undone_at IS NULL AND took_days IS NOT NULL`;
  const top = await sql`
    SELECT u.name, p.completed, p.stamps FROM client_stamp_progress p JOIN users u ON u.id = p.customer_id
    WHERE p.team_id = ${teamId} AND p.campaign_id = ${campaignId} AND (p.completed > 0 OR p.stamps > 0)
    ORDER BY p.completed DESC, p.stamps DESC, u.name LIMIT 10`;
  const [vynos] = await sql`
    SELECT COALESCE(SUM(amount), 0)::numeric AS utrata, COUNT(*) FILTER (WHERE amount IS NOT NULL)::int AS ucty
    FROM client_stamp_events WHERE team_id = ${teamId} AND campaign_id = ${campaignId} AND kind IN ('bill', 'points') AND undone_at IS NULL`;
  const dny = await sql`
    SELECT ((created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date)::text AS den,
           COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0)::int AS razitka,
           COALESCE(SUM(completions), 0)::int AS dokonceno,
           COUNT(DISTINCT customer_id)::int AS hostu
    FROM client_stamp_events
    WHERE team_id = ${teamId} AND campaign_id = ${campaignId} AND undone_at IS NULL AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY 1 ORDER BY 1`;
  return {
    hostu: Number(souhrn?.hostu) || 0, otevrenaRazitka: Number(souhrn?.otevrena) || 0, dokonceno: Number(souhrn?.dokonceno) || 0, propadlaRazitka: Number(souhrn?.propadla) || 0,
    odmenyVydane: Number(odmeny?.vydano) || 0, odmenyUplatnene: Number(odmeny?.uplatneno) || 0, odmenyPropadle: Number(odmeny?.propadlo) || 0,
    prumernaDobaDni: prumerDni((doby as any[]).map(r => Number(r.took_days))),
    topHoste: (top as any[]).map(r => ({ jmeno: String(r.name), dokonceno: Number(r.completed) || 0, razitka: Number(r.stamps) || 0 })),
    utrataZUctu: Number(vynos?.utrata) || 0, uctu: Number(vynos?.ucty) || 0,
    poDnech: (dny as any[]).map(r => ({ den: String(r.den), razitka: Number(r.razitka) || 0, dokonceno: Number(r.dokonceno) || 0, hostu: Number(r.hostu) || 0 })),
  };
}
