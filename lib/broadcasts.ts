// Zprávy členům v plné síle (po vzoru Kartičky): zpráva umí počkat na svůj
// čas (scheduled_at), mířit na publikum (všem / kdo dlouho nebyl / úroveň /
// ruční skupina) a nést cíl, kam hosta vezme (link_kind).
//
// Plánování bez minutového cronu: naplánovaná zpráva leží ve frontě a
// dispatchDueBroadcasts() ji pošle, jakmile ji kdokoli „potká" — otevření
// správy, návštěva hosta (client/me), nebo noční crony. Odeslání si řádek
// atomicky přivlastní (status scheduled → sent), takže dva souběžné
// dispatchery zprávu nepošlou dvakrát.

import { tierThresholds, tierRulesFromProfile } from './clientSlots';
import { sql } from './client';
import { notifyUsers, notifyUser } from './push';
import { pragueToday } from './pragueTime';
import { hit } from './rateLimit';
import { obnovDynamickeSkupiny } from './clenoveDb';
import { SEGMENTY, jeSegment, stitekPublika, vyberClenu, spoctiSegmenty, type ClenSegmentu, type KontextSegmentu } from './segmenty';
import { ZPRAV_DENNE, DUPLICITA_MS, textOznameni, klicLimituZprav, simpleHash, type PrilohaZpravy, type VstupZpravy } from './zpravyPravidla';

export { AUDIENCES } from './zpravyPravidla';

export function audienceLabel(a: string, groupName?: string | null): string {
  if (a === 'selection') return 'vybraní hosté';
  if (jeSegment(a)) return stitekPublika(a) ?? 'všem členům';
  if (a === 'tier:silver') return 'Stříbrní a výš';
  if (a === 'tier:gold') return 'Zlatí a výš';
  if (a === 'tier:platinum') return 'Platinoví hosté';
  if (a.startsWith('group:')) return groupName ? `skupina ${groupName}` : 'skupina';
  return 'všem členům';
}

/** Kam zpráva hosta vezme. Cesta se skládá ze slugu podniku. */
export function linkFor(kind: string | null | undefined, slug: string | null): string {
  const base = slug ? `/client/${slug}` : '/client';
  if (kind === 'loyalty') return `${base}?tab=loyalty`;
  if (kind === 'events') return `${base}?tab=menu`;
  if (kind === 'order') return `${base}?tab=order`;
  if (kind === 'me') return '/client/me';
  return base;
}

/** Členové s údaji, podle kterých se řadí do segmentů (jeden průchod, bez N+1). */
async function nactiClenySegmentu(teamId: number): Promise<{ clenove: ClenSegmentu[]; kontext: KontextSegmentu }> {
  const rows = await sql`
    SELECT m.customer_id, m.points, m.last_visit_at, m.joined_at, us.birthday
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${teamId}` as any[];
  // Razítka: kolik chybí do nejbližší odměny v aktivních kampaních, kde host už něco nasbíral.
  const chybi = new Map<number, number>();
  try {
    const st = await sql`
      SELECT p.customer_id, MIN(c.required_stamps - p.stamps)::int AS chybi
      FROM client_stamp_progress p JOIN client_stamp_campaigns c ON c.id = p.campaign_id
      WHERE p.team_id = ${teamId} AND c.active = TRUE AND p.stamps > 0 AND p.stamps < c.required_stamps
      GROUP BY p.customer_id` as any[];
    for (const r of st) chybi.set(Number(r.customer_id), Number(r.chybi));
  } catch { /* bez kampaní nikdo blízko není */ }
  let cenyKuponu: number[] = [];
  try {
    await zajistiKupony().catch(() => {});
    const kp = await sql`SELECT cost_points FROM client_coupons WHERE team_id = ${teamId} AND active = TRUE AND status = 'live' AND kind = 'offer' AND cost_points > 0` as any[];
    cenyKuponu = kp.map(r => Number(r.cost_points));
  } catch { cenyKuponu = []; }
  const dnes = pragueToday();
  return {
    clenove: rows.map(r => ({
      id: Number(r.customer_id), points: Number(r.points) || 0,
      lastVisitAt: r.last_visit_at ?? null, joinedAt: r.joined_at ?? null,
      birthday: r.birthday ? String(r.birthday) : null,
      chybiRazitek: chybi.get(Number(r.customer_id)) ?? null,
    })),
    kontext: { now: new Date(), mesic: parseInt(dnes.slice(5, 7), 10), cenyKuponu },
  };
}

/** Počty členů ve všech segmentech, pro výběr komu zprávu poslat. */
export async function segmentyPocty(teamId: number): Promise<Record<string, number>> {
  try {
    const { clenove, kontext } = await nactiClenySegmentu(teamId);
    return spoctiSegmenty(clenove, kontext);
  } catch {
    return Object.fromEntries(SEGMENTY.map(s => [s.id, 0]));
  }
}

/**
 * Kdo do publika patří. Úrovně se počítají z prahů podniku (visits),
 * „tier:silver" znamená Stříbrný A VÝŠ — zpráva pro věrné, ne jen pro
 * jednu přihrádku.
 */
export async function audienceIds(teamId: number, audience: string): Promise<number[]> {
  let rows: any[] = [];
  if (jeSegment(audience)) {
    const { clenove, kontext } = await nactiClenySegmentu(teamId);
    return vyberClenu(audience, clenove, kontext);
  } else if (audience.startsWith('tier:')) {
    // Prahy i režim (návštěvy / útrata) z jedné funkce s pravidly podniku.
    const [p] = await sql`SELECT * FROM client_profiles WHERE team_id = ${teamId}`;
    const th = tierThresholds(tierRulesFromProfile(p));
    const tier = audience.slice(5);
    const from = tier === 'platinum' ? (th.platinum || th.gold) : tier === 'gold' ? th.gold : th.silver;
    rows = th.by === 'spend'
      ? await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND spend >= ${from}` as any[]
      : await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND visits >= ${from}` as any[];
  } else if (audience.startsWith('group:')) {
    const gid = parseInt(audience.slice(6), 10);
    if (Number.isFinite(gid)) {
      // Dynamická skupina se před odesláním přepočítá, ať zpráva míří na dnešní stav, ne na včerejší.
      try { await obnovDynamickeSkupiny(teamId, { force: true, groupId: gid }); } catch (e) { console.error('[zpravy] přepočet skupiny', e); }
      try {
        rows = await sql`SELECT customer_id FROM client_group_members WHERE team_id = ${teamId} AND group_id = ${gid}` as any[];
      } catch { rows = []; }
    }
  } else {
    rows = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId}` as any[];
  }
  return rows.map(r => Number(r.customer_id));
}

/** Kolik členů z publika má zapnuté novinky, tedy zprávu opravdu dostane. Ostatním ji kategorie „novinky“ nepustí. */
export async function dosahPublika(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM users WHERE id = ANY(${ids}) AND notif_prefs->>'novinky' = 'true'` as any[];
    return Number(r?.n) || 0;
  } catch { return 0; }
}

// ---- Denní limit -----------------------------------------------------------------
//
// Limit se spotřebuje při ODESLÁNÍ, ne při zadání: naplánovaná zpráva na příští týden
// nesmí sníst dnešní slot. Počítadlo je atomický upsert (lib/rateLimit), takže dva
// souběžné požadavky nepošlou šestou zprávu. Klíč nese pražský den, takže se o půlnoci
// počítá znovu.

/** Kolik zpráv dnes odešlo (jen čtení, nespotřebuje slot). */
export async function odeslanoDnes(teamId: number): Promise<number> {
  try {
    const [r] = await sql`SELECT count FROM auth_attempts WHERE key = ${klicLimituZprav(teamId, pragueToday())}` as any[];
    return Math.min(ZPRAV_DENNE, Number(r?.count) || 0);
  } catch { return 0; }
}

/** Spotřebuje jeden denní slot. false = limit vyčerpán. */
async function vezmiSlot(teamId: number): Promise<boolean> {
  const r = await hit(klicLimituZprav(teamId, pragueToday()), ZPRAV_DENNE, 36 * 3600, { failClosed: true });
  return r.ok;
}

// ---- Přílohy: kupon nebo promo kód -------------------------------------------------

export interface NactenaPriloha extends PrilohaZpravy { couponId: number | null; promoId: number | null }

/**
 * Ověří, že připojený kupon (nabídka) nebo promo kód patří podniku a dá se právě teď uplatnit.
 * Uplatnění samo řeší stávající logika kuponů a promo kódů; zpráva jen říká, co a kde.
 */
export async function nactiPrilohu(teamId: number, couponId: number | null, promoId: number | null): Promise<{ priloha: NactenaPriloha | null } | { chyba: string }> {
  const dnes = pragueToday();
  if (couponId) {
    const [c] = await sql`
      SELECT id, title FROM client_coupons
      WHERE id = ${couponId} AND team_id = ${teamId} AND kind = 'offer' AND active = TRUE
        AND (valid_until IS NULL OR valid_until = '' OR valid_until >= ${dnes})` as any[];
    if (!c) return { chyba: 'Připojený kupon už neexistuje, je vypnutý nebo mu skončila platnost.' };
    return { priloha: { couponId, promoId: null, kupon: { title: String(c.title) } } };
  }
  if (promoId) {
    const [p] = await sql`
      SELECT id, code, title FROM client_promos
      WHERE id = ${promoId} AND team_id = ${teamId} AND active = TRUE
        AND (valid_until IS NULL OR valid_until = '' OR valid_until >= ${dnes})
        AND (max_uses IS NULL OR uses < max_uses)` as any[];
    if (!p) return { chyba: 'Připojený promo kód je vypnutý, vypršel nebo už je vyčerpaný.' };
    return { priloha: { couponId: null, promoId, promo: { code: String(p.code), title: String(p.title) } } };
  }
  return { priloha: null };
}

/** Pošle jeden řádek zprávy (už přivlastněný) a zapíše, kolika hostům došla a kolik si novinky vypnulo. */
async function deliver(row: any, idsOverride?: number[]): Promise<{ doruceno: number; ztlumeno: number }> {
  const teamId = Number(row.team_id);
  const [p] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${teamId}`;
  const ids = idsOverride ?? await audienceIds(teamId, String(row.audience ?? 'all'));
  // Příloha, která mezitím přestala platit, se vynechá; zpráva sama odejde.
  let priloha: PrilohaZpravy | null = null;
  try {
    const n = await nactiPrilohu(teamId, row.coupon_id ? Number(row.coupon_id) : null, row.promo_id ? Number(row.promo_id) : null);
    if ('priloha' in n) priloha = n.priloha;
  } catch { priloha = null; }
  const text = textOznameni(String(row.title), row.body ? String(row.body) : null, priloha);
  const r = ids.length
    ? await notifyUsers(ids, { ...text, link: linkFor(row.link_kind, p?.slug ?? null), type: 'info', category: 'novinky' })
    : { doruceno: 0, ztlumeno: 0 };
  await sql`UPDATE client_broadcasts SET recipients = ${r.doruceno}, muted = ${r.ztlumeno} WHERE id = ${row.id}`;
  return r;
}

/**
 * Odešle všechny naplánované zprávy, jejichž čas nastal. Bezpečné volat
 * odkudkoli a klidně souběžně; chyba nesmí položit volající endpoint.
 * Zpráva, která by přesáhla denní limit podniku, zůstane ve frontě a odejde
 * při dalším „potkání“ po půlnoci (limit se bere při odeslání).
 */
export async function dispatchDueBroadcasts(): Promise<number> {
  let sent = 0;
  try {
    const due = await sql`
      SELECT id, team_id FROM client_broadcasts
      WHERE status = 'scheduled' AND scheduled_at <= NOW()
      ORDER BY scheduled_at LIMIT 5` as any[];
    const bezSlotu = new Set<number>();
    for (const d of due) {
      if (bezSlotu.has(Number(d.team_id))) continue;
      // Atomické přivlastnění: kdo přepne scheduled → sent, ten posílá.
      const [claimed] = await sql`
        UPDATE client_broadcasts SET status = 'sent', sent_at = NOW()
        WHERE id = ${d.id} AND status = 'scheduled' RETURNING *`;
      if (!claimed) continue;
      if (!await vezmiSlot(Number(claimed.team_id))) {
        // Dnešní limit je vyčerpaný: vrátit do fronty, ať si ji nikdo nepomyslí odeslanou.
        await sql`UPDATE client_broadcasts SET status = 'scheduled', sent_at = scheduled_at WHERE id = ${claimed.id} AND status = 'sent'`;
        bezSlotu.add(Number(claimed.team_id));
        continue;
      }
      try { await deliver(claimed); sent += 1; }
      catch (e) { console.error('broadcast deliver failed', claimed.id, e); }
    }
  } catch { /* fronta bez migrace nebo výpadek — příště */ }
  return sent;
}

export type VysledekOdeslani =
  | { ok: true; row: any; doruceno: number; ztlumeno: number }
  | { ok: false; chyba: string; status: number };

/**
 * Okamžité odeslání: dvojklik se chytí atomickým klíčem (stejná zpráva stejnému publiku
 * za pár minut je jedna zpráva), pak se vezme denní slot a teprve potom se zpráva založí.
 * `ids` = ruční výběr hostů (hromadná akce v seznamu členů), jinak se publikum rozbalí z `audience`.
 */
export async function odesliZpravu(a: { teamId: number; userId: number; data: VstupZpravy; ids?: number[]; audience?: string }): Promise<VysledekOdeslani> {
  const { teamId, userId, data } = a;
  const audience = a.audience ?? data.audience;
  const klic = `client-broadcast-dup:${teamId}:${simpleHash(`${data.title}|${data.body}|${audience}|${(a.ids ?? []).length}`)}`;
  const dup = await hit(klic, 1, Math.round(DUPLICITA_MS / 1000));
  if (!dup.ok) return { ok: false, status: 409, chyba: 'Tuhle zprávu jsi právě odeslal. Počkej chvíli, než ji pošleš znovu.' };
  if (!await vezmiSlot(teamId)) return { ok: false, status: 429, chyba: `Dnes už odešlo ${ZPRAV_DENNE} zpráv. Víc jich členům neposílej, ať jim nezevšední. Zítra půjde další.` };
  const [row] = await sql`
    INSERT INTO client_broadcasts (team_id, title, body, recipients, sent_by, audience, status, link_kind, coupon_id, promo_id)
    VALUES (${teamId}, ${data.title}, ${data.body || null}, 0, ${userId}, ${audience}, 'sent', ${data.linkKind}, ${data.couponId}, ${data.promoId})
    RETURNING *`;
  const r = await deliver(row, a.ids);
  return { ok: true, row: { ...row, recipients: r.doruceno, muted: r.ztlumeno }, doruceno: r.doruceno, ztlumeno: r.ztlumeno };
}

/** Zkušební zpráva jen odesílateli: bez řádku v historii, bez denního slotu, bez ohledu na jeho vlastní vypnuté novinky. */
export async function zkusebniZprava(userId: number, teamId: number, data: VstupZpravy): Promise<{ ok: true } | { ok: false; chyba: string }> {
  const [p] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${teamId}`;
  const n = await nactiPrilohu(teamId, data.couponId, data.promoId);
  if ('chyba' in n) return { ok: false, chyba: n.chyba };
  const text = textOznameni(`[Zkouška] ${data.title}`, data.body, n.priloha);
  // Bez kategorie „novinky“: správce, který sám novinky nechce, by jinak zkoušku nikdy nedostal.
  await notifyUser(userId, { ...text, link: linkFor(data.linkKind, p?.slug ?? null), type: 'info' });
  return { ok: true };
}
