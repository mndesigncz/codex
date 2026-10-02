// Razítkové kampaně (po vzoru Kartičky). Podnik jich má libovolně vedle sebe
// — „10+1 dýmka", „5+1 čaj" — každá s vlastním pravidlem:
//   · visit      … jedno razítko za návštěvu (nejvýš jedno denně na kampaň)
//   · products   … razítko za každý kus vybrané položky nabídky na účtence
//   · min_value  … razítko za útratu nad částku (volitelně za každý násobek)
// Plná karta se promění v kupon s kódem (stejný mechanismus jako dosud) a
// karta se točí dál podle repeat_mode. Zdrojem položek je účtenka ze Storyous
// (billDetail) — produkty se poznávají přes párování nabídky (pos_product_id).
//
// Souběhy: razítka se připisují optimisticky (sloupec rev, viz sCasem v
// lib/stampsPlan.ts) — žádná absolutní hodnota z přečteného stavu se nezapíše,
// aniž by se stav mezitím nezměnil. Opakované připsání téhož (kampaň, host, ref)
// hlídá jedinečný index deníku razítek.

import { sql, couponCode } from './client';
import { zajistiRazitka } from './stampsSchema';
import { pragueToday, pragueDayOf, pragueHM, dayPlus, parseDbTime } from './pragueTime';
import { planAdd, platiTed, sCasem, vyprselaKarta, vyprsiKdy, RAZITKO, type StavKarty, type Stav } from './stampsPlan';
import { czForm } from './czech';
import { normalizujSekce, spocitejRazitka, vyberKampane, type OdkazSekce, type PrubehHosta, type RadekUctu } from './razitkaPravidla';

export interface StampCampaign {
  id: number; team_id: number; name: string; description: string; conditions: string;
  active: boolean; status: Stav; valid_since: string | null; valid_till: string | null;
  required_stamps: number; rule_type: 'visit' | 'products' | 'min_value';
  stamp_items: { itemId: number }[]; excluded_items: { itemId: number }[];
  min_value: number | null; min_value_multiple: boolean;
  one_per_order: boolean; reward_title: string; reward_items: { itemId: number }[];
  days_to_finish: number; days_to_redeem: number;
  repeat_mode: 'immediately' | 'one_day' | 'one_week' | 'one_month' | 'one_time';
  stack_cards: boolean; position: number;
  max_completions: number; daily_cap: number; days_of_week: number[];
  hour_from: string | null; hour_till: string | null;
  /** Celé kategorie nabídky, které dávají razítko / jsou vyloučené (vedle jednotlivých položek). */
  stamp_sections: OdkazSekce[]; excluded_sections: OdkazSekce[];
  /** false = kampaň si účtenku bere sama a ostatní z ní razítko nedostanou. */
  combinable: boolean;
  card_color: string | null; card_icon: string | null; card_image: string | null;
}

export function normalizeItemRefs(raw: any): { itemId: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => ({ itemId: Number(x?.itemId) }))
    .filter(x => Number.isFinite(x.itemId) && x.itemId > 0)
    .slice(0, 200);
}

const STAVY: Stav[] = ['active', 'draft', 'paused', 'archived'];

export function shapeCampaign(r: any): StampCampaign {
  const active = r.active !== false;
  // Řádek z doby před stavy: status chybí → odvodí se z active.
  const status: Stav = STAVY.includes(r.status) ? r.status : (active ? 'active' : 'paused');
  return {
    id: Number(r.id), team_id: Number(r.team_id), name: String(r.name),
    description: String(r.description ?? ''), conditions: String(r.conditions ?? ''),
    active, status, valid_since: r.valid_since ?? null, valid_till: r.valid_till ?? null,
    required_stamps: Math.max(1, Number(r.required_stamps) || 1),
    rule_type: ['visit', 'products', 'min_value'].includes(r.rule_type) ? r.rule_type : 'visit',
    stamp_items: normalizeItemRefs(r.stamp_items), excluded_items: normalizeItemRefs(r.excluded_items),
    min_value: r.min_value == null ? null : Number(r.min_value),
    min_value_multiple: r.min_value_multiple === true, one_per_order: r.one_per_order === true,
    reward_title: String(r.reward_title ?? ''), reward_items: normalizeItemRefs(r.reward_items),
    days_to_finish: Math.max(0, Number(r.days_to_finish) || 0),
    days_to_redeem: Math.max(0, Number(r.days_to_redeem) || 0),
    repeat_mode: ['immediately', 'one_day', 'one_week', 'one_month', 'one_time'].includes(r.repeat_mode) ? r.repeat_mode : 'immediately',
    stack_cards: r.stack_cards !== false, position: Number(r.position) || 0,
    max_completions: Math.max(0, Number(r.max_completions) || 0), daily_cap: Math.max(0, Number(r.daily_cap) || 0),
    days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week.map(Number).filter((d: number) => d >= 1 && d <= 7) : [],
    hour_from: r.hour_from ? String(r.hour_from) : null, hour_till: r.hour_till ? String(r.hour_till) : null,
    stamp_sections: normalizujSekce(r.stamp_sections), excluded_sections: normalizujSekce(r.excluded_sections),
    combinable: r.combinable !== false,
    card_color: r.card_color ? String(r.card_color) : null, card_icon: r.card_icon ? String(r.card_icon) : null,
    card_image: r.card_image ? String(r.card_image) : null,
  };
}

/** Kampaně platné právě teď (aktivní + v případném okně od–do). */
export async function activeCampaigns(teamId: number, today: string): Promise<StampCampaign[]> {
  try {
    await zajistiRazitka();
    const rows = await sql`
      SELECT * FROM client_stamp_campaigns
      WHERE team_id = ${teamId} AND active = TRUE
        AND (valid_since IS NULL OR valid_since <= ${today})
        AND (valid_till IS NULL OR valid_till >= ${today})
      ORDER BY position, id`;
    return (rows as any[]).map(shapeCampaign);
  } catch { return []; }
}

/** Skončené kampaně, ve kterých host něco měl (pro vysvětlení, proč karta zmizela). Koncepty se hostovi neukazují. */
export async function skonceneKampane(teamId: number, customerId: number, today: string): Promise<{ id: number; name: string; validTill: string | null; stamps: number; completed: number; duvod: 'ended' | 'archived' | 'paused' }[]> {
  try {
    await zajistiRazitka();
    const rows = await sql`
      SELECT c.*, p.stamps AS p_stamps, p.completed AS p_completed FROM client_stamp_campaigns c
      JOIN client_stamp_progress p ON p.campaign_id = c.id AND p.customer_id = ${customerId}
      WHERE c.team_id = ${teamId} AND c.status <> 'draft' AND (p.stamps > 0 OR p.completed > 0)
      ORDER BY c.position, c.id` as any[];
    const out: { id: number; name: string; validTill: string | null; stamps: number; completed: number; duvod: 'ended' | 'archived' | 'paused' }[] = [];
    for (const r of rows) {
      const c = shapeCampaign(r);
      const duvod = c.status === 'archived' ? 'archived' : c.status === 'paused' ? 'paused' : (c.valid_till && c.valid_till < today ? 'ended' : null);
      if (duvod) out.push({ id: c.id, name: c.name, validTill: c.valid_till, stamps: Number(r.p_stamps) || 0, completed: Number(r.p_completed) || 0, duvod });
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

/**
 * Má podnik kampaň „za návštěvu“ (v jakémkoli stavu)? Pak razítko za návštěvu řídí kampaně a jednoduché razítko
 * podle stamp_target (staré počítadlo na členství) neplatí — jinak by běžela dvě počítadla vedle sebe, i když je
 * kampaň právě pozastavená nebo skončená. Podnik jen s kampaněmi za položky nebo útratu jednoduché razítko dál používá.
 */
export async function maKampane(teamId: number): Promise<boolean> {
  try {
    await zajistiRazitka();
    const [r] = await sql`SELECT 1 AS x FROM client_stamp_campaigns WHERE team_id = ${teamId} AND rule_type = 'visit' LIMIT 1`;
    return !!r;
  } catch { return false; }
}

/** Kampaně „za návštěvu“, které běží (podle dat), a které z nich dávají razítko právě teď (den v týdnu, hodiny). */
export async function navstevniKampane(teamId: number, today: string): Promise<{ vse: StampCampaign[]; platne: StampCampaign[]; proc: string | null }> {
  const vse = (await activeCampaigns(teamId, today)).filter(c => c.rule_type === 'visit');
  const dow = isoDow(today); const hhmm = pragueHM();
  const platne = vse.filter(c => platiTed(c, dow, hhmm).plati);
  return { vse, platne, proc: vse.length && !platne.length ? platiTed(vse[0], dow, hhmm).duvod || null : null };
}

/** ISO den v týdnu (1 = pondělí … 7 = neděle) pro pražský den YYYY-MM-DD. */
export function isoDow(den: string): number {
  const d = new Date(`${den}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function stavZRadku(r: any): StavKarty & { rev: number; day_of: string | null; day_stamps: number } {
  return {
    stamps: Number(r?.stamps ?? 0), completed: Number(r?.completed ?? 0),
    started_at: parseDbTime(r?.started_at), last_stamp_at: parseDbTime(r?.last_stamp_at),
    last_completed_at: parseDbTime(r?.last_completed_at),
    rev: Number(r?.rev ?? 0), day_of: r?.day_of ? String(r.day_of) : null, day_stamps: Number(r?.day_stamps ?? 0),
  };
}

/** Čas, ve kterém běží plán: pražský den, den v týdnu a hodiny na zdi. */
function kdyJe(now: Date) {
  const day = pragueDayOf(now);
  return { day, dow: isoDow(day), hhmm: pragueHM(now) };
}

/** Propadnutí rozdělané karty při čtení: nuluje se hned, host se to dozví (expired_count). */
async function propadniPriCteni(c: Pick<StampCampaign, 'id' | 'team_id' | 'days_to_finish'>, row: any, now: Date): Promise<any> {
  const s = stavZRadku(row);
  if (!vyprselaKarta(c, s, now)) return row;
  const [upd] = await sql`
    UPDATE client_stamp_progress SET stamps = 0, expired_count = ${s.stamps}, expired_at = NOW(), started_at = NOW(), rev = rev + 1
    WHERE campaign_id = ${c.id} AND customer_id = ${Number(row.customer_id)} AND rev = ${s.rev}
    RETURNING *`;
  if (!upd) {
    // Mezitím se karta změnila (razítko, jiné čtení) — stav se přečte znovu, bez dalšího propadání.
    const [cur] = await sql`SELECT * FROM client_stamp_progress WHERE campaign_id = ${c.id} AND customer_id = ${Number(row.customer_id)}`;
    return cur ?? row;
  }
  await sql`
    INSERT INTO client_stamp_events (team_id, campaign_id, customer_id, kind, delta, before_stamps, before_completed, before_started_at, day, reason)
    VALUES (${c.team_id}, ${c.id}, ${Number(row.customer_id)}, 'expire', ${-s.stamps}, ${s.stamps}, ${s.completed}, ${row.started_at ? (s.started_at as Date).toISOString() : null}, ${kdyJe(now).day}, 'Karta nebyla dosbírána včas.')`;
  return upd;
}

/**
 * Průběhy člena napříč kampaněmi (mapa campaign_id → progress). Vypršelé karty
 * se při čtení vynulují (a zapamatují, ať se to host dozví).
 */
export async function progressFor(teamId: number, customerId: number): Promise<Map<number, any>> {
  try {
    await zajistiRazitka();
    const rows = await sql`
      SELECT sp.*, c.days_to_finish FROM client_stamp_progress sp
      JOIN client_stamp_campaigns c ON c.id = sp.campaign_id AND c.team_id = sp.team_id
      WHERE sp.team_id = ${teamId} AND sp.customer_id = ${customerId}` as any[];
    const now = new Date();
    const out = new Map<number, any>();
    for (const r of rows) {
      const nove = await propadniPriCteni({ id: Number(r.campaign_id), team_id: teamId, days_to_finish: Number(r.days_to_finish) || 0 }, r, now);
      out.set(Number(r.campaign_id), { ...nove, days_to_finish: r.days_to_finish });
    }
    return out;
  } catch { return new Map(); }
}

/** Průběh hosta z řádku databáze ve tvaru pro hostovskou kartu (lib/razitkaPravidla.ts). */
export function prubehHosta(r: any): PrubehHosta {
  return {
    stamps: Number(r?.stamps ?? 0), completed: Number(r?.completed ?? 0),
    started_at: parseDbTime(r?.started_at), last_completed_at: parseDbTime(r?.last_completed_at),
    expired_count: Number(r?.expired_count ?? 0),
  };
}

/** Co o kartě ví host: stav, kdy vyprší, zpráva o propadlé kartě. */
export function hostKarta(c: StampCampaign, row: any) {
  const s = stavZRadku(row);
  const kdy = vyprsiKdy(c, s);
  return {
    stamps: s.stamps, completed: s.completed,
    expiresAt: kdy ? pragueDayOf(kdy) : null,
    expiredCount: Number(row?.expired_count ?? 0),
    expiredAt: row?.expired_at ? pragueDayOf(parseDbTime(row.expired_at) ?? new Date()) : null,
  };
}

export interface VysledekRazitek {
  added: number; stamps: number; completions: number;
  skipped?: string; dropped?: number; expired?: number; already?: boolean;
}

export interface MoznostiRazitek {
  staffId?: number | null;
  /** Ruční připsání majitelem: bez okna platnosti, denního stropu a pauzy mezi kartami. */
  rucne?: boolean;
  reason?: string | null;
  /** Popis bonusové akce, který se připojí k poznámce v deníku. */
  poznamka?: string;
  /** applyBillToCampaigns: razítka navíc z bonusové akce (k razítkům, která účtenka dala). */
  razitka?: number;
  /** Druh záznamu v deníku razítek: běžný přírůstek, nebo ruční úprava majitelem. */
  druh?: 'earn' | 'manual';
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
 * Odměna za plnou kartu: jeden řádek kuponu na kampaň a lhůtu uplatnění (dřív každé dokončení
 * vyrobilo vlastní řádek a seznam kuponů zarostl) a pro hosta nárok s kódem. Název a popis kuponu se při
 * dalším dokončení srovnají s aktuálním nastavením kampaně. Nárok nese id události, ze které vznikl (storno).
 */
async function vydejOdmenu(c: StampCampaign, customerId: number, eventId: number | null) {
  // Lhůta se počítá od pražského dne, ne z UTC — po noční by jinak platila o den míň.
  const validUntil = c.days_to_redeem > 0 ? dayPlus(pragueToday(), c.days_to_redeem) : null;
  const titul = c.reward_title || `Odměna — ${c.name}`;
  const popis = await popisOdmeny(c);
  const [ex] = await sql`
    SELECT id FROM client_coupons
    WHERE team_id = ${c.team_id} AND campaign_id = ${c.id} AND kind = 'stamps' AND valid_until IS NOT DISTINCT FROM ${validUntil}::text
    ORDER BY id LIMIT 1`;
  let kuponId: number;
  if (ex) {
    await sql`UPDATE client_coupons SET title = ${titul}, description = ${popis} WHERE id = ${ex.id}`;
    kuponId = Number(ex.id);
  } else {
    const [k] = await sql`
      INSERT INTO client_coupons (team_id, title, description, cost_points, active, kind, valid_until, campaign_id)
      VALUES (${c.team_id}, ${titul}, ${popis}, 0, TRUE, 'stamps', ${validUntil}, ${c.id})
      RETURNING id`;
    kuponId = Number(k.id);
  }
  await sql`
    INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code, stamp_event_id)
    VALUES (${kuponId}, ${customerId}, ${c.team_id}, ${couponCode()}, ${eventId})`;
}

const razitekTvar = (n: number) => czForm(n, RAZITKO);

/**
 * Připíše kampani `count` razítek jednomu členovi. Řeší vypršení rozdělané
 * karty (od jejího začátku), pauzu po dokončení, limity (dokončené karty, denní
 * strop), okno dní a hodin, překlopení plné karty na kupon a — při stack_cards —
 * víc dokončení z jedné dávky. Přebytek, který se nevejde, se NEzahazuje tiše:
 * vrací se v `dropped` a píše se do deníku.
 *
 * Opakované volání se stejným `ref` nic nepřipíše (`already`).
 */
export async function addStamps(
  c: StampCampaign, customerId: number, count: number, ref: string, opt: MoznostiRazitek = {},
): Promise<VysledekRazitek> {
  if (count <= 0) return { added: 0, stamps: 0, completions: 0 };
  await zajistiRazitka();
  await sql`
    INSERT INTO client_stamp_progress (campaign_id, customer_id, team_id)
    VALUES (${c.id}, ${customerId}, ${c.team_id})
    ON CONFLICT (campaign_id, customer_id) DO NOTHING`;
  const now = new Date();
  const { day, dow, hhmm } = kdyJe(now);

  // Zabere ref ještě před zápisem: dvě souběžná volání se stejným refem nepřipíšou obě.
  const [ev] = await sql`
    INSERT INTO client_stamp_events (team_id, campaign_id, customer_id, kind, delta, ref, staff_id, day, reason)
    VALUES (${c.team_id}, ${c.id}, ${customerId}, ${opt.druh ?? 'earn'}, 0, ${ref}, ${opt.staffId ?? null}, ${day}, ${opt.reason ?? null})
    ON CONFLICT (campaign_id, customer_id, ref) WHERE ref IS NOT NULL AND kind = 'earn' DO NOTHING
    RETURNING id`;
  if (!ev) {
    const [cur] = await sql`SELECT stamps FROM client_stamp_progress WHERE campaign_id = ${c.id} AND customer_id = ${customerId}`;
    return { added: 0, stamps: Number(cur?.stamps ?? 0), completions: 0, already: true };
  }
  const eventId = Number(ev.id);
  const uvolni = () => sql`DELETE FROM client_stamp_events WHERE id = ${eventId}`.catch(() => {});

  let vysledek: Awaited<ReturnType<typeof sCasem<ReturnType<typeof stavZRadku>, ReturnType<typeof planAdd>>>>;
  try {
    vysledek = await sCasem({
      nacti: async () => {
        const [r] = await sql`SELECT * FROM client_stamp_progress WHERE campaign_id = ${c.id} AND customer_id = ${customerId}`;
        return stavZRadku(r);
      },
      spocitej: s => planAdd(c, s, count, {
        now, dow, hhmm, rucne: opt.rucne, dnesPripsano: s.day_of === day ? s.day_stamps : 0,
      }),
      zapis: async (s, p) => {
        // Nic se nepřipisuje a nic nevypršelo — není co zapisovat.
        if (!p.ok && p.vyprselo === 0) return true;
        const pripsano = p.ok ? p.pridano : 0;
        const [r] = await sql`
          UPDATE client_stamp_progress SET
            stamps = ${p.ok ? p.razitek : 0},
            completed = completed + ${p.ok ? p.dokonceni : 0},
            started_at = ${(p.ok ? p.zacatekKarty : now).toISOString()},
            last_stamp_at = CASE WHEN ${pripsano}::int > 0 THEN NOW() ELSE last_stamp_at END,
            last_completed_at = CASE WHEN ${p.ok ? p.dokonceni : 0}::int > 0 THEN NOW() ELSE last_completed_at END,
            day_of = ${day},
            day_stamps = ${(s.day_of === day ? s.day_stamps : 0) + (opt.rucne ? 0 : pripsano)},
            expired_count = CASE WHEN ${p.vyprselo}::int > 0 THEN ${p.vyprselo} WHEN ${pripsano}::int > 0 THEN 0 ELSE expired_count END,
            expired_at = CASE WHEN ${p.vyprselo}::int > 0 THEN NOW() WHEN ${pripsano}::int > 0 THEN NULL ELSE expired_at END,
            rev = rev + 1
          WHERE campaign_id = ${c.id} AND customer_id = ${customerId} AND rev = ${s.rev}
          RETURNING rev`;
        return !!r;
      },
    });
  } catch (e) { await uvolni(); throw e; }
  if (!vysledek) { await uvolni(); throw new Error('Kartu právě upravuje někdo jiný. Zkus to za chvilku znovu.'); }

  const { stav: s, plan: p } = vysledek;
  if (p.vyprselo > 0) {
    await sql`
      INSERT INTO client_stamp_events (team_id, campaign_id, customer_id, kind, delta, before_stamps, before_completed, before_started_at, day, reason)
      VALUES (${c.team_id}, ${c.id}, ${customerId}, 'expire', ${-p.vyprselo}, ${s.stamps}, ${s.completed}, ${s.started_at ? s.started_at.toISOString() : null}, ${day}, 'Karta nebyla dosbírána včas.')`;
  }
  if (!p.ok) {
    await uvolni();
    return { added: 0, stamps: 0, completions: 0, skipped: p.duvod || undefined, expired: p.vyprselo || undefined };
  }

  const stampsPred = p.vyprselo > 0 ? 0 : s.stamps;
  await sql`
    UPDATE client_stamp_events SET delta = ${p.pridano}, completions = ${p.dokonceni},
      before_stamps = ${stampsPred}, before_completed = ${s.completed},
      before_started_at = ${p.vyprselo > 0 ? now.toISOString() : (s.started_at ? s.started_at.toISOString() : null)},
      card_started_at = ${p.dokoncenaZacatek ? p.dokoncenaZacatek.toISOString() : null}
    WHERE id = ${eventId}`;
  // Každé dokončení = kupon s kódem (host ho ukáže u kasy).
  for (let i = 0; i < p.dokonceni; i++) await vydejOdmenu(c, customerId, eventId);

  const pozn = [
    p.dokonceni > 0 ? `${c.name}: +${p.pridano} ${razitekTvar(p.pridano)}, karta dokončena${p.dokonceni > 1 ? ` ${p.dokonceni}×` : ''}`
      : `${c.name}: +${p.pridano} ${razitekTvar(p.pridano)} (${p.razitek}/${c.required_stamps})`,
    p.zahozeno > 0 ? `${p.zahozeno} ${razitekTvar(p.zahozeno)} navíc se nevešlo` : '',
    p.vyprselo > 0 ? `předchozí karta (${p.vyprselo}) vypršela` : '',
    opt.reason ? `důvod: ${opt.reason}` : '',
  ].filter(Boolean).join(' · ');
  await sql`
    INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note, staff_id)
    VALUES (${c.team_id}, ${customerId}, 0, 'visit', ${ref}, ${pozn + (opt.poznamka ?? '')}, ${opt.staffId ?? null})`;
  return {
    added: p.pridano, stamps: p.razitek, completions: p.dokonceni,
    dropped: p.zahozeno || undefined, expired: p.vyprselo || undefined,
  };
}

/** Lidská věta o výsledku pro obsluhu (jedna kampaň). */
export function vetaVysledku(c: StampCampaign, r: VysledekRazitek): string {
  if (r.already) return `${c.name}: razítko už bylo připsáno`;
  if (r.skipped) return `${c.name}: ${r.skipped}`;
  const kon = r.dropped ? ` (${r.dropped} ${razitekTvar(r.dropped)} navíc se nevešlo)` : '';
  const vyp = r.expired ? ` Předchozí karta (${r.expired}) vypršela.` : '';
  return (r.completions > 0
    ? `${c.name}: karta dokončena${r.completions > 1 ? ` ${r.completions}×` : ''} — odměna je v kuponech${kon}`
    : `${c.name}: +${r.added} (${r.stamps}/${c.required_stamps})${kon}`) + vyp;
}

/** Položka účtenky pro vyhodnocení pravidel. `price` je cena za kus (Storyous), když ji účtenka nese. */
export interface PolozkaUctu { productId: string | null; qty: number; price?: number | null }

/**
 * Razítka z účtenky nebo ručně zadané útraty: spočítá zásah pravidel všech
 * produktových kampaní podle položek (productId, qty, cena), vybere, které
 * účtenku dostanou (kombinovatelnost) a připíše je. Položka i celá kategorie
 * nabídky může razítko dávat, nebo být vyloučená. Párování jde přes nabídku
 * podniku (menu_items.pos_product_id). Ruční položky (`rucniPolozky`: itemId
 * nabídky + počet) se berou přímo, bez pokladny. Útrata z ruční částky bez
 * položek spouští jen pravidlo „za útratu".
 */
export async function applyBillToCampaigns(
  teamId: number, customerId: number, today: string,
  bill: { billId: string; total: number; items: PolozkaUctu[]; rucniPolozky?: { itemId: number; qty: number }[] },
  opt: MoznostiRazitek = {},
): Promise<{ lines: string[]; anything: boolean; expired: number; lost: number }> {
  const campaigns = (await activeCampaigns(teamId, today)).filter(c => c.rule_type !== 'visit');
  if (!campaigns.length) return { lines: [], anything: false, expired: 0, lost: 0 };

  // Jedním dotazem: položky nabídky podle pokladního ID i podle ID (ruční položky) s jejich kategorií.
  const posIds = Array.from(new Set(bill.items.map(i => i.productId).filter((x): x is string => !!x)));
  const itemIds = Array.from(new Set((bill.rucniPolozky ?? []).map(r => r.itemId).filter(x => x > 0)));
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
  const radky: RadekUctu[] = [];
  for (const it of bill.items) {
    const v = it.productId ? byPos.get(it.productId) : null;
    const qty = Math.max(0, Math.round(it.qty));
    radky.push({ itemId: v?.itemId ?? null, sectionId: v?.sectionId ?? null, qty, price: it.price != null && Number.isFinite(it.price) ? it.price * qty : null });
  }
  for (const r of bill.rucniPolozky ?? []) {
    const v = byId.get(r.itemId);
    if (v) radky.push({ itemId: v.itemId, sectionId: v.sectionId, qty: Math.max(0, Math.round(r.qty)), price: null });
  }

  const lines: string[] = [];
  let anything = false; let expired = 0; let lost = 0;
  const zasahy = campaigns.map(c => ({ c, count: spocitejRazitka(c, { total: bill.total, radky }).count }));
  const { vybrane, vynechane } = vyberKampane(zasahy);
  for (const v of vynechane) lines.push(`${v.c.name}: účtenku už dostala karta „${vybrane[0].c.name}“ (kampaně se nekombinují).`);
  for (const { c, count } of vybrane) {
    // Bonusová akce přidá razítka navíc jen kampaním, kterým účtenka razítko dala.
    const navic = Math.max(0, opt.razitka ?? 0);
    const r = await addStamps(c, customerId, count + navic, `bill:${bill.billId}`, { ...opt, poznamka: navic > 0 ? opt.poznamka : '' });
    if (r.already) continue;
    if (!r.skipped) anything = true;
    expired += r.expired ?? 0; lost += r.dropped ?? 0;
    lines.push(vetaVysledku(c, r));
  }
  return { lines, anything, expired, lost };
}
