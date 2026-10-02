// Zprávy členům v plné síle (po vzoru Kartičky): zpráva umí počkat na svůj
// čas (scheduled_at), mířit na publikum (všem / kdo dlouho nebyl / úroveň /
// skupina / kombinace segmentů / ruční výběr), jít jako oznámení i e-mail,
// nést kupon nebo promo kód a cíl, kam hosta vezme (link_kind).
//
// Plánování bez minutového cronu: naplánovaná zpráva leží ve frontě a
// dispatchDueBroadcasts() ji pošle, jakmile ji kdokoli „potká" — otevření
// správy, návštěva hosta (client/me), nebo noční crony. Odeslání si řádek
// atomicky přivlastní (status scheduled → sent), takže dva souběžné
// dispatchery zprávu nepošlou dvakrát.
//
// E-maily mají vlastní frontu: zpráva si pamatuje kurzor (email_pos) v seznamu
// příjemců a každé „potkání" pošle další dávku. Dávku si řádek přivlastní
// posunem kurzoru, takže se žádný e-mail nepošle dvakrát ani při souběhu.

import { tierThresholds, tierRulesFromProfile } from './clientSlots';
import { sql } from './client';
import { notifyUsers } from './push';
import { pragueToday } from './pragueTime';
import { SEGMENTY, jeSegment, stitekPublika, vyberClenu, spoctiSegmenty, type ClenSegmentu, type KontextSegmentu } from './segmenty';
import { ctiKombinaci, sloucMnoziny, stitekKombinace } from './skupinyPravidla';
import { zajistiSchemaClenu } from './clenoveSchema';
import { nactiPrijemce, pripisKuponClenum, kuponKPripsani, type PrijemceSDetaily } from './clenoveDb';
import {
  dosahZpravy, jeKanal, posilaEmail, posilaPush, procNedostaneEmail, procNedostanePush, odkazOdhlaseni,
  sestavEmailZpravy, telesoSKodem, predmetZpravy, type KanalyZpravy, type DosahZpravy,
} from './zpravyEmail';
import { sendNovinkyEmail, odkazovyZaklad } from './email';
import { cistyJazyk } from './i18n/config';
import { hit } from './rateLimit';
import { audit } from './audit';

export const AUDIENCES = ['all', 'quiet', 'tier:silver', 'tier:gold', 'tier:platinum'] as const;
export const LINKS = ['page', 'loyalty', 'order', 'me'];
export const MAX_ZPRAV_ZA_DEN = 5;
/** Kolik e-mailů pošle jedna dávka a jak dlouho smí dávky v jednom volání běžet. */
export const DAVKA_EMAILU = 10;
export const ROZPOCET_ROUTY_MS = 40_000;
export const ROZPOCET_NAVSTEVY_MS = 6_000;

export function audienceLabel(a: string, groupName?: string | null): string {
  if (jeSegment(a)) return stitekPublika(a) ?? 'všem členům';
  if (a === 'tier:silver') return 'Stříbrní a výš';
  if (a === 'tier:gold') return 'Zlatí a výš';
  if (a === 'tier:platinum') return 'Platinoví hosté';
  if (a.startsWith('group:')) return groupName ? `skupina ${groupName}` : 'skupina';
  if (a === 'vybrani') return 'vybraní členové';
  const k = ctiKombinaci(a, { skupiny: true });
  if (k) return stitekKombinace(k);
  return 'všem členům';
}

/** Je publikum zapsané správně? (Starší hodnoty, segmenty, skupiny, kombinace a ruční výběr.) */
export function jePlatnePublikum(a: string): boolean {
  return (AUDIENCES as readonly string[]).includes(a) || jeSegment(a) || /^group:\d+$/.test(a) || a === 'gold' || a === 'vybrani' || !!ctiKombinaci(a, { skupiny: true });
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

async function idsUrovne(teamId: number, audience: string): Promise<number[]> {
  // Prahy i režim (návštěvy / útrata) z jedné funkce s pravidly podniku.
  const [p] = await sql`SELECT * FROM client_profiles WHERE team_id = ${teamId}`;
  const th = tierThresholds(tierRulesFromProfile(p));
  const tier = audience.slice(5);
  const from = tier === 'platinum' ? (th.platinum || th.gold) : tier === 'gold' ? th.gold : th.silver;
  const rows = th.by === 'spend'
    ? await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND spend >= ${from}` as any[]
    : await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND visits >= ${from}` as any[];
  return rows.map(r => Number(r.customer_id));
}

/** Jednoduché publikum (bez kombinace): segment, úroveň, skupina (i dynamická), všichni. */
async function idsJednoduche(teamId: number, audience: string, vybrani?: number[]): Promise<number[]> {
  if (jeSegment(audience)) {
    const { clenove, kontext } = await nactiClenySegmentu(teamId);
    return vyberClenu(audience, clenove, kontext);
  }
  if (audience.startsWith('tier:')) return idsUrovne(teamId, audience);
  if (audience === 'gold') return idsUrovne(teamId, 'tier:gold');
  if (audience === 'vybrani') {
    const ids = Array.from(new Set((vybrani ?? []).map(Number).filter(n => Number.isInteger(n) && n > 0))).slice(0, 5000);
    if (!ids.length) return [];
    const rows = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ANY(${ids})` as any[];
    return rows.map(r => Number(r.customer_id));
  }
  if (audience.startsWith('group:')) {
    const gid = parseInt(audience.slice(6), 10);
    if (!Number.isFinite(gid)) return [];
    try {
      const [g] = await sql`SELECT rule FROM client_groups WHERE id = ${gid} AND team_id = ${teamId}`;
      if (!g) return [];
      // Dynamická skupina: členy počítá pravidlo; odkaz na skupinu v pravidle je zakázaný (žádné smyčky).
      if (g.rule) return idsPodlePravidla(teamId, String(g.rule));
      const rows = await sql`SELECT customer_id FROM client_group_members WHERE team_id = ${teamId} AND group_id = ${gid}` as any[];
      return rows.map(r => Number(r.customer_id));
    } catch { return []; }
  }
  const rows = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId}` as any[];
  return rows.map(r => Number(r.customer_id));
}

/** Členové podle pravidla dynamické skupiny: jedna podmínka, nebo kombinace. Bez odkazů na skupiny. */
export async function idsPodlePravidla(teamId: number, rule: string): Promise<number[]> {
  const k = ctiKombinaci(rule);
  if (!k) return jeSegment(rule) || rule.startsWith('tier:') ? idsJednoduche(teamId, rule) : [];
  const casti = await Promise.all(k.casti.map(async c => ({ cast: c, ids: await idsJednoduche(teamId, c.startsWith('!') ? c.slice(1) : c) })));
  return sloucMnoziny(k.rezim, casti);
}

async function blokovaniIds(teamId: number): Promise<Set<number>> {
  try {
    await zajistiSchemaClenu();
    const rows = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND blocked = TRUE` as any[];
    return new Set(rows.map(r => Number(r.customer_id)));
  } catch { return new Set(); }
}

/**
 * Kdo do publika patří (blokovaní nikdy). Úrovně se počítají z prahů podniku, „tier:silver“ znamená
 * Stříbrný A VÝŠ — zpráva pro věrné, ne jen pro jednu přihrádku. Kombinace `mix:…` spojí množiny
 * podle režimu; `vybrani` je ruční výběr z `vybrani`.
 */
export async function audienceIds(teamId: number, audience: string, vybrani?: number[]): Promise<number[]> {
  const k = ctiKombinaci(audience, { skupiny: true });
  let ids: number[];
  if (k) {
    const casti = await Promise.all(k.casti.map(async c => ({ cast: c, ids: await idsJednoduche(teamId, c.startsWith('!') ? c.slice(1) : c) })));
    ids = sloucMnoziny(k.rezim, casti);
  } else {
    ids = await idsJednoduche(teamId, audience, vybrani);
  }
  const blok = await blokovaniIds(teamId);
  return blok.size ? ids.filter(id => !blok.has(id)) : ids;
}

/** Skupiny podniku s počty (dynamické se počítají podle pravidla). Archivované jsou na konci a označené. */
export async function skupinyKVyberu(teamId: number): Promise<{ id: number; name: string; members: number; rule: string | null; archived: boolean }[]> {
  try {
    await zajistiSchemaClenu();
    const rows = await sql`
      SELECT g.id, g.name, g.rule, g.archived, (SELECT COUNT(*)::int FROM client_group_members gm WHERE gm.group_id = g.id) AS members
      FROM client_groups g WHERE g.team_id = ${teamId} ORDER BY g.archived, g.name, g.id` as any[];
    const out = [];
    for (const g of rows) {
      const rule = g.rule ? String(g.rule) : null;
      const members = rule ? (await idsPodlePravidla(teamId, rule)).length : Number(g.members) || 0;
      out.push({ id: Number(g.id), name: String(g.name), members, rule, archived: g.archived === true });
    }
    return out;
  } catch { return []; }
}

// ---- Náhled dosahu ------------------------------------------------------------------

export async function dosahPublika(teamId: number, audience: string, kanal: KanalyZpravy, vybrani?: number[]): Promise<DosahZpravy> {
  const ids = await audienceIds(teamId, audience, vybrani);
  const prijemci = ids.length ? await nactiPrijemce(teamId, ids) : [];
  return dosahZpravy(prijemci, kanal);
}

// ---- Odeslání -----------------------------------------------------------------------

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

async function nazevKuponu(teamId: number, couponId: number | null): Promise<string | null> {
  if (!couponId) return null;
  const k = await kuponKPripsani(teamId, couponId);
  return k?.title ?? null;
}

/** Pošle jeden e-mail členovi. Vrací, zda odešel. Chyby se nepropagují. */
async function posliEmailClenovi(row: any, p: PrijemceSDetaily, kontext: { podnik: string; odkaz: string; kupon: string | null; jazykPodniku: string | null }, zkusebni = false): Promise<boolean> {
  if (!p.email) return false;
  const odh = odkazOdhlaseni(odkazovyZaklad(), p.id);
  const mail = sestavEmailZpravy({
    podnik: kontext.podnik, title: String(row.title), body: row.body ? String(row.body) : null, odkaz: kontext.odkaz,
    kuponNazev: kontext.kupon, promoKod: row.promo_code ? String(row.promo_code) : null,
    odhlasitStranka: odh.stranka, jazyk: cistyJazyk(p.lang) ?? cistyJazyk(kontext.jazykPodniku) ?? 'cs', zkusebni,
  });
  const r = await sendNovinkyEmail(String(p.email), kontext.podnik, mail.subject, mail.html, odh.api);
  return r.sent;
}

/**
 * Pošle jeden řádek zprávy (už přivlastněný): oznámení hned, kupon všem v publiku a e-maily do fronty
 * (první dávka hned, zbytek při dalším „potkání“). Doplní počty příjemců a doručení.
 */
async function deliver(row: any, rozpocetMs: number): Promise<number> {
  await zajistiSchemaClenu();
  const teamId = Number(row.team_id);
  const kanal: KanalyZpravy = jeKanal(row.channels) ? row.channels : 'push';
  const vybrani = Array.isArray(row.audience_ids) ? row.audience_ids.map(Number) : undefined;
  const ids = await audienceIds(teamId, String(row.audience ?? 'all'), vybrani);
  const prijemci = ids.length ? await nactiPrijemce(teamId, ids) : [];
  const { slug } = await profilPodniku(teamId);

  // Kupon dostane celé publikum (je to dárek, ne reklama), bez ohledu na souhlas se zprávami.
  if (row.coupon_id && ids.length) {
    try { await pripisKuponClenum(teamId, Number(row.coupon_id), ids); } catch (e) { console.error('broadcast kupon selhal', row.id, e); }
  }

  const pushIds = posilaPush(kanal) ? prijemci.filter(p => procNedostanePush(p) === null).map(p => p.id) : [];
  if (pushIds.length) {
    await notifyUsers(pushIds, {
      title: String(row.title),
      body: telesoSKodem(row.body ? String(row.body) : null, row.promo_code ? String(row.promo_code) : null),
      link: linkFor(row.link_kind, slug),
      type: 'info', category: 'novinky',
    });
  }
  const dosah = dosahZpravy(prijemci, kanal);
  const emailIds = posilaEmail(kanal) ? prijemci.filter(p => procNedostaneEmail(p) === null).map(p => p.id) : [];
  const idsUlozene = ids.slice(0, 5000);
  // Kurzor fronty e-mailů běží přes celý seznam příjemců (stabilní pořadí); souhlas se ověřuje až v dávce.
  await sql`
    UPDATE client_broadcasts SET
      recipients = ${ids.length}, push_count = ${pushIds.length}, no_consent = ${dosah.bezSouhlasu},
      prijemci = ${JSON.stringify(idsUlozene)}::jsonb,
      email_total = ${emailIds.length > 0 ? idsUlozene.length : 0}, email_pos = 0
    WHERE id = ${row.id}`;
  if (emailIds.length) await dokonciEmaily(rozpocetMs, row.id);
  return ids.length;
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
  const vybrani = Array.isArray(row.audience_ids) ? row.audience_ids.map(Number) : undefined;
  // Pořadí je stabilní: příjemci uložení při odeslání, vyfiltrovaní podle souhlasu v okamžiku dávky.
  const vsichni: number[] = Array.isArray(row.prijemci) ? row.prijemci.map(Number) : await audienceIds(teamId, String(row.audience ?? 'all'), vybrani);
  const prijemci = await nactiPrijemce(teamId, vsichni);
  const zpusobili = new Map(prijemci.map(p => [p.id, p]));
  const cast = vsichni.slice(pos, pos + DAVKA_EMAILU)
    .map(id => zpusobili.get(id))
    .filter((p): p is PrijemceSDetaily => !!p && posilaEmail(kanal) && procNedostaneEmail(p) === null);
  const { slug, podnik, jazykPodniku } = await profilPodniku(teamId);
  const kupon = await nazevKuponu(teamId, row.coupon_id ? Number(row.coupon_id) : null);
  const odkaz = `${odkazovyZaklad()}${linkFor(row.link_kind, slug)}`;
  let ok = 0, chyb = 0;
  for (const p of cast) {
    const odeslano = await posliEmailClenovi(row, p, { podnik, odkaz, kupon, jazykPodniku });
    if (odeslano) ok++; else chyb++;
    // Resend bez navýšeného limitu přijímá dva požadavky za vteřinu.
    await new Promise(r => setTimeout(r, 550));
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
 */
export async function dispatchDueBroadcasts(rozpocetMs = ROZPOCET_NAVSTEVY_MS): Promise<number> {
  let sent = 0;
  try {
    await zajistiSchemaClenu();
    const due = await sql`
      SELECT id FROM client_broadcasts
      WHERE status = 'scheduled' AND scheduled_at <= NOW()
      ORDER BY scheduled_at LIMIT 5` as any[];
    for (const d of due) {
      // Atomické přivlastnění: kdo přepne scheduled → sent, ten posílá.
      const [claimed] = await sql`
        UPDATE client_broadcasts SET status = 'sent', sent_at = NOW()
        WHERE id = ${d.id} AND status = 'scheduled' RETURNING *`;
      if (!claimed) continue;
      try { await deliver(claimed, rozpocetMs); sent += 1; }
      catch (e) { console.error('broadcast deliver failed', claimed.id, e); }
    }
    await dokonciEmaily(rozpocetMs);
  } catch { /* fronta bez migrace nebo výpadek — příště */ }
  return sent;
}

/** Okamžité odeslání nové zprávy (bez plánování). */
export async function sendNow(row: any): Promise<number> {
  return deliver(row, ROZPOCET_ROUTY_MS);
}

// ---- Vytvoření zprávy (rozesílka i hromadná akce ve výběru) ----------------------------

export interface VstupZpravy {
  title: unknown; body: unknown; audience: unknown; linkKind?: unknown; scheduledAt?: unknown;
  channels?: unknown; couponId?: unknown; promoCode?: unknown; vybrani?: unknown;
}

export interface ZpravaHotova {
  title: string; body: string; audience: string; linkKind: string; channels: KanalyZpravy;
  couponId: number | null; promoCode: string | null; vybrani: number[] | null; at: Date | null; scheduled: boolean;
}

/** Ověří a očistí tělo zprávy. Žádný zápis do databáze, jen pravidla. */
export function overZpravu(b: VstupZpravy, ted: number = Date.now()): { ok: true; z: ZpravaHotova } | { ok: false; error: string } {
  const title = String(b.title ?? '').trim().slice(0, 80);
  const body = String(b.body ?? '').trim().slice(0, 300);
  if (!title) return { ok: false, error: 'Zpráva potřebuje nadpis.' };
  const audRaw = String(b.audience ?? 'all');
  const audience = jePlatnePublikum(audRaw) ? audRaw : 'all';
  const linkKind = LINKS.includes(String(b.linkKind)) ? String(b.linkKind) : 'page';
  const channels: KanalyZpravy = jeKanal(b.channels) ? b.channels : 'push';
  const cid = Math.round(Number(b.couponId));
  const couponId = Number.isInteger(cid) && cid > 0 ? cid : null;
  const promo = String(b.promoCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30);
  const vybrani = Array.isArray(b.vybrani) ? Array.from(new Set(b.vybrani.map((x: any) => Math.round(Number(x))).filter((n: number) => Number.isInteger(n) && n > 0))).slice(0, 5000) as number[] : null;
  if (audience === 'vybrani' && !vybrani?.length) return { ok: false, error: 'Vyber aspoň jednoho člena.' };
  const at = b.scheduledAt ? new Date(String(b.scheduledAt)) : null;
  const scheduled = !!at && !isNaN(at.getTime()) && at.getTime() > ted + 60000;
  if (scheduled && at!.getTime() > ted + 90 * 86400000) return { ok: false, error: 'Plánovat jde nejvýš 90 dní dopředu.' };
  return { ok: true, z: { title, body, audience, linkKind, channels, couponId, promoCode: promo || null, vybrani: audience === 'vybrani' ? vybrani : null, at: scheduled ? at : null, scheduled } };
}

export type VysledekVytvoreni =
  | { ok: true; row: any; scheduled: boolean }
  | { ok: false; status: number; error: string };

/** Založí zprávu (hned, nebo naplánovanou) včetně kontroly kuponu a denního limitu. */
export async function vytvorZpravu(teamId: number, userId: number, b: VstupZpravy): Promise<VysledekVytvoreni> {
  await zajistiSchemaClenu();
  const v = overZpravu(b);
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  const z = v.z;
  if (z.couponId && !(await kuponKPripsani(teamId, z.couponId))) return { ok: false, status: 400, error: 'Kupon k zprávě neexistuje nebo je vypnutý.' };
  const gate = await hit(`client-broadcast:${teamId}`, MAX_ZPRAV_ZA_DEN, 24 * 3600);
  if (!gate.ok) return { ok: false, status: 429, error: 'Nejvýš pět zpráv za den, ať to členům nezevšední.' };
  const idsJson = z.vybrani ? JSON.stringify(z.vybrani) : null;
  if (z.scheduled) {
    const [row] = await sql`
      INSERT INTO client_broadcasts (team_id, title, body, recipients, sent_by, audience, status, scheduled_at, sent_at, link_kind, channels, coupon_id, promo_code, audience_ids)
      VALUES (${teamId}, ${z.title}, ${z.body || null}, 0, ${userId}, ${z.audience}, 'scheduled', ${z.at!.toISOString()}, ${z.at!.toISOString()}, ${z.linkKind}, ${z.channels}, ${z.couponId}, ${z.promoCode}, ${idsJson}::jsonb)
      RETURNING *`;
    void audit(teamId, userId, 'client.broadcast', 'client', null, `naplánováno: ${z.title} (${audienceLabel(z.audience)})`);
    return { ok: true, row, scheduled: true };
  }
  const [row] = await sql`
    INSERT INTO client_broadcasts (team_id, title, body, recipients, sent_by, audience, status, link_kind, channels, coupon_id, promo_code, audience_ids)
    VALUES (${teamId}, ${z.title}, ${z.body || null}, 0, ${userId}, ${z.audience}, 'sent', ${z.linkKind}, ${z.channels}, ${z.couponId}, ${z.promoCode}, ${idsJson}::jsonb)
    RETURNING *`;
  const sent = await sendNow(row);
  void audit(teamId, userId, 'client.broadcast', 'client', null, `${z.title} · ${sent} členů (${audienceLabel(z.audience)})`);
  const [hotovo] = await sql`SELECT * FROM client_broadcasts WHERE id = ${row.id}`;
  return { ok: true, row: hotovo ?? { ...row, recipients: sent }, scheduled: false };
}

// ---- Zkušební odeslání sobě -------------------------------------------------------------

export interface VysledekZkousky { push: boolean; email: { sent: boolean; error: string | null } | null; adresa: string | null }

/**
 * Pošle zprávu jen autorovi: oznámení v aplikaci a/nebo e-mail na jeho adresu. Nespotřebuje denní limit,
 * nezapíše se do historie a kupon se nepřipisuje. Oznámení jde mimo souhlas s novinkami — je to zkouška.
 */
export async function posliZkousku(teamId: number, userId: number, b: VstupZpravy): Promise<{ ok: true; v: VysledekZkousky } | { ok: false; error: string }> {
  const v = overZpravu({ ...b, audience: 'all' });
  if (!v.ok) return { ok: false, error: v.error };
  const z = v.z;
  const [u] = await sql`SELECT id, name, email, lang FROM users WHERE id = ${userId}`;
  if (!u) return { ok: false, error: 'Nepodařilo se zjistit, komu zkoušku poslat.' };
  const { slug, podnik, jazykPodniku } = await profilPodniku(teamId);
  const out: VysledekZkousky = { push: false, email: null, adresa: u.email ? String(u.email) : null };
  if (posilaPush(z.channels)) {
    const { notifyUser } = await import('./push');
    await notifyUser(userId, { title: predmetZpravy(z.title, true), body: telesoSKodem(z.body, z.promoCode), link: linkFor(z.linkKind, slug), type: 'info', category: 'general' });
    out.push = true;
  }
  if (posilaEmail(z.channels)) {
    const odh = odkazOdhlaseni(odkazovyZaklad(), userId);
    const kupon = await nazevKuponu(teamId, z.couponId);
    const mail = sestavEmailZpravy({
      podnik, title: z.title, body: z.body, odkaz: `${odkazovyZaklad()}${linkFor(z.linkKind, slug)}`, kuponNazev: kupon, promoKod: z.promoCode,
      odhlasitStranka: odh.stranka, jazyk: cistyJazyk(u.lang) ?? cistyJazyk(jazykPodniku) ?? 'cs', zkusebni: true,
    });
    out.email = u.email ? await sendNovinkyEmail(String(u.email), podnik, mail.subject, mail.html, odh.api) : { sent: false, error: 'Tvůj účet nemá e-mail.' };
  }
  return { ok: true, v: out };
}

/** Úprava naplánované zprávy: jen dokud neodešla; atomicky (status se kontroluje v samotném UPDATE). */
export async function upravNaplanovanou(teamId: number, id: number, userId: number, b: VstupZpravy): Promise<{ ok: true; row: any } | { ok: false; status: number; error: string }> {
  await zajistiSchemaClenu();
  const v = overZpravu(b);
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  const z = v.z;
  if (!z.scheduled) return { ok: false, status: 400, error: 'Naplánovaná zpráva potřebuje čas v budoucnu. Odeslat hned můžeš novou zprávou.' };
  if (z.couponId && !(await kuponKPripsani(teamId, z.couponId))) return { ok: false, status: 400, error: 'Kupon k zprávě neexistuje nebo je vypnutý.' };
  const [row] = await sql`
    UPDATE client_broadcasts SET title = ${z.title}, body = ${z.body || null}, audience = ${z.audience}, link_kind = ${z.linkKind},
      channels = ${z.channels}, coupon_id = ${z.couponId}, promo_code = ${z.promoCode},
      audience_ids = ${z.vybrani ? JSON.stringify(z.vybrani) : null}::jsonb,
      scheduled_at = ${z.at!.toISOString()}, sent_at = ${z.at!.toISOString()}
    WHERE id = ${id} AND team_id = ${teamId} AND status = 'scheduled' RETURNING *`;
  if (!row) return { ok: false, status: 409, error: 'Zpráva už odešla, nebo byla zrušena.' };
  void audit(teamId, userId, 'client.broadcast', 'client', null, `upraveno: ${z.title} (${audienceLabel(z.audience)})`);
  return { ok: true, row };
}
