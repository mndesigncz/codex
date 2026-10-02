// Zprávy členům v plné síle (po vzoru Kartičky): zpráva umí počkat na svůj
// čas (scheduled_at), mířit na publikum (všem / kdo dlouho nebyl / úroveň /
// skupina / kombinace segmentů), jít jako oznámení i e-mail a nést cíl, kam
// hosta vezme (link_kind).
//
// E-maily mají vlastní frontu: zpráva si pamatuje kurzor (email_pos) v seznamu
// příjemců a každé „potkání“ pošle další dávku. Dávku si řádek přivlastní
// posunem kurzoru, takže se žádný e-mail nepošle dvakrát ani při souběhu.
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
import { obnovDynamickeSkupiny, nactiPrijemce, type PrijemceSDetaily } from './clenoveDb';
import { zajistiSchemaClenu } from './clenoveSchema';
import { SEGMENTY, jeSegment, stitekPublika, vyberClenu, spoctiSegmenty, type ClenSegmentu, type KontextSegmentu } from './segmenty';
import { ctiKombinaci, sloucMnoziny, stitekKombinace } from './skupinyPravidla';
import { ZPRAV_DENNE, DUPLICITA_MS, textOznameni, klicLimituZprav, simpleHash, type PrilohaZpravy, type VstupZpravy } from './zpravyPravidla';
import {
  dosahZpravy, jeKanal, posilaEmail, posilaPush, procNedostaneEmail, type KanalyZpravy, type DosahZpravy,
} from './zpravyKanaly';
import { odkazOdhlaseni, sestavEmailZpravy, predmetZpravy } from './zpravyEmail';
import { sendNovinkyEmail, odkazovyZaklad } from './email';
import { cistyJazyk } from './i18n/config';

/** Kolik e-mailů pošle jedna dávka a jak dlouho smí dávky v jednom volání běžet. */
export const DAVKA_EMAILU = 10;
export const ROZPOCET_ROUTY_MS = 40_000;
export const ROZPOCET_NAVSTEVY_MS = 6_000;

export { AUDIENCES } from './zpravyPravidla';

export function audienceLabel(a: string, groupName?: string | null): string {
  if (a === 'selection') return 'vybraní hosté';
  if (jeSegment(a)) return stitekPublika(a) ?? 'všem členům';
  if (a === 'tier:silver') return 'Stříbrní a výš';
  if (a === 'tier:gold') return 'Zlatí a výš';
  if (a === 'tier:platinum') return 'Platinoví hosté';
  if (a.startsWith('group:')) return groupName ? `skupina ${groupName}` : 'skupina';
  const k = ctiKombinaci(a, { skupiny: true });
  if (k) return stitekKombinace(k);
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

/** Členové s údaji, podle kterých se řadí do segmentů (jeden průchod, bez N+1). Blokovaní se nepočítají. */
async function nactiClenySegmentu(teamId: number): Promise<{ clenove: ClenSegmentu[]; kontext: KontextSegmentu }> {
  await zajistiSchemaClenu();
  const rows = await sql`
    SELECT m.customer_id, m.points, m.last_visit_at, m.joined_at, us.birthday
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${teamId} AND m.blocked = FALSE` as any[];
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
    const kp = await sql`SELECT cost_points FROM client_coupons WHERE team_id = ${teamId} AND active = TRUE AND cost_points > 0` as any[];
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

/** Jednoduché publikum (bez kombinace): segment, úroveň, skupina (i dynamická, ta má členy materializované), všichni. */
async function idsJednoduche(teamId: number, audience: string): Promise<number[]> {
  let rows: any[] = [];
  if (jeSegment(audience)) {
    const { clenove, kontext } = await nactiClenySegmentu(teamId);
    return vyberClenu(audience, clenove, kontext);
  } else if (audience.startsWith('tier:') || audience === 'gold') {
    // Prahy i režim (návštěvy / útrata) z jedné funkce s pravidly podniku.
    const [p] = await sql`SELECT * FROM client_profiles WHERE team_id = ${teamId}`;
    const th = tierThresholds(tierRulesFromProfile(p));
    const tier = audience === 'gold' ? 'gold' : audience.slice(5);
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

async function blokovaniIds(teamId: number): Promise<Set<number>> {
  try {
    await zajistiSchemaClenu();
    const rows = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND blocked = TRUE` as any[];
    return new Set(rows.map(r => Number(r.customer_id)));
  } catch { return new Set(); }
}

/**
 * Kdo do publika patří (blokovaní nikdy). Úrovně se počítají z prahů podniku (visits),
 * „tier:silver“ znamená Stříbrný A VÝŠ — zpráva pro věrné, ne jen pro jednu přihrádku.
 * Kombinace `mix:…` spojí množiny podle režimu (A / NEBO, „kromě“).
 */
export async function audienceIds(teamId: number, audience: string): Promise<number[]> {
  const k = ctiKombinaci(audience, { skupiny: true });
  let ids: number[];
  if (k) {
    const casti = await Promise.all(k.casti.map(async c => ({ cast: c, ids: await idsJednoduche(teamId, c.startsWith('!') ? c.slice(1) : c) })));
    ids = sloucMnoziny(k.rezim, casti);
  } else {
    ids = await idsJednoduche(teamId, audience);
  }
  const blok = await blokovaniIds(teamId);
  return blok.size ? ids.filter(id => !blok.has(id)) : ids;
}

/** Skupiny podniku s počty pro výběr publika. Archivované zprávám nenabízíme. */
export async function skupinyKVyberu(teamId: number): Promise<{ id: number; name: string; members: number; archived: boolean }[]> {
  try {
    await zajistiSchemaClenu();
    await obnovDynamickeSkupiny(teamId).catch(() => {});
    const rows = await sql`
      SELECT g.id, g.name, g.archived, (SELECT COUNT(*)::int FROM client_group_members gm WHERE gm.group_id = g.id AND gm.team_id = g.team_id) AS members
      FROM client_groups g WHERE g.team_id = ${teamId} ORDER BY g.archived, g.name, g.id` as any[];
    return rows.map(g => ({ id: Number(g.id), name: String(g.name), members: Number(g.members) || 0, archived: g.archived === true }));
  } catch { return []; }
}

/**
 * Dosah zprávy: kolik členů z publika ji opravdu dostane přes zvolený kanál a proč ostatní ne
 * (bez souhlasu, bez e-mailu, vypnuté e-maily, blokovaní). Číslo, které provozovatel potřebuje vidět předem.
 */
export async function dosahPublika(teamId: number, ids: number[], kanal: KanalyZpravy = 'push'): Promise<DosahZpravy> {
  const prijemci = ids.length ? await nactiPrijemce(teamId, ids) : [];
  return dosahZpravy(prijemci, kanal);
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

async function profilPodniku(teamId: number): Promise<{ slug: string | null; podnik: string; jazykPodniku: string | null }> {
  const [p] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${teamId}`;
  let podnik = 'náš podnik'; let jazyk: string | null = null;
  try {
    const [t] = await sql`SELECT COALESCE(NULLIF(share_theme->>'businessName', ''), name) AS business, default_lang FROM teams WHERE id = ${teamId}`;
    if (t?.business) podnik = String(t.business);
    jazyk = t?.default_lang ?? null;
  } catch { /* před migrací */ }
  return { slug: p?.slug ?? null, podnik, jazykPodniku: jazyk };
}

/** Příloha zprávy (kupon nebo promo kód), která pořád platí; jinak null a zpráva odejde bez ní. */
async function prilohaRadku(row: any): Promise<PrilohaZpravy | null> {
  try {
    const n = await nactiPrilohu(Number(row.team_id), row.coupon_id ? Number(row.coupon_id) : null, row.promo_id ? Number(row.promo_id) : null);
    return 'priloha' in n ? n.priloha : null;
  } catch { return null; }
}

/** Pošle jeden e-mail členovi. Vrací, zda odešel. Chyby se nepropagují. */
async function posliEmailClenovi(
  row: any, p: PrijemceSDetaily, kontext: { podnik: string; odkaz: string; priloha: PrilohaZpravy | null; jazykPodniku: string | null }, zkusebni = false,
): Promise<{ sent: boolean; error: string | null }> {
  if (!p.email) return { sent: false, error: 'Člen nemá e-mail.' };
  const odh = odkazOdhlaseni(odkazovyZaklad(), p.id);
  const mail = sestavEmailZpravy({
    podnik: kontext.podnik, title: String(row.title), body: row.body ? String(row.body) : null, odkaz: kontext.odkaz,
    kuponNazev: kontext.priloha?.kupon?.title ?? null, promoKod: kontext.priloha?.promo?.code ?? null,
    odhlasitStranka: odh.stranka, jazyk: cistyJazyk(p.lang) ?? cistyJazyk(kontext.jazykPodniku) ?? 'cs', zkusebni,
  });
  const r = await sendNovinkyEmail(String(p.email), kontext.podnik, mail.subject, mail.html, odh.api);
  return { sent: r.sent, error: r.sent ? null : (r.error ?? 'E-mail se nepodařilo odeslat.') };
}

/**
 * Pošle jeden řádek zprávy (už přivlastněný): oznámení hned a e-maily do fronty (první dávka hned,
 * zbytek při dalším „potkání“). Zapíše, kolika hostům došlo oznámení, kolik si novinky vypnulo a kolik
 * e-mailů čeká. `idsOverride` = ruční výběr hostů (hromadná akce v seznamu členů).
 */
async function deliver(row: any, rozpocetMs: number, idsOverride?: number[]): Promise<{ doruceno: number; ztlumeno: number }> {
  await zajistiSchemaClenu();
  const teamId = Number(row.team_id);
  const kanal: KanalyZpravy = jeKanal(row.channels) ? row.channels : 'push';
  const [p] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${teamId}`;
  const vsichni = idsOverride ?? await audienceIds(teamId, String(row.audience ?? 'all'));
  const prijemci = vsichni.length ? await nactiPrijemce(teamId, vsichni) : [];
  // Blokovaný člen nedostane nic, ani když ho správce zaškrtl v seznamu.
  const ids = prijemci.filter(x => !x.blocked).map(x => x.id);
  // Příloha, která mezitím přestala platit, se vynechá; zpráva sama odejde.
  const priloha = await prilohaRadku(row);
  const text = textOznameni(String(row.title), row.body ? String(row.body) : null, priloha);
  const r = posilaPush(kanal) && ids.length
    ? await notifyUsers(ids, { ...text, link: linkFor(row.link_kind, p?.slug ?? null), type: 'info', category: 'novinky' })
    : { doruceno: 0, ztlumeno: 0 };
  const dosah = dosahZpravy(prijemci, kanal);
  const emailIds = posilaEmail(kanal) ? prijemci.filter(x => procNedostaneEmail(x) === null).map(x => x.id) : [];
  // Kurzor fronty e-mailů běží přes celý seznam příjemců (stabilní pořadí); souhlas se ověřuje až v dávce.
  const ulozene = ids.slice(0, 5000);
  await sql`
    UPDATE client_broadcasts SET
      recipients = ${r.doruceno}, muted = ${r.ztlumeno}, push_count = ${r.doruceno}, no_consent = ${dosah.bezSouhlasu},
      prijemci = ${JSON.stringify(ulozene)}::jsonb,
      email_total = ${emailIds.length > 0 ? ulozene.length : 0}, email_pos = 0
    WHERE id = ${row.id}`;
  if (emailIds.length) await dokonciEmaily(rozpocetMs, Number(row.id));
  return r;
}

/** Jedna dávka e-mailů jedné zprávy. Vrací, kolik se jich zpracovalo (0 = hotovo nebo cizí dávka). */
async function davkaEmailu(row: any): Promise<number> {
  const teamId = Number(row.team_id);
  const total = Number(row.email_total) || 0;
  const pos = Number(row.email_pos) || 0;
  if (pos >= total) return 0;
  // Přivlastnění dávky posunem kurzoru: souběžný volající dostane 0 řádků.
  const [claimed] = await sql`
    UPDATE client_broadcasts SET email_pos = LEAST(email_total, email_pos + ${DAVKA_EMAILU})
    WHERE id = ${row.id} AND email_pos = ${pos} RETURNING email_pos`;
  if (!claimed) return 0;
  const kanal: KanalyZpravy = jeKanal(row.channels) ? row.channels : 'push';
  // Pořadí je stabilní: příjemci uložení při odeslání, vyfiltrovaní podle souhlasu v okamžiku dávky.
  const vsichni: number[] = Array.isArray(row.prijemci) ? row.prijemci.map(Number) : [];
  const prijemci = vsichni.length ? await nactiPrijemce(teamId, vsichni) : [];
  const zpusobili = new Map(prijemci.map(x => [x.id, x]));
  const cast = vsichni.slice(pos, pos + DAVKA_EMAILU)
    .map(id => zpusobili.get(id))
    .filter((x): x is PrijemceSDetaily => !!x && posilaEmail(kanal) && procNedostaneEmail(x) === null);
  const { slug, podnik, jazykPodniku } = await profilPodniku(teamId);
  const priloha = await prilohaRadku(row);
  const odkaz = `${odkazovyZaklad()}${linkFor(row.link_kind, slug)}`;
  let ok = 0, chyb = 0;
  for (const x of cast) {
    const odeslano = await posliEmailClenovi(row, x, { podnik, odkaz, priloha, jazykPodniku });
    if (odeslano.sent) ok++; else chyb++;
    // Resend bez navýšeného limitu přijímá dva požadavky za vteřinu.
    await new Promise(res => setTimeout(res, 550));
  }
  await sql`UPDATE client_broadcasts SET email_sent = email_sent + ${ok}, email_failed = email_failed + ${chyb} WHERE id = ${row.id}`;
  return Math.max(1, Math.min(DAVKA_EMAILU, total - pos));
}

/** Pošle čekající e-maily, dokud je čas. Bezpečné volat odkudkoli a souběžně. */
export async function dokonciEmaily(rozpocetMs = ROZPOCET_NAVSTEVY_MS, jenId?: number): Promise<number> {
  let odeslano = 0;
  const konec = Date.now() + rozpocetMs;
  try {
    for (let i = 0; i < 200 && Date.now() < konec; i++) {
      const rows = (jenId
        ? await sql`SELECT * FROM client_broadcasts WHERE id = ${jenId} AND email_pos < email_total`
        : await sql`SELECT * FROM client_broadcasts WHERE status = 'sent' AND email_pos < email_total ORDER BY sent_at LIMIT 1`) as any[];
      if (!rows.length) break;
      const n = await davkaEmailu(rows[0]);
      if (!n) break;
      odeslano += n;
    }
  } catch (e) { console.error('dokonciEmaily selhalo', e); }
  return odeslano;
}

/**
 * Odešle všechny naplánované zprávy, jejichž čas nastal, a dokončí čekající e-maily. Bezpečné volat
 * odkudkoli a klidně souběžně; chyba nesmí položit volající endpoint.
 * Zpráva, která by přesáhla denní limit podniku, zůstane ve frontě a odejde
 * při dalším „potkání“ po půlnoci (limit se bere při odeslání).
 */
export async function dispatchDueBroadcasts(rozpocetMs = ROZPOCET_NAVSTEVY_MS): Promise<number> {
  let sent = 0;
  try {
    await zajistiSchemaClenu();
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
      try { await deliver(claimed, rozpocetMs); sent += 1; }
      catch (e) { console.error('broadcast deliver failed', claimed.id, e); }
    }
    await dokonciEmaily(rozpocetMs);
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
  await zajistiSchemaClenu();
  const audience = a.audience ?? data.audience;
  const klic = `client-broadcast-dup:${teamId}:${simpleHash(`${data.title}|${data.body}|${audience}|${data.channels}|${(a.ids ?? []).length}`)}`;
  const dup = await hit(klic, 1, Math.round(DUPLICITA_MS / 1000));
  if (!dup.ok) return { ok: false, status: 409, chyba: 'Tuhle zprávu jsi právě odeslal. Počkej chvíli, než ji pošleš znovu.' };
  if (!await vezmiSlot(teamId)) return { ok: false, status: 429, chyba: `Dnes už odešlo ${ZPRAV_DENNE} zpráv. Víc jich členům neposílej, ať jim nezevšední. Zítra půjde další.` };
  const [row] = await sql`
    INSERT INTO client_broadcasts (team_id, title, body, recipients, sent_by, audience, status, link_kind, coupon_id, promo_id, channels)
    VALUES (${teamId}, ${data.title}, ${data.body || null}, 0, ${userId}, ${audience}, 'sent', ${data.linkKind}, ${data.couponId}, ${data.promoId}, ${data.channels})
    RETURNING *`;
  const r = await deliver(row, ROZPOCET_ROUTY_MS, a.ids);
  const [hotova] = await sql`SELECT * FROM client_broadcasts WHERE id = ${row.id}` as any[];
  return { ok: true, row: hotova ?? { ...row, recipients: r.doruceno, muted: r.ztlumeno }, doruceno: r.doruceno, ztlumeno: r.ztlumeno };
}

export interface VysledekZkousky { push: boolean; email: { sent: boolean; error: string | null } | null; adresa: string | null }

/**
 * Zkušební zpráva jen odesílateli: oznámení v aplikaci a/nebo e-mail na jeho adresu podle zvoleného kanálu.
 * Bez řádku v historii, bez denního slotu, bez ohledu na jeho vlastní vypnuté novinky.
 */
export async function zkusebniZprava(userId: number, teamId: number, data: VstupZpravy): Promise<{ ok: true; v: VysledekZkousky } | { ok: false; chyba: string }> {
  const n = await nactiPrilohu(teamId, data.couponId, data.promoId);
  if ('chyba' in n) return { ok: false, chyba: n.chyba };
  const [u] = await sql`SELECT id, email, lang FROM users WHERE id = ${userId}`;
  if (!u) return { ok: false, chyba: 'Nepodařilo se zjistit, komu zkoušku poslat.' };
  const { slug, podnik, jazykPodniku } = await profilPodniku(teamId);
  const out: VysledekZkousky = { push: false, email: null, adresa: u.email ? String(u.email) : null };
  if (posilaPush(data.channels)) {
    const text = textOznameni(predmetZpravy(data.title, true), data.body, n.priloha);
    // Bez kategorie „novinky“: správce, který sám novinky nechce, by jinak zkoušku nikdy nedostal.
    await notifyUser(userId, { ...text, link: linkFor(data.linkKind, slug), type: 'info' });
    out.push = true;
  }
  if (posilaEmail(data.channels)) {
    const row = { title: data.title, body: data.body || null };
    out.email = u.email
      ? await posliEmailClenovi(row, { id: userId, email: String(u.email), lang: u.lang ?? null, name: '', blocked: false, prefs: null },
          { podnik, odkaz: `${odkazovyZaklad()}${linkFor(data.linkKind, slug)}`, priloha: n.priloha, jazykPodniku }, true)
      : { sent: false, error: 'Tvůj účet nemá e-mail.' };
  }
  return { ok: true, v: out };
}
