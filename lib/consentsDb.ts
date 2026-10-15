// Souhlasy hosta v databázi: zápis (jen nové řádky), platný stav po podnicích, souhlasy příjemců
// rozesílky a jednorázový převod dřívějšího globálního souhlasu. Pravidla jsou čistá v lib/consents.ts.
//
// Tabulka `consents` vzniká v app/api/init/route.ts (odtud ji zná kontrola SQL) a stejným příkazem
// i tady při prvním použití, ať profil hosta funguje i dřív, než po nasazení někdo otevře /api/init.
// Před migrací (tabulka chybí a vytvořit nejde) vrací čtení `null` a volající se chová jako dřív
// (globální souhlas v users.notif_prefs).

import { neon } from '@neondatabase/serverless';
import {
  aktualniSouhlasy, maNejakySouhlas, radkyZmeny, souhlasPodniku, zneniNovinek, VERZE_ZNENI_NOVINEK,
  type KanalSouhlasu, type RadekSouhlasu, type SouhlasNovinek, type StavSouhlasu, type TypSouhlasu, type ZmenaSouhlasu,
} from './consents';

const sql = neon(process.env.DATABASE_URL!);

let pripraveno: Promise<boolean> | null = null;

/** Založí tabulku (jednou za studený start). false = nejde (databáze bez práv nebo výpadek). */
export function zajistiConsents(): Promise<boolean> {
  if (!pripraveno) {
    pripraveno = (async () => {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS consents (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            team_id INTEGER,
            typ TEXT NOT NULL,
            stav TEXT NOT NULL,
            verze TEXT,
            zneni TEXT,
            kanal TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
          )`;
        await sql`CREATE INDEX IF NOT EXISTS consents_user ON consents (user_id, team_id, typ, id)`;
        await sql`CREATE INDEX IF NOT EXISTS consents_team ON consents (team_id, typ, user_id)`;
        return true;
      } catch (e) {
        console.error('souhlasy: tabulku nejde založit', (e as { code?: string })?.code ?? e);
        pripraveno = null;
        return false;
      }
    })();
  }
  return pripraveno;
}

/** Všechny řádky souhlasů uživatele (pro platný stav i pro export). null = tabulka není. */
export async function radkySouhlasu(userId: number): Promise<(RadekSouhlasu & { verze: string | null; zneni: string | null; kanal: string })[] | null> {
  if (!(await zajistiConsents())) return null;
  try {
    const rows = await sql`SELECT id, team_id, typ, stav, verze, zneni, kanal, created_at FROM consents WHERE user_id = ${userId} ORDER BY id` as any[];
    return rows.map(r => ({
      id: Number(r.id), team_id: r.team_id == null ? null : Number(r.team_id), typ: String(r.typ), stav: String(r.stav),
      verze: r.verze ?? null, zneni: r.zneni ?? null, kanal: String(r.kanal), created_at: r.created_at ?? null,
    }));
  } catch { return null; }
}

/** Platný souhlas s novinkami jednoho podniku. null = tabulka není (před migrací). */
export async function souhlasHostaPodniku(userId: number, teamId: number): Promise<SouhlasNovinek | null> {
  const r = await radkySouhlasu(userId);
  return r ? souhlasPodniku(aktualniSouhlasy(r), teamId) : null;
}

/**
 * Drží globální příznak `notif_prefs.novinky` (a `novinkyEmail`) jako „aspoň jeden podnik“. Čte ho
 * doručování push oznámení kategorie novinky (lib/push.ts, OPT_IN); který podnik smí poslat, rozhoduje
 * až souhlas podniku u příjemců (lib/zpravyKanaly.ts).
 */
async function srovnejGlobalniPriznak(userId: number): Promise<void> {
  const r = await radkySouhlasu(userId);
  if (!r) return;
  const akt = aktualniSouhlasy(r);
  const push = maNejakySouhlas(akt);
  let email = false;
  for (const x of akt.values()) if (x.team_id != null && x.typ === 'novinky_email' && x.stav === 'udelen') email = true;
  try {
    await sql`UPDATE users SET notif_prefs = COALESCE(notif_prefs, '{}'::jsonb)
      || jsonb_build_object('novinky', ${push}::boolean, 'novinkyEmail', ${email}::boolean, 'novinkyAt', ${new Date().toISOString()}::text)
      WHERE id = ${userId}`;
  } catch { /* před migrací sloupce notif_prefs */ }
}

/** Zapíše jeden řádek (udělení nebo odvolání). Nikdy nemaže ani nepřepisuje. */
export async function zapisRadekSouhlasu(v: {
  userId: number; teamId: number | null; typ: TypSouhlasu; stav: StavSouhlasu; kanal: KanalSouhlasu; verze?: string | null; zneni?: string | null;
}): Promise<boolean> {
  if (!(await zajistiConsents())) return false;
  try {
    await sql`INSERT INTO consents (user_id, team_id, typ, stav, verze, zneni, kanal)
      VALUES (${v.userId}, ${v.teamId}, ${v.typ}, ${v.stav}, ${v.verze ?? null}, ${v.zneni ?? null}, ${v.kanal})`;
    return true;
  } catch (e) {
    console.error('souhlasy: zápis selhal', (e as { code?: string })?.code ?? e);
    return false;
  }
}

async function nazevPodniku(teamId: number): Promise<string> {
  try {
    const [t] = await sql`SELECT COALESCE(NULLIF(share_theme->>'businessName', ''), name) AS business FROM teams WHERE id = ${teamId}`;
    return String(t?.business ?? '');
  } catch { return ''; }
}

/**
 * Změna z profilu nebo při vstupu do členství. Zapíše jen řádky, které stav mění (lib/consents.ts,
 * radkyZmeny), a srovná globální příznak. Vrací nový stav, nebo null (tabulka není / zápis selhal).
 */
export async function zmenSouhlas(userId: number, z: ZmenaSouhlasu, kanal: KanalSouhlasu): Promise<SouhlasNovinek | null> {
  if (!(await zajistiConsents())) return null;
  await prevedUzivatele(userId);
  const r = await radkySouhlasu(userId);
  if (!r) return null;
  const dnes = souhlasPodniku(aktualniSouhlasy(r), z.teamId);
  const radky = radkyZmeny(z, dnes);
  if (!radky.length) return dnes;
  const podnik = await nazevPodniku(z.teamId);
  for (const x of radky) {
    const ok = await zapisRadekSouhlasu({
      userId, teamId: x.teamId, typ: x.typ, stav: x.stav, kanal,
      verze: VERZE_ZNENI_NOVINEK, zneni: x.stav === 'udelen' ? zneniNovinek(podnik, x.typ) : null,
    });
    if (!ok) return null;
  }
  await srovnejGlobalniPriznak(userId);
  const po = await radkySouhlasu(userId);
  return po ? souhlasPodniku(aktualniSouhlasy(po), z.teamId) : null;
}

/**
 * Odhlášení odkazem z e-mailu: odvolá e-mail jednoho podniku (`teamId`), nebo všech, kde je udělený
 * (starý odkaz bez podniku). Oznámení v aplikaci zůstávají. Vrací počet odvolaných podniků; null = tabulka není.
 */
export async function odvolejEmaily(userId: number, teamId: number | null): Promise<number | null> {
  if (!(await zajistiConsents())) return null;
  await prevedUzivatele(userId);
  const r = await radkySouhlasu(userId);
  if (!r) return null;
  const akt = aktualniSouhlasy(r);
  let n = 0;
  for (const x of akt.values()) {
    if (x.typ !== 'novinky_email' || x.stav !== 'udelen' || x.team_id == null) continue;
    if (teamId != null && x.team_id !== teamId) continue;
    if (await zapisRadekSouhlasu({ userId, teamId: x.team_id, typ: 'novinky_email', stav: 'odvolan', kanal: 'odkaz_email', verze: VERZE_ZNENI_NOVINEK })) n++;
  }
  if (n) await srovnejGlobalniPriznak(userId);
  return n;
}

/** Znovu zapnout e-maily podniku (tlačítko „Vrátit“ na stránce odhlášení). */
export async function obnovEmail(userId: number, teamId: number): Promise<boolean> {
  const s = await zmenSouhlas(userId, { teamId, typ: 'novinky_email', stav: 'udelen' }, 'odkaz_email');
  return !!s?.email;
}

/**
 * Souhlasy příjemců rozesílky jednoho podniku: id → { push, email }. Host, který už v nové tabulce
 * nějaký řádek o novinkách má, a pro tenhle podnik žádný, dostane { false, false } (bez souhlasu). Host
 * bez jediného takového řádku (převod ještě neproběhl) v mapě chybí a volající použije globální souhlas.
 * null = tabulka není (před migrací).
 */
export async function souhlasyPrijemcu(teamId: number, ids: number[]): Promise<Map<number, SouhlasNovinek> | null> {
  if (!(await zajistiConsents())) return null;
  if (!ids.length) return new Map();
  try {
    const [vSystemu, rows] = await Promise.all([
      sql`SELECT DISTINCT user_id FROM consents WHERE user_id = ANY(${ids}) AND typ IN ('novinky_push', 'novinky_email')` as Promise<any[]>,
      sql`
        SELECT DISTINCT ON (user_id, typ) user_id, typ, stav FROM consents
        WHERE team_id = ${teamId} AND typ IN ('novinky_push', 'novinky_email') AND user_id = ANY(${ids})
        ORDER BY user_id, typ, id DESC` as Promise<any[]>,
    ]);
    const out = new Map<number, SouhlasNovinek>();
    for (const r of vSystemu) out.set(Number(r.user_id), { push: false, email: false });
    for (const r of rows) {
      const s = out.get(Number(r.user_id)) ?? { push: false, email: false };
      if (r.typ === 'novinky_push') s.push = r.stav === 'udelen'; else s.email = r.stav === 'udelen';
      out.set(Number(r.user_id), s);
    }
    return out;
  } catch { return null; }
}

/**
 * Jednorázový převod dřívějšího globálního souhlasu (spuštění, balík G). Kdo měl `notif_prefs.novinky`
 * = true a v nové tabulce ještě nemá ani jeden řádek o novinkách (podmínky a zásady se nepočítají), dostane:
 *  - souhlas s oznámeními (a e-mailem, pokud ho nevypnul) u každého podniku, kde je dnes členem,
 *  - jeden řádek „platforma“ jako záznam původního souhlasu.
 * Všechno s kanálem „prevod“. Díky podmínce „žádný řádek“ se převod u téhož člověka nezopakuje
 * a nový podnik, do kterého host vstoupí později, souhlas automaticky nedostane. Idempotentní.
 */
export async function prevodSouhlasu(): Promise<number> {
  if (!(await zajistiConsents())) return 0;
  try {
    const kdo = await sql`
      SELECT u.id FROM users u
      WHERE u.role = 'customer' AND u.notif_prefs->>'novinky' = 'true'
        AND NOT EXISTS (SELECT 1 FROM consents c WHERE c.user_id = u.id AND c.typ IN ('novinky_push', 'novinky_email'))
      LIMIT 2000` as any[];
    let n = 0;
    for (const u of kdo) if (await prevedUzivatele(Number(u.id))) n++;
    return n;
  } catch (e) {
    console.error('souhlasy: převod selhal', (e as { code?: string })?.code ?? e);
    return 0;
  }
}

/**
 * Převod jednoho hosta (viz prevodSouhlasu). Volá se i před první změnou v profilu: kdo by si
 * přepnul jeden podnik dřív, než doběhne noční převod, nesmí tím přijít o souhlas s ostatními.
 * Vrací, jestli se něco převedlo.
 */
export async function prevedUzivatele(userId: number): Promise<boolean> {
  const verze = `prevod-${VERZE_ZNENI_NOVINEK}`;
  const zneni = 'Převedeno z dřívějšího souhlasu „Novinky a akce od podniků“ (platil pro podniky, kde byl host členem).';
  try {
    const [u] = await sql`
      SELECT u.id, COALESCE(u.notif_prefs->>'novinkyEmail', '') <> 'false' AS email FROM users u
      WHERE u.id = ${userId} AND u.role = 'customer' AND u.notif_prefs->>'novinky' = 'true'
        AND NOT EXISTS (SELECT 1 FROM consents c WHERE c.user_id = u.id AND c.typ IN ('novinky_push', 'novinky_email'))` as any[];
    if (!u) return false;
    await sql`INSERT INTO consents (user_id, team_id, typ, stav, verze, zneni, kanal)
      SELECT ${userId}, m.team_id, 'novinky_push', 'udelen', ${verze}, ${zneni}, 'prevod' FROM client_memberships m WHERE m.customer_id = ${userId}`;
    if (u.email === true) {
      await sql`INSERT INTO consents (user_id, team_id, typ, stav, verze, zneni, kanal)
        SELECT ${userId}, m.team_id, 'novinky_email', 'udelen', ${verze}, ${zneni}, 'prevod' FROM client_memberships m WHERE m.customer_id = ${userId}`;
    }
    await sql`INSERT INTO consents (user_id, team_id, typ, stav, verze, zneni, kanal)
      VALUES (${userId}, NULL, 'novinky_push', 'udelen', ${verze}, ${zneni}, 'prevod')`;
    return true;
  } catch { return false; }
}

/** Souhlas s podmínkami a zásadami jako řádky platformy (vedle users.terms_version). Nikdy nevyhazuje. */
export async function zapisSouhlasPlatformy(userId: number, verzePodminek: string, verzeZasad: string, kanal: KanalSouhlasu): Promise<void> {
  try {
    await zapisRadekSouhlasu({ userId, teamId: null, typ: 'podminky', stav: 'udelen', kanal, verze: verzePodminek });
    await zapisRadekSouhlasu({ userId, teamId: null, typ: 'zasady', stav: 'udelen', kanal, verze: verzeZasad });
  } catch { /* záznam navíc; zdroj pravdy je users.terms_version */ }
}

/**
 * IČO podniku pro označení obchodního sdělení (§ 7 zák. 480/2004). Sloupec teams.ico přibyl s profilem
 * podniku (kolo 73) a v DDL zatím není — proto `sql.query`, ať ho kontrola SQL nehledá ve schématu.
 * Bez sloupce nebo bez IČO null (v e-mailu je pak jen jméno podniku).
 */
export async function icoPodniku(teamId: number): Promise<string | null> {
  try {
    const rows = await sql.query('SELECT ico FROM teams WHERE id = $1', [teamId]) as any[];
    const ico = String(rows?.[0]?.ico ?? '').replace(/\s+/g, '');
    return /^\d{8}$/.test(ico) ? ico : null;
  } catch { return null; }
}
