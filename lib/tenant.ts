// Příslušnost k podniku — jedna pravda, `team_members`.
//
// Do téhle chvíle měl účet jeden tým a tenant se v API odvozoval na 96
// místech dotazem `SELECT team_id FROM users`. Tahle místa se nemění
// najednou: `users.team_id` a `users.role` tu zůstávají jako ZRCADLO
// aktivního členství. Přepnout podnik znamená ověřit členství a zrcadlo
// přepsat — tady, na serveru, nikdy z tokenu nebo z těla požadavku
// (kolo 50: „kdo si ho nastaví sám, čte cizí podnik").

import { neon } from '@neondatabase/serverless';
import { generateJoinCode } from './team';
import { normalizujNastaveni, normalizujRoli, smiPrepnout, tymyProCiselnik, type Ciselnik, type Clenstvi, type NastaveniOrganizace, type RoleClenstvi } from './organizace';

const sql = neon(process.env.DATABASE_URL!);

/** Podniky, kde je uživatel členem. Prázdné před migrací nebo bez členství. */
export async function clenstviUzivatele(userId: number): Promise<Clenstvi[]> {
  try {
    const rows = await sql`
      SELECT m.team_id AS "teamId", m.role, t.name AS "teamName", t.organization_id AS "organizationId"
      FROM team_members m JOIN teams t ON t.id = m.team_id
      WHERE m.user_id = ${userId}
      ORDER BY t.name ASC`;
    return (rows as any[]).map(r => ({
      teamId: Number(r.teamId), role: normalizujRoli(r.role),
      teamName: String(r.teamName ?? ''), organizationId: r.organizationId != null ? Number(r.organizationId) : null,
    }));
  } catch { return []; }
}

/**
 * Přepne aktivní podnik. Ověří členství; pak přepíše zrcadlo (`users.team_id`,
 * `users.role`, `users.active_team_id`). Token se obnoví až po `session.update()`
 * z prohlížeče, který tým čte znovu z databáze — takže i middleware (blokace
 * podniku) uvidí ten nový.
 */
export async function prepniTym(userId: number, teamId: number): Promise<Clenstvi | null> {
  const clenstvi = await clenstviUzivatele(userId);
  const cil = smiPrepnout(clenstvi, teamId);
  if (!cil) return null;
  await sql`
    UPDATE users SET team_id = ${cil.teamId}, active_team_id = ${cil.teamId}, role = ${cil.role},
      employer_id = (SELECT owner_id FROM teams WHERE id = ${cil.teamId})
    WHERE id = ${userId}`;
  return cil;
}

/** Přidá (nebo aktualizuje) členství. Zrcadlo se nemění — člověk zůstává tam, kde byl. */
export async function pridejClenstvi(userId: number, teamId: number, role: RoleClenstvi, extra?: { jobTitle?: string | null; hourlyRate?: number | null }): Promise<void> {
  await sql`
    INSERT INTO team_members (user_id, team_id, role, job_title, hourly_rate)
    VALUES (${userId}, ${teamId}, ${role}, ${extra?.jobTitle ?? null}, ${extra?.hourlyRate ?? null})
    ON CONFLICT (user_id, team_id) DO UPDATE SET role = EXCLUDED.role`;
}

/** Organizace podniku (nebo null). */
export async function organizaceTymu(teamId: number): Promise<{ id: number; name: string; ownerId: number; nastaveni: NastaveniOrganizace } | null> {
  try {
    const [o] = await sql`
      SELECT o.id, o.name, o.owner_id AS "ownerId", o.settings
      FROM organizations o JOIN teams t ON t.organization_id = o.id
      WHERE t.id = ${teamId}`;
    if (!o) return null;
    return { id: Number(o.id), name: String(o.name), ownerId: Number(o.ownerId), nastaveni: normalizujNastaveni(o.settings) };
  } catch { return null; }
}

/** Podniky organizace i s názvy — „Spravuje: …" se pak obejde bez dalšího dotazu. */
async function podnikyOrganizaceSNazvy(organizationId: number): Promise<{ id: number; name: string }[]> {
  try {
    const rows = await sql`SELECT id, name FROM teams WHERE organization_id = ${organizationId}`;
    return (rows as any[]).map(r => ({ id: Number(r.id), name: String(r.name ?? '') }));
  } catch { return []; }
}

/** Id všech podniků organizace. Prázdné, když tabulka ještě není. */
export async function podnikyOrganizace(organizationId: number): Promise<number[]> {
  return (await podnikyOrganizaceSNazvy(organizationId)).map(p => p.id);
}

/** Co GET číselníku potřebuje kromě predikátu: chip „sdíleno" u zdroje a jméno zdroje u cizích řádků. */
export interface CiselnikPodniku {
  /** Predikát pro dotaz: `team_id = ANY(${tymy})`. Vlastní podnik vždy první. */
  tymy: number[];
  /** Moje řádky čtou ostatní podniky organizace — v UI chip „sdíleno". */
  jsemZdroj: boolean;
  /** Název zdrojového podniku pro „Spravuje: …", jen když čtu cizí řádky. */
  spravuje: string | null;
}

/**
 * Podniky, jejichž řádky daného číselníku aktivní podnik čte (kolo 60).
 * Jediné místo, kde se sdílení rozhoduje: aktivní podnik přijde z databáze
 * (volající ho má z `SELECT team_id FROM users`), organizace z jeho
 * `teams.organization_id`, zdroj z jejího nastavení a ověřený proti
 * seznamu jejích podniků. Nikdy neobsahuje podnik mimo organizaci a nikdy
 * nebere nic z požadavku. Predikát pro dotaz: `team_id = ANY(${tymy})`.
 */
export async function tymyCiselniku(teamId: number, ciselnik: Ciselnik): Promise<number[]> {
  return (await ciselnikPodniku(teamId, ciselnik)).tymy;
}

/**
 * Totéž rozhodnutí jako tymyCiselniku, plus co seznam číselníku ukazuje
 * vedle řádků. Organizace se čte JEDNOU: podnik bez organizace (většina)
 * stojí jeden dotaz, podnik se sdílením dva — dřív si routy pro chip
 * „sdíleno" a pro jméno zdroje dělaly další dva navíc.
 */
export async function ciselnikPodniku(teamId: number, ciselnik: Ciselnik): Promise<CiselnikPodniku> {
  const sam: CiselnikPodniku = { tymy: [teamId], jsemZdroj: false, spravuje: null };
  const org = await organizaceTymu(teamId);
  if (!org?.nastaveni.sdileneCiselniky) return sam;
  const podniky = await podnikyOrganizaceSNazvy(org.id);
  if (!podniky.length) return sam;
  const tymy = tymyProCiselnik(teamId, { nastaveni: org.nastaveni, teamIds: podniky.map(p => p.id) }, ciselnik);
  return {
    tymy,
    jsemZdroj: org.nastaveni.zdrojeCiselniku[ciselnik] === teamId,
    spravuje: tymy.length > 1 ? podniky.find(p => p.id === tymy[1])?.name ?? null : null,
  };
}

/**
 * tymyCiselniku pro mnoho podniků najednou (cron): dva dotazy na všechny
 * místo jednoho na každý podnik — i na ty bez organizace, kterých je
 * většina. Podnik bez organizace nebo se sdílením vypnutým dostane [sebe].
 */
export async function tymyCiselnikuHromadne(teamIds: number[], ciselnik: Ciselnik): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>(teamIds.map(id => [id, [id]]));
  if (!teamIds.length) return out;
  try {
    const orgs = await sql`
      SELECT t.id AS team_id, o.id AS org_id, o.settings
      FROM teams t JOIN organizations o ON o.id = t.organization_id
      WHERE t.id = ANY(${teamIds})` as any[];
    if (!orgs.length) return out;
    const clenove = await sql`
      SELECT id, organization_id FROM teams
      WHERE organization_id = ANY(${[...new Set(orgs.map(r => Number(r.org_id)))]})` as any[];
    const podleOrg = new Map<number, number[]>();
    for (const r of clenove) {
      const o = Number(r.organization_id);
      podleOrg.set(o, [...(podleOrg.get(o) ?? []), Number(r.id)]);
    }
    for (const r of orgs) {
      const nastaveni = normalizujNastaveni(r.settings);
      if (!nastaveni.sdileneCiselniky) continue;
      const teamId = Number(r.team_id);
      out.set(teamId, tymyProCiselnik(teamId, { nastaveni, teamIds: podleOrg.get(Number(r.org_id)) ?? [] }, ciselnik));
    }
  } catch { /* před migrací organizací čte každý podnik jen sebe */ }
  return out;
}

/**
 * Organizaci má podnik až ve chvíli, kdy má majitel druhý podnik. První
 * podnik se do ní zapíše zpětně, aby oba byly pod jednou střechou.
 */
export async function zajistiOrganizaci(ownerId: number, prvniTeamId: number, nazev: string): Promise<number> {
  const stavajici = await organizaceTymu(prvniTeamId);
  if (stavajici) return stavajici.id;
  const [o] = await sql`INSERT INTO organizations (name, owner_id) VALUES (${nazev}, ${ownerId}) RETURNING id`;
  await sql`UPDATE teams SET organization_id = ${o.id} WHERE id = ${prvniTeamId} AND organization_id IS NULL`;
  return Number(o.id);
}

/** Založí další podnik majiteli — pod jeho organizací, s členstvím jako vedení. */
export async function zalozDalsiPodnik(ownerId: number, aktivniTeamId: number, nazev: string): Promise<{ teamId: number; organizationId: number }> {
  const [akt] = await sql`SELECT name FROM teams WHERE id = ${aktivniTeamId}`;
  const organizationId = await zajistiOrganizaci(ownerId, aktivniTeamId, String(akt?.name ?? 'Moje podniky'));
  let joinCode = generateJoinCode();
  for (let i = 0; i < 5; i++) {
    const clash = await sql`SELECT id FROM teams WHERE join_code = ${joinCode}`;
    if (clash.length === 0) break;
    joinCode = generateJoinCode();
  }
  let team: any;
  try {
    [team] = await sql`
      INSERT INTO teams (name, owner_id, join_code, plan, organization_id)
      VALUES (${nazev}, ${ownerId}, ${joinCode}, 'free', ${organizationId}) RETURNING id`;
  } catch {
    [team] = await sql`
      INSERT INTO teams (name, owner_id, join_code, organization_id)
      VALUES (${nazev}, ${ownerId}, ${joinCode}, ${organizationId}) RETURNING id`;
  }
  try { await sql`INSERT INTO conversations (team_id, type, name) VALUES (${team.id}, 'team', 'Týmový chat')`; } catch { /* volitelné */ }
  await pridejClenstvi(ownerId, Number(team.id), 'employer', { jobTitle: 'Provozovatel' });
  return { teamId: Number(team.id), organizationId };
}

/**
 * Samoopravné členství při přihlášení: kdo má tým z doby před migrací,
 * ale řádek v `team_members` mu chybí (init ještě neproběhl), ho dostane.
 */
export async function zajistiClenstvi(userId: number, teamId: number | null, role: string): Promise<void> {
  if (!teamId || (role !== 'employer' && role !== 'employee')) return;
  try {
    await sql`
      INSERT INTO team_members (user_id, team_id, role)
      VALUES (${userId}, ${teamId}, ${role})
      ON CONFLICT (user_id, team_id) DO NOTHING`;
  } catch { /* před migrací */ }
}
