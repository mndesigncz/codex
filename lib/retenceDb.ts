// Retence nad databází: najde, co je po lhůtě (lib/retence.ts), a v NÁHLEDU to jen spočítá a zapíše
// do `retence_behy`; ostře (RETENCE_ZAPNUTA=1) pošle upozornění, anonymizuje hosty přes lib/smazaniUctuDb
// (stejná cesta jako „Smazat účet“) a smaže staré záznamy a zrušené podniky. Každý běh se zapíše.

import { neon } from '@neondatabase/serverless';
import { del } from '@vercel/blob';
import { sendPravniEmail, odkazovyZaklad } from './email';
import { parseDbTime, pragueDayOf } from './pragueTime';
import { smazUcet, uklidStripe } from './smazaniUctuDb';
import { planPodniku, proved, type Exec } from './smazaniUctu';
import {
  RETENCE, hraniceRetence, rozhodniHosta, denAnonymizace, emailUpozorneni, tokenPonechani, prazdnySouhrn,
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
 * otevření nativní aplikace (device_tokens), změny souhlasu a kliknutí „Ponechat účet“. Přihlášení
 * na webu se zatím nikde neukládá (viz hlášení balíku G).
 */
async function kandidatiHoste(upozornitPred: Date): Promise<{ id: number; email: string | null; name: string; upozorneno: Date | null; posledni: Date | null }[]> {
  const rows = await sql`
    SELECT x.id, x.email, x.name, x.retence_upozorneno_at, x.posledni FROM (
      SELECT u.id, u.email, u.name, u.retence_upozorneno_at,
        GREATEST(u.created_at, u.terms_accepted_at, u.retence_ponechat_at,
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

/** Zrušené podniky po lhůtě: předplatné zrušené a skončené, od konce v podniku nikdo nic nedělal. */
async function kandidatiPodniky(konecPred: Date): Promise<{ id: number; ownerId: number }[]> {
  const rows = await sql`
    SELECT t.id, t.owner_id FROM teams t
    WHERE t.had_subscription = TRUE AND t.subscription_status = 'canceled'
      AND COALESCE(t.current_period_end, t.trial_end) < ${konecPred.toISOString()}::timestamp
      AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.team_id = t.id AND a.created_at > COALESCE(t.current_period_end, t.trial_end))
      AND NOT EXISTS (SELECT 1 FROM time_entries e WHERE e.team_id = t.id AND e.clock_in > COALESCE(t.current_period_end, t.trial_end))
    ORDER BY t.id
    LIMIT 200` as any[];
  return rows.map(r => ({ id: Number(r.id), ownerId: Number(r.owner_id) }));
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
  try {
    const podniky = await kandidatiPodniky(h.podnikKonecPred);
    s.podniky.kSmazani = podniky.length;
    s.podniky.ukazkaId = podniky.slice(0, 20).map(p => p.id);
    if (v.ostry) {
      for (const p of podniky.slice(0, RETENCE.davkaPodniku)) {
        if (Date.now() > konec) break;
        try { await smazPodnik(p.id, p.ownerId); s.podniky.smazano++; }
        catch (e) { if (s.chyby.length < 20) s.chyby.push(`podnik ${p.id}: ${(e as Error)?.message?.slice(0, 120) ?? 'chyba'}`); }
      }
    }
  } catch (e) { s.chyby.push(`podniky: ${(e as Error)?.message?.slice(0, 160) ?? 'chyba'}`); }

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
