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
import { planAdd, sCasem, vyprselaKarta, vyprsiKdy, RAZITKO, type StavKarty, type Stav } from './stampsPlan';
import { czForm } from './czech';

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
  /** Druh záznamu v deníku razítek: běžný přírůstek, nebo ruční úprava majitelem. */
  druh?: 'earn' | 'manual';
}

/** Kupon za plnou kartu: kupon i nárok jedním příkazem, ať nevznikne kupon bez nároku. */
async function vydejOdmenu(c: StampCampaign, customerId: number, eventId: number | null) {
  // Lhůta se počítá od pražského dne, ne z UTC — po noční by jinak platila o den míň.
  const validUntil = c.days_to_redeem > 0 ? dayPlus(pragueToday(), c.days_to_redeem) : null;
  await sql`
    WITH k AS (
      INSERT INTO client_coupons (team_id, title, description, cost_points, active, kind, valid_until, campaign_id, stamp_event_id)
      VALUES (${c.team_id}, ${c.reward_title || `Odměna — ${c.name}`}, ${'Za plnou kartu „' + c.name + '“.'}, 0, TRUE, 'stamps', ${validUntil}, ${c.id}, ${eventId})
      RETURNING id)
    INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code)
    SELECT id, ${customerId}, ${c.team_id}, ${couponCode()} FROM k`;
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
    VALUES (${c.team_id}, ${customerId}, 0, 'visit', ${ref}, ${pozn}, ${opt.staffId ?? null})`;
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
 * produktových kampaní podle položek (productId, qty, cena) a připíše je.
 * Párování jde přes nabídku podniku (menu_items.pos_product_id). Ruční položky
 * (`rucniPolozky`: itemId nabídky + počet) se berou přímo, bez pokladny.
 * Útrata z ruční částky bez položek spouští jen pravidlo „za útratu".
 */
export async function applyBillToCampaigns(
  teamId: number, customerId: number, today: string,
  bill: { billId: string; total: number; items: PolozkaUctu[]; rucniPolozky?: { itemId: number; qty: number }[] },
  opt: MoznostiRazitek = {},
): Promise<{ lines: string[]; anything: boolean }> {
  const campaigns = (await activeCampaigns(teamId, today)).filter(c => c.rule_type !== 'visit');
  if (!campaigns.length) return { lines: [], anything: false };

  // Jedním dotazem: které itemId nabídky odpovídají produktům z účtenky.
  const wanted = Array.from(new Set(campaigns.flatMap(c => [...c.stamp_items, ...c.excluded_items].map(i => i.itemId))));
  let posByItem = new Map<number, string>();
  if (wanted.length) {
    try {
      const rows = await sql`
        SELECT mi.id, mi.pos_product_id FROM menu_items mi
        JOIN menu_sections ms ON ms.id = mi.section_id
        JOIN menu_boards mb ON mb.id = ms.board_id AND mb.team_id = ${teamId}
        WHERE mi.id = ANY(${wanted}) AND mi.pos_product_id IS NOT NULL`;
      posByItem = new Map((rows as any[]).map(r => [Number(r.id), String(r.pos_product_id)]));
    } catch { /* nabídka bez migrace */ }
  }
  const qtyByProduct = new Map<string, number>();
  const hodnotaByProduct = new Map<string, number>();
  for (const it of bill.items) {
    if (!it.productId) continue;
    const q = Math.max(0, Math.round(it.qty));
    qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + q);
    if (it.price != null && Number.isFinite(it.price)) hodnotaByProduct.set(it.productId, (hodnotaByProduct.get(it.productId) ?? 0) + it.price * q);
  }
  const rucne = new Map<number, number>();
  for (const r of bill.rucniPolozky ?? []) rucne.set(r.itemId, (rucne.get(r.itemId) ?? 0) + Math.max(0, Math.round(r.qty)));

  const lines: string[] = [];
  let anything = false;
  for (const c of campaigns) {
    let count = 0;
    if (c.rule_type === 'products') {
      for (const ref2 of c.stamp_items) {
        const pos = posByItem.get(ref2.itemId);
        if (pos) count += qtyByProduct.get(pos) ?? 0;
        count += rucne.get(ref2.itemId) ?? 0;
      }
      if (c.one_per_order) count = Math.min(count, 1);
    } else if (c.rule_type === 'min_value') {
      // Vyloučené položky (dárkové karty, pečivo…) se z částky odečtou.
      let hodnota = bill.total;
      for (const ex of c.excluded_items) {
        const pos = posByItem.get(ex.itemId);
        if (pos) hodnota -= hodnotaByProduct.get(pos) ?? 0;
      }
      hodnota = Math.max(0, hodnota);
      const min = Math.max(1, Number(c.min_value) || 0);
      if (hodnota >= min) count = c.min_value_multiple ? Math.floor(hodnota / min) : 1;
    }
    if (count <= 0) continue;
    const r = await addStamps(c, customerId, count, `bill:${bill.billId}`, opt);
    if (r.already) continue;
    if (!r.skipped) anything = true;
    lines.push(vetaVysledku(c, r));
  }
  return { lines, anything };
}
