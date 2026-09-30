// Smazání účtu nad databází. Pravidla a kroky jsou v lib/smazaniUctu.ts (čisté,
// testované); tady se jen načte stav, zruší předplatné, kroky se provedou
// a zapíše se protokol. Sdílí to DELETE /api/account (z aplikace) a potvrzení
// z e-mailu (web bez přihlášení, /smazat-ucet).

import { neon } from '@neondatabase/serverless';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { audit } from './audit';
import { pragueToday } from './pragueTime';
import { jeSpravcePodleDb } from './superadminDb';
import { del } from '@vercel/blob';
import { stripe } from './billing';
import { zneplatniStav } from './auth';
import {
  rozhodniSmazani, planUzivatele, planPodniku, anonymizaceBezMigrace, proved, jeChybejiciObjekt,
  type VlastnenyPodnik, type Exec,
} from './smazaniUctu';

export type VysledekSmazani =
  | { ok: true; smazanePodniky: number; varovani: string[] }
  | { ok: false; status: number; kod: string; zprava: string; vlastnene?: VlastnenyPodnik[] };

const sql = () => neon(process.env.DATABASE_URL!);

/** Podniky, které uživatel vlastní, a kolik dalších lidí v nich zůstane. */
export async function vlastnenePodniky(userId: number): Promise<VlastnenyPodnik[]> {
  const s = sql();
  const teams = await s`SELECT id, name FROM teams WHERE owner_id = ${userId} ORDER BY id`;
  const out: VlastnenyPodnik[] = [];
  for (const t of teams as { id: number; name: string }[]) {
    let dalsi = 0;
    try {
      // Členství (team_members) i starý sloupec users.team_id: po migraci bývají obě, před ní jen druhé.
      const [c] = await s`
        SELECT COUNT(DISTINCT x.uid)::int AS n FROM (
          SELECT user_id AS uid FROM team_members WHERE team_id = ${t.id} AND user_id <> ${userId}
          UNION SELECT id AS uid FROM users WHERE team_id = ${t.id} AND id <> ${userId} AND deleted_at IS NULL
        ) x`;
      dalsi = Number(c?.n ?? 0);
    } catch {
      const [c] = await s`SELECT COUNT(*)::int AS n FROM users WHERE team_id = ${t.id} AND id <> ${userId}`;
      dalsi = Number(c?.n ?? 0);
    }
    out.push({ id: Number(t.id), nazev: String(t.name), dalsiClenove: dalsi });
  }
  return out;
}

const STRIPE_PRAZDNO = /resource_missing|No such (subscription|customer)/i;

/**
 * Stripe před smazáním podniku: zruší předplatné a smaže zákazníka (e-mail, jméno, platební metody).
 * Chyba Stripe smazání NEBLOKUJE (osobní údaje v naší databázi se mažou vždy); zapíše se do logu, do
 * protokolu (id zákazníka, aby podpora mohla dokončit ručně) a vrátí se jako varování. Faktury a platby
 * zůstávají ve Stripe jako účetní evidence.
 */
export async function uklidStripe(teamIds: number[], userId: number): Promise<string[]> {
  if (!teamIds.length) return [];
  const s = sql();
  let rows: any[] = [];
  try { rows = await s`SELECT id, stripe_customer_id, stripe_subscription_id FROM teams WHERE id = ANY(${teamIds}) AND (stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL)` as any[]; }
  catch { return []; }
  if (!rows.length) return [];
  const varovani: string[] = [];
  const st = stripe();
  if (!st) {
    console.error('smazání účtu: Stripe není nastavený, předplatné a zákazník zůstávají', rows.map(r => r.stripe_customer_id));
    await zapisStripeChybu(userId, rows.map(r => String(r.stripe_customer_id ?? r.stripe_subscription_id)).join(','));
    return ['Platby nejsou nastavené, předplatné a zákazníka ve Stripe nešlo zrušit. Napište podpoře, dokončíme to ručně.'];
  }
  const selhalo = async (co: string, id: string, e: any) => {
    if (STRIPE_PRAZDNO.test(`${e?.code ?? ''} ${e?.message ?? ''}`)) return; // už neexistuje: hotovo
    console.error(`smazání účtu: ${co} ve Stripe selhalo`, id, e);
    await zapisStripeChybu(userId, `${co}:${id}`);
    varovani.push(`Ve Stripe se nepodařilo ${co === 'zrušení předplatného' ? 'zrušit předplatné' : 'smazat zákazníka'}. Účet je smazaný; napište podpoře, dokončíme to ručně.`);
  };
  for (const r of rows) {
    if (r.stripe_subscription_id) {
      try { await st.subscriptions.cancel(String(r.stripe_subscription_id)); }
      catch (e) { await selhalo('zrušení předplatného', String(r.stripe_subscription_id), e); }
    }
    if (r.stripe_customer_id) {
      try { await st.customers.del(String(r.stripe_customer_id)); }
      catch (e) { await selhalo('smazání zákazníka', String(r.stripe_customer_id), e); }
    }
  }
  return varovani;
}

/** Id Stripe objektu (není osobní údaj) se při chybě uloží do protokolu; bez něj by zákazník po smazání teams nešel dohledat. */
async function zapisStripeChybu(userId: number, detail: string) {
  await audit(null, userId, 'ucet.stripe_chyba', 'user', userId, detail.slice(0, 250));
}

/** Soubory (blob) osoby mimo podnik a soubory smazaných podniků. Čte se PŘED mazáním řádků. */
async function blobyKeSmazani(userId: number, teamIds: number[]): Promise<string[]> {
  try {
    const rows = await sql()`SELECT blob_path FROM uploads WHERE blob_path IS NOT NULL
      AND ((team_id IS NULL AND user_id = ${userId}) OR team_id = ANY(${teamIds}))` as any[];
    return rows.map(r => String(r.blob_path));
  } catch { return []; }
}

async function smazBloby(cesty: string[]): Promise<string[]> {
  if (!cesty.length) return [];
  if (!process.env.BLOB_READ_WRITE_TOKEN) return ['Soubory v úložišti se nepodařilo smazat (úložiště není nastavené). Napište podpoře.'];
  try { await del(cesty); return []; }
  catch (e) {
    console.error('smazání účtu: smazání souborů z úložiště selhalo', cesty, e);
    return ['Některé nahrané soubory se nepodařilo smazat z úložiště. Napište podpoře, dokončíme to ručně.'];
  }
}

/**
 * Smaže (anonymizuje) účet. Heslo se ověřuje ve volající routě; tady už jde
 * o provedení. Opakované volání po částečném selhání doběhne (kroky jsou idempotentní).
 */
export async function smazUcet(userId: number, volby: { smazatPodnik?: boolean; potvrzeni?: string | null; zDuvodu?: string }): Promise<VysledekSmazani> {
  const s = sql();
  const [u] = await s`SELECT id, email, role, team_id FROM users WHERE id = ${userId}`;
  if (!u) return { ok: false, status: 404, kod: 'NENI', zprava: 'Účet neexistuje.' };
  const vlastnene = await vlastnenePodniky(userId);
  const superadmin = await jeSpravcePodleDb(userId);
  const r = rozhodniSmazani({ superadmin, vlastnene, smazatPodnik: volby.smazatPodnik === true, potvrzeni: volby.potvrzeni });
  if (!r.ok) return { ok: false, status: r.status, kod: r.kod, zprava: r.zprava, vlastnene };

  const prvniTym = r.smazatPodniky[0] ?? (u.team_id == null ? null : Number(u.team_id));
  // Stripe ještě před mazáním (ID leží v teams). Selhání smazání neblokuje, vrátí se jako varování; opakování je bezpečné.
  const stripeVarovani = await uklidStripe(r.smazatPodniky, userId);
  const bloby = await blobyKeSmazani(userId, r.smazatPodniky);

  // Protokol PŘED smazáním, dokud je co popsat; po smazání podniku by zápis s jeho team_id visel ve vzduchu.
  await audit(r.smazatPodniky.length ? null : prvniTym, userId, r.smazatPodniky.length ? 'podnik.smazan' : 'ucet.smazan', 'user', userId,
    `${String(u.role)}${volby.zDuvodu ? ` · ${volby.zDuvodu}` : ''}`.slice(0, 120));

  const exec: Exec = async (text, params) => s.query(text, params as any[]);
  // Kdo se smazal, nesmí se přihlásit ani se starým heslem: hash, který bcrypt nikdy neporovná jako shodný.
  const hash = `!${randomBytes(24).toString('hex')}`;
  const kroky = [
    ...r.smazatPodniky.flatMap(id => planPodniku(id, userId)),
    ...planUzivatele({ id: userId, email: String(u.email), role: String(u.role), hash, dnes: pragueToday() }),
  ];
  try {
    await proved(exec, kroky);
  } catch (e) {
    // Poslední krok (anonymizace) padl na chybějícím sloupci: databáze před migrací. Záložní varianta.
    if (!jeChybejiciObjekt(e)) throw e;
    await proved(exec, [anonymizaceBezMigrace({ id: userId, role: String(u.role), hash })]);
  }
  zneplatniStav(userId);
  return { ok: true, smazanePodniky: r.smazatPodniky.length, varovani: [...stripeVarovani, ...(await smazBloby(bloby))] };
}

/** Ověření hesla pro smazání: stejná odpověď u špatného hesla i u chybějícího účtu. */
export async function hesloSedi(userId: number, heslo: string): Promise<boolean> {
  try {
    const [u] = await sql()`SELECT password_hash FROM users WHERE id = ${userId}`;
    if (!u) return false;
    return await bcrypt.compare(heslo, String(u.password_hash));
  } catch { return false; }
}
