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
import { stripe } from './billing';
import { zneplatniStav } from './auth';
import {
  rozhodniSmazani, planUzivatele, planPodniku, anonymizaceBezMigrace, proved, jeChybejiciObjekt,
  type VlastnenyPodnik, type Exec,
} from './smazaniUctu';

export type VysledekSmazani =
  | { ok: true; smazanePodniky: number }
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

async function zrusPredplatne(teamIds: number[]): Promise<string | null> {
  if (!teamIds.length) return null;
  const s = sql();
  let rows: any[] = [];
  try { rows = await s`SELECT id, stripe_subscription_id FROM teams WHERE id = ANY(${teamIds}) AND stripe_subscription_id IS NOT NULL` as any[]; }
  catch { return null; }
  if (!rows.length) return null;
  const st = stripe();
  if (!st) return 'Předplatné nejde zrušit, platby nejsou nastavené. Zkuste to později nebo napište podpoře.';
  for (const r of rows) {
    try { await st.subscriptions.cancel(String(r.stripe_subscription_id)); }
    catch (e: any) {
      // Už zrušené nebo neexistující předplatné smazání nebrání.
      if (e?.code === 'resource_missing' || /No such subscription/i.test(String(e?.message))) continue;
      console.error('smazání účtu: zrušení předplatného selhalo', e);
      // Data podniku se nemažou, dokud by se mu dál strhávaly peníze.
      return 'Předplatné podniku se nepodařilo zrušit, účet zůstal beze změny. Zkuste to za chvíli.';
    }
  }
  return null;
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
  if (r.smazatPodniky.length) {
    const chyba = await zrusPredplatne(r.smazatPodniky);
    if (chyba) return { ok: false, status: 502, kod: 'PREDPLATNE', zprava: chyba };
  }

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
  return { ok: true, smazanePodniky: r.smazatPodniky.length };
}

/** Ověření hesla pro smazání: stejná odpověď u špatného hesla i u chybějícího účtu. */
export async function hesloSedi(userId: number, heslo: string): Promise<boolean> {
  try {
    const [u] = await sql()`SELECT password_hash FROM users WHERE id = ${userId}`;
    if (!u) return false;
    return await bcrypt.compare(heslo, String(u.password_hash));
  } catch { return false; }
}
