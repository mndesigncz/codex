// Retence nad databází: najde, co je po lhůtě (lib/retence.ts), a v NÁHLEDU to jen spočítá a zapíše
// do `retence_behy`; ostře (RETENCE_ZAPNUTA=1) pošle upozornění, anonymizuje hosty přes lib/smazaniUctuDb
// (stejná cesta jako „Smazat účet“), smaže staré záznamy a — po dvou upozorněních vlastníkovi
// a správcům (30 a 7 dní předem) — zrušené podniky bez aktivity. Každý běh se zapíše.

import { neon } from '@neondatabase/serverless';
import { del } from '@vercel/blob';
import { sendPravniEmail, odkazovyZaklad } from './email';
import { parseDbTime, pragueDayOf } from './pragueTime';
import { smazUcet, uklidStripe } from './smazaniUctuDb';
import { planPodniku, proved, type Exec } from './smazaniUctu';
import { clenoveSOpravnenim } from './opravneniDb';
import {
  RETENCE, hraniceRetence, rozhodniHosta, rozhodniPodnik, denAnonymizace, emailUpozorneni, emailUpozorneniPodniku, tokenPonechani, prazdnySouhrn,
  type SouhrnRetence,
} from './retence';

const sql = neon(process.env.DATABASE_URL!);

/** Den „d. M. rrrr“ v pražském čase pro text e-mailu. */
function denCesky(d: Date): string {
  const [y, m, dd] = pragueDayOf(d).split('-').map(Number);
  return `${dd}. ${m}. ${y}`;
}

const platnyEmail = (e: unknown) => {
  const s = String(e ?? '');
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && !s.endsWith('@managero.invalid');
};

/**
 * Kandidáti na retenci hostů: poslední aktivita = nejnovější z návštěvy (členství), objednávky,
 * rezervace, pohybu bodů od hosta nebo obsluhy (ne samočinné propadnutí, narozeniny, reaktivace),
 * otevření nativní aplikace (device_tokens), otevření aplikace na webu (users.naposledy_at,
 * lib/naposledy.ts), změny souhlasu a kliknutí „Ponechat účet“.
 */
async function kandidatiHoste(upozornitPred: Date): Promise<{ id: number; email: string | null; name: string; upozorneno: Date | null; posledni: Date | null }[]> {
  const rows = await sql`
    SELECT x.id, x.email, x.name, x.retence_upozorneno_at, x.posledni FROM (
      SELECT u.id, u.email, u.name, u.retence_upozorneno_at,
        GREATEST(u.created_at, u.terms_accepted_at, u.retence_ponechat_at, u.naposledy_at,
          (SELECT MAX(GREATEST(m.joined_at, m.last_visit_at)) FROM client_memberships m WHERE m.customer_id = u.id),
          (SELECT MAX(o.created_at) FROM client_orders o WHERE o.customer_id = u.id),
          (SELECT MAX(r.created_at) FROM client_reservations r WHERE r.customer_id = u.id),
          (SELECT MAX(l.created_at) FROM client_loyalty_ledger l WHERE l.customer_id = u.id
             AND l.kind IN ('visit', 'order', 'manual', 'coupon', 'welcome', 'referral', 'cashback', 'credit', 'storno')),
          (SELECT MAX(d.last_seen_at) FROM device_tokens d WHERE d.user_id = u.id),
          (SELECT MAX(c.created_at) FROM consents c WHERE c.user_id = u.id AND c.kanal <> 'prevod')
        ) AS posledni
      FROM users u
      WHERE u.role = 'customer' AND u.deleted_at IS NULL
    ) x
    WHERE x.posledni < ${upozornitPred.toISOString()}::timestamp
    ORDER BY x.posledni
    LIMIT 2000` as any[];
  return rows.map(r => ({
    id: Number(r.id), email: r.email ?? null, name: String(r.name ?? ''),
    upozorneno: parseDbTime(r.retence_upozorneno_at), posledni: parseDbTime(r.posledni),
  }));
}

/**
 * Zrušené podniky, kterým se blíží lhůta: předplatné (nebo zkouška) skončilo a nikdo ho neobnovil.
 * Poslední aktivita = nejnovější z: člen podniku (nebo vlastník) byl v aplikaci (`users.naposledy_at`,
 * lib/naposledy.ts) nebo ji otevřel v telefonu (`device_tokens`), protokol změn, docházka, týmový
 * chat, zprávy, úkoly, směny, uzávěrky, postupy a denní reporty. Rozhodnutí (upozornit / čekat /
 * smazat) dělá čistá funkce `rozhodniPodnik` v lib/retence.ts.
 */
async function kandidatiPodniky(upozornitPred: Date): Promise<{
  id: number; ownerId: number; podnik: string; konec: Date | null; posledni: Date | null; upozorneno30: Date | null; upozorneno7: Date | null;
}[]> {
  const rows = await sql`
    SELECT x.id, x.owner_id, x.podnik, x.konec, x.posledni, x.retence_upozorneno30_at, x.retence_upozorneno7_at FROM (
      SELECT t.id, t.owner_id, COALESCE(NULLIF(t.share_theme->>'businessName', ''), t.name) AS podnik,
        COALESCE(t.current_period_end, t.trial_end) AS konec,
        t.retence_upozorneno30_at, t.retence_upozorneno7_at,
        GREATEST(
          (SELECT MAX(u.naposledy_at) FROM users u
             WHERE u.id = t.owner_id OR u.team_id = t.id OR u.id IN (SELECT tm.user_id FROM team_members tm WHERE tm.team_id = t.id)),
          (SELECT MAX(d.last_seen_at) FROM device_tokens d
             WHERE d.app = 'managero' AND (d.user_id = t.owner_id OR d.user_id IN (SELECT tm2.user_id FROM team_members tm2 WHERE tm2.team_id = t.id))),
          (SELECT MAX(a.created_at) FROM audit_log a WHERE a.team_id = t.id),
          (SELECT MAX(e.clock_in) FROM time_entries e WHERE e.team_id = t.id),
          (SELECT MAX(c.created_at) FROM chat_messages c JOIN conversations k ON k.id = c.conversation_id WHERE k.team_id = t.id),
          (SELECT MAX(m.created_at) FROM messages m WHERE m.team_id = t.id),
          (SELECT MAX(GREATEST(ts.created_at, ts.completed_at)) FROM tasks ts WHERE ts.team_id = t.id),
          (SELECT MAX(s.created_at) FROM shifts s WHERE s.team_id = t.id),
          (SELECT MAX(z.created_at) FROM cash_closings z WHERE z.team_id = t.id),
          (SELECT MAX(GREATEST(pr.started_at, pr.completed_at)) FROM procedure_runs pr WHERE pr.team_id = t.id),
          (SELECT MAX(dr.created_at) FROM daily_reports dr WHERE dr.team_id = t.id)
        ) AS posledni
      FROM teams t
      WHERE t.had_subscription = TRUE AND t.subscription_status = 'canceled'
        AND COALESCE(t.current_period_end, t.trial_end) < ${upozornitPred.toISOString()}::timestamp
    ) x
    WHERE x.posledni IS NULL OR x.posledni < ${upozornitPred.toISOString()}::timestamp
    ORDER BY x.id
    LIMIT 200` as any[];
  return rows.map(r => ({
    id: Number(r.id), ownerId: Number(r.owner_id), podnik: String(r.podnik ?? ''),
    konec: parseDbTime(r.konec), posledni: parseDbTime(r.posledni),
    upozorneno30: parseDbTime(r.retence_upozorneno30_at), upozorneno7: parseDbTime(r.retence_upozorneno7_at),
  }));
}

/** Komu jde upozornění před smazáním podniku: vlastník a lidé s oprávněním spravovat předplatné. */
async function prijemciUpozorneni(teamId: number, ownerId: number): Promise<{ email: string; name: string }[]> {
  let ids: number[] = [ownerId];
  try { ids = [...new Set([ownerId, ...(await clenoveSOpravnenim(teamId, 'predplatne.spravovat'))])]; } catch { /* aspoň vlastník */ }
  const rows = await sql`SELECT email, name FROM users WHERE id = ANY(${ids}::int[]) AND deleted_at IS NULL` as any[];
  const videno = new Set<string>();
  const out: { email: string; name: string }[] = [];
  for (const r of rows) {
    const e = String(r.email ?? '').trim();
    if (!platnyEmail(e) || videno.has(e.toLowerCase())) continue;
    videno.add(e.toLowerCase());
    out.push({ email: e, name: String(r.name ?? '') });
  }
  return out;
}

/**
 * Pošle upozornění před smazáním podniku (idempotentně). Nejdřív si podnik „zabere“ zápisem času do
 * teams (souběžný běh ho pak přeskočí — žádné dvojí e-maily), potom pošle e-maily. Když neodejde ani
 * jeden, zápis vrátí zpátky: podnik bez doručeného upozornění se nesmí smazat a příští běh to zkusí znovu.
 */
async function upozorniPodnik(p: { id: number; ownerId: number; podnik: string; posledni: Date | null; konec: Date | null; upozorneno30: Date | null; upozorneno7: Date | null }, druhe: boolean, smazatOd: Date): Promise<'odeslano' | 'obsazeno' | 'bezAdresy' | 'neodeslano'> {
  const prijemci = await prijemciUpozorneni(p.id, p.ownerId);
  if (!prijemci.length) return 'bezAdresy';
  // Upozornění starší než tahle hranice je propadlé (před poslední aktivitou / před prvním upozorněním).
  const hranice = (druhe ? p.upozorneno30 : (p.posledni && p.konec && p.posledni > p.konec ? p.posledni : p.konec)) ?? new Date(0);
  const zabrano = druhe
    ? await sql`UPDATE teams SET retence_upozorneno7_at = NOW() WHERE id = ${p.id} AND subscription_status = 'canceled'
        AND (retence_upozorneno7_at IS NULL OR retence_upozorneno7_at < ${hranice.toISOString()}::timestamp) RETURNING id` as any[]
    : await sql`UPDATE teams SET retence_upozorneno30_at = NOW() WHERE id = ${p.id} AND subscription_status = 'canceled'
        AND (retence_upozorneno30_at IS NULL OR retence_upozorneno30_at < ${hranice.toISOString()}::timestamp) RETURNING id` as any[];
  if (!zabrano.length) return 'obsazeno';
  const zaklad = odkazovyZaklad();
  let odeslano = 0;
  for (const r of prijemci) {
    const mail = emailUpozorneniPodniku({
      podnik: p.podnik, jmeno: r.name, datum: denCesky(smazatOd), druhe,
      odkazPrihlaseni: `${zaklad}/login`, odkazData: `${zaklad}/employer/overview?view=settings&tab=privacy`,
    });
    const v = await sendPravniEmail(r.email, mail.subject, mail.html);
    if (v.sent) odeslano++;
  }
  if (odeslano) return 'odeslano';
  const puvodni = druhe ? p.upozorneno7 : p.upozorneno30;
  if (druhe) await sql`UPDATE teams SET retence_upozorneno7_at = ${puvodni ? puvodni.toISOString() : null}::timestamp WHERE id = ${p.id}`;
  else await sql`UPDATE teams SET retence_upozorneno30_at = ${puvodni ? puvodni.toISOString() : null}::timestamp WHERE id = ${p.id}`;
  return 'neodeslano';
}

async function smazPodnik(teamId: number, ownerId: number): Promise<void> {
  // Stripe už je zrušený (podmínka výběru), ale zákazník tam může zůstat: stejný úklid jako při smazání účtu.
  await uklidStripe([teamId], ownerId).catch(() => []);
  let bloby: string[] = [];
  try { bloby = (await sql`SELECT blob_path FROM uploads WHERE team_id = ${teamId} AND blob_path IS NOT NULL` as any[]).map(r => String(r.blob_path)); } catch { /* bez tabulky */ }
  const exec: Exec = async (text, params) => sql.query(text, params as any[]);
  await proved(exec, planPodniku(teamId, ownerId));
  if (bloby.length && process.env.BLOB_READ_WRITE_TOKEN) await del(bloby).catch(e => console.error('retence: bloby podniku', teamId, e));
}

/** Smaže po dávkách řádky starší než hranice; vrací počet. Konec rozpočtu = zbytek příště. */
async function smazPoDavkach(tabulka: 'audit_log' | 'notifications', pred: Date, konec: number): Promise<number> {
  let n = 0;
  for (let i = 0; i < 40 && Date.now() < konec; i++) {
    const r = tabulka === 'audit_log'
      ? await sql`DELETE FROM audit_log WHERE id IN (SELECT id FROM audit_log WHERE created_at < ${pred.toISOString()}::timestamp LIMIT ${RETENCE.davkaRadku}) RETURNING id` as any[]
      : await sql`DELETE FROM notifications WHERE id IN (SELECT id FROM notifications WHERE created_at < ${pred.toISOString()}::timestamp LIMIT ${RETENCE.davkaRadku}) RETURNING id` as any[];
    n += r.length;
    if (r.length < RETENCE.davkaRadku) break;
  }
  return n;
}

/**
 * Jeden běh retence. `ostry: false` = náhled: nic nemaže a nic neposílá. `rozpocetMs` hlídá časový
 * limit funkce; co se nestihne, dojede příští běh (všechno je idempotentní).
 */
export async function spustRetenci(v: { ostry: boolean; ted?: Date; rozpocetMs?: number }): Promise<SouhrnRetence> {
  const ted = v.ted ?? new Date();
  const konec = Date.now() + (v.rozpocetMs ?? 45_000);
  const h = hraniceRetence(ted);
  const s = prazdnySouhrn(v.ostry ? 'ostry' : 'nahled', h);

  // ---- Neaktivní hosté ----
  try {
    const hoste = await kandidatiHoste(h.upozornitPred);
    let udelano = 0;
    for (const x of hoste) {
      // Kolik hostů už je za celou lhůtou neaktivity (v náhledu to je počet, kterých se retence týká po upozornění).
      if (x.posledni && x.posledni.getTime() < h.neaktivniPred.getTime()) s.hoste.poLhute++;
      const krok = rozhodniHosta({ posledniAktivita: x.posledni, upozornenoAt: x.upozorneno, ted });
      if (krok === 'nic') continue;
      if (krok === 'cekat') { s.hoste.cekat++; continue; }
      if (krok === 'upozornit') s.hoste.upozornit++; else s.hoste.anonymizovat++;
      if (s.hoste.ukazkaId.length < 20) s.hoste.ukazkaId.push(x.id);
      if (!v.ostry || udelano >= RETENCE.davkaHostu || Date.now() > konec) continue;
      udelano++;
      try {
        if (krok === 'upozornit') {
          // Bez platného e-mailu (host bez aplikace z importu) se upozornit nedá: lhůta se rozběhne i tak.
          if (platnyEmail(x.email)) {
            const mail = emailUpozorneni({ jmeno: x.name, datum: denCesky(denAnonymizace(ted)), odkaz: `${odkazovyZaklad()}/api/retence/ponechat?t=${encodeURIComponent(tokenPonechani(x.id))}` });
            const r = await sendPravniEmail(String(x.email), mail.subject, mail.html);
            if (!r.sent) { s.hoste.chyb++; continue; }
          }
          await sql`UPDATE users SET retence_upozorneno_at = NOW() WHERE id = ${x.id}`;
          s.hoste.upozorneno++;
        } else {
          const r = await smazUcet(x.id, { zDuvodu: 'retence' });
          if (r.ok) s.hoste.anonymizovano++; else { s.hoste.chyb++; s.chyby.push(`host ${x.id}: ${r.kod}`); }
        }
      } catch (e) {
        s.hoste.chyb++;
        if (s.chyby.length < 20) s.chyby.push(`host ${x.id}: ${(e as Error)?.message?.slice(0, 120) ?? 'chyba'}`);
      }
    }
  } catch (e) {
    s.chyby.push(`hosté: ${(e as Error)?.message?.slice(0, 160) ?? 'chyba'} (před migrací?)`);
  }

  // ---- Protokol změn a oznámení ----
  try {
    const [a] = await sql`SELECT COUNT(*)::int AS n FROM audit_log WHERE created_at < ${h.auditPred.toISOString()}::timestamp`;
    s.auditLog.kSmazani = Number(a?.n ?? 0);
    if (v.ostry && s.auditLog.kSmazani) s.auditLog.smazano = await smazPoDavkach('audit_log', h.auditPred, konec);
  } catch (e) { s.chyby.push(`protokol: ${(e as Error)?.message?.slice(0, 160) ?? 'chyba'}`); }
  try {
    const [o] = await sql`SELECT COUNT(*)::int AS n FROM notifications WHERE created_at < ${h.oznameniPred.toISOString()}::timestamp`;
    s.oznameni.kSmazani = Number(o?.n ?? 0);
    if (v.ostry && s.oznameni.kSmazani) s.oznameni.smazano = await smazPoDavkach('notifications', h.oznameniPred, konec);
  } catch (e) { s.chyby.push(`oznámení: ${(e as Error)?.message?.slice(0, 160) ?? 'chyba'}`); }

  // ---- Zrušené podniky ----
  // Smazat jde jen podnik, jehož vlastník a správci dostali e-mail 30 a 7 dní předem a od prvního
  // upozornění v podniku nikdo nic neudělal (rozhodniPodnik). Náhled jen počítá.
  try {
    const podniky = await kandidatiPodniky(h.podnikUpozornitPred);
    let upozorneno = 0, smazano = 0;
    for (const p of podniky) {
      const { krok, smazatOd } = rozhodniPodnik({ konec: p.konec, posledniAktivita: p.posledni, upozorneno30At: p.upozorneno30, upozorneno7At: p.upozorneno7, ted });
      if (krok === 'nic') continue;
      if (krok === 'cekat') { s.podniky.cekat = (s.podniky.cekat ?? 0) + 1; continue; }
      if (krok === 'upozornit30') s.podniky.upozornit30 = (s.podniky.upozornit30 ?? 0) + 1;
      else if (krok === 'upozornit7') s.podniky.upozornit7 = (s.podniky.upozornit7 ?? 0) + 1;
      else { s.podniky.kSmazani++; if (s.podniky.ukazkaId.length < 20) s.podniky.ukazkaId.push(p.id); }
      if (!v.ostry || Date.now() > konec) continue;
      try {
        if (krok === 'smazat') {
          if (smazano >= RETENCE.davkaPodniku) continue;
          // Pojistka: mezitím obnovené předplatné (nebo smazané upozornění) = nemazat.
          const [stale] = await sql`SELECT 1 AS ok FROM teams WHERE id = ${p.id} AND subscription_status = 'canceled' AND retence_upozorneno7_at IS NOT NULL` as any[];
          if (!stale) continue;
          await smazPodnik(p.id, p.ownerId); smazano++; s.podniky.smazano++;
        } else {
          if (upozorneno >= RETENCE.davkaUpozorneniPodniku || !smazatOd) continue;
          const r = await upozorniPodnik(p, krok === 'upozornit7', smazatOd);
          if (r === 'odeslano') { upozorneno++; s.podniky.upozorneno = (s.podniky.upozorneno ?? 0) + 1; }
          else if (r !== 'obsazeno') { s.podniky.chyb = (s.podniky.chyb ?? 0) + 1; if (s.chyby.length < 20) s.chyby.push(`podnik ${p.id}: ${r === 'bezAdresy' ? 'bez platného e-mailu vlastníka' : 'upozornění neodešlo'}`); }
        }
      } catch (e) {
        s.podniky.chyb = (s.podniky.chyb ?? 0) + 1;
        if (s.chyby.length < 20) s.chyby.push(`podnik ${p.id}: ${(e as Error)?.message?.slice(0, 120) ?? 'chyba'}`);
      }
    }
  } catch (e) { s.chyby.push(`podniky: ${(e as Error)?.message?.slice(0, 160) ?? 'chyba'} (před migrací?)`); }

  await zapisBeh(s);
  return s;
}

/** Zapíše souhrn běhu. Nikdy nevyhazuje (souhrn jde i do logu serveru). */
export async function zapisBeh(s: SouhrnRetence): Promise<void> {
  console.log('retence:', JSON.stringify({ rezim: s.rezim, hoste: s.hoste, auditLog: s.auditLog, oznameni: s.oznameni, podniky: s.podniky, chyb: s.chyby.length }));
  try { await sql`INSERT INTO retence_behy (rezim, souhrn) VALUES (${s.rezim}, ${JSON.stringify(s)}::jsonb)`; }
  catch (e) { console.error('retence: běh se nepodařilo zapsat', (e as { code?: string })?.code ?? e); }
}

/** Posledních pár běhů pro správu platformy. Před migrací prázdné. */
export async function posledniBehy(n = 10): Promise<{ id: number; rezim: string; souhrn: SouhrnRetence; createdAt: string | null }[]> {
  try {
    const rows = await sql`SELECT id, rezim, souhrn, created_at FROM retence_behy ORDER BY id DESC LIMIT ${n}` as any[];
    return rows.map(r => ({ id: Number(r.id), rezim: String(r.rezim), souhrn: r.souhrn as SouhrnRetence, createdAt: r.created_at ?? null }));
  } catch { return []; }
}

/** Host klikl v upozornění na „Ponechat účet“: počítá se jako aktivita a upozornění propadá. */
export async function ponechatUcet(userId: number): Promise<boolean> {
  try {
    const r = await sql`UPDATE users SET retence_ponechat_at = NOW(), retence_upozorneno_at = NULL WHERE id = ${userId} AND role = 'customer' AND deleted_at IS NULL RETURNING id` as any[];
    return r.length > 0;
  } catch { return false; }
}
