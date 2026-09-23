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
import { normalizujNastaveni, normalizujRoli, smiPrepnout, smiSdiletZamestnance, tymyProCiselnik, type Ciselnik, type Clenstvi, type NastaveniOrganizace, type RoleClenstvi } from './organizace';

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
  // Sazba a pozice jdou s podnikem (team_members), ne s člověkem: dřív si
  // barista přepnutím vzal sazbu z podniku A do podniku B, kde mu ji nikdo
  // nenastavil — a mzdy B se počítaly cizí sazbou.
  try {
    await sql`
      UPDATE users u SET team_id = ${cil.teamId}, active_team_id = ${cil.teamId}, role = ${cil.role},
        employer_id = (SELECT owner_id FROM teams WHERE id = ${cil.teamId}),
        hourly_rate = m.hourly_rate, job_title = COALESCE(m.job_title, u.job_title)
      FROM team_members m
      WHERE u.id = ${userId} AND m.user_id = u.id AND m.team_id = ${cil.teamId}`;
  } catch {
    await sql`
      UPDATE users SET team_id = ${cil.teamId}, active_team_id = ${cil.teamId}, role = ${cil.role},
        employer_id = (SELECT owner_id FROM teams WHERE id = ${cil.teamId})
      WHERE id = ${userId}`;
  }
  return cil;
}

/** Přidá (nebo aktualizuje) členství. Zrcadlo se nemění — člověk zůstává tam, kde byl. */
export async function pridejClenstvi(userId: number, teamId: number, role: RoleClenstvi, extra?: { jobTitle?: string | null; hourlyRate?: number | null }): Promise<void> {
  await sql`
    INSERT INTO team_members (user_id, team_id, role, job_title, hourly_rate)
    VALUES (${userId}, ${teamId}, ${role}, ${extra?.jobTitle ?? null}, ${extra?.hourlyRate ?? null})
    ON CONFLICT (user_id, team_id) DO UPDATE SET role = EXCLUDED.role`;
}

// ---------------------------------------------------------------------------
// Členové podniku (kolo 62)
//
// Do kola 62 braly desítky rout seznam členů, kontrolu členství, příjemce
// oznámení i sazbu ze zrcadla users.team_id — člen přepnutý do jiného
// podniku v tom původním zmizel: ze seznamu Týmu, z tabletu („Zaměstnanec
// není ve vašem týmu"), z rozvrhu, a mzda mu vyšla 0. Tohle je JEDINÉ
// místo, které říká, kdo je v podniku: členství (team_members) NEBO
// zrcadlo — to druhé kvůli tabletu (kiosk) a účtům, které se od migrace
// nepřihlásily. Role, pozice a sazba jsou z členství; sazba se NIKDY
// nebere ze zrcadla jiného podniku (člen bez sazby tady má NULL).
// JOIN je 1:1 díky UNIQUE(user_id, team_id) a `m.team_id = podnik` v ON.
// ---------------------------------------------------------------------------

/** 'lide' = vedení i zaměstnanci (bez tabletu). */
export type FiltrRole = 'employer' | 'employee' | 'lide';
const ROLE_FILTR: Record<FiltrRole, string[]> = { employer: ['employer'], employee: ['employee'], lide: ['employer', 'employee'] };

export interface ClenPodniku {
  id: number; name: string; avatar: string; email: string | null; phone: string | null;
  role: 'employer' | 'employee' | 'kiosk';
  jobTitle: string | null;
  /** Sazba V TOMHLE podniku; null = nenastavená (nikdy sazba z jiného podniku). Jen se `sSazbou`. */
  hourlyRate: number | null;
  shiftPreference: string | null;
  /** Má řádek v team_members (false = jen zrcadlo: tablet, nepřihlášený účet). */
  clenstvi: boolean;
  /** Právě přepnutý do jiného podniku — v UI chip, ať vedení ví, proč nereaguje. */
  aktivniJinde: boolean;
}
export interface VolbaClenu { role?: FiltrRole; sKioskem?: boolean; krome?: number; sSazbou?: boolean }

function clenZRadku(r: any, teamId: number): ClenPodniku {
  return {
    id: Number(r.id), name: String(r.name ?? ''), avatar: r.avatar ?? '👤', email: r.email ?? null, phone: r.phone ?? null,
    role: r.role === 'employer' || r.role === 'kiosk' ? r.role : 'employee',
    jobTitle: r.job_title ?? null,
    hourlyRate: r.hourly_rate == null ? null : Number(r.hourly_rate),
    shiftPreference: r.shift_preference ?? null,
    clenstvi: r.clenstvi === true,
    aktivniJinde: r.aktivni_team_id != null && Number(r.aktivni_team_id) !== teamId,
  };
}

/** Členové podniku. Výchozí bez tabletu; `sKioskem` ho přidá (jde jen přes zrcadlo). */
export async function clenovePodniku(teamId: number, volba: VolbaClenu = {}): Promise<ClenPodniku[]> {
  if (!teamId) return [];
  const role = [...ROLE_FILTR[volba.role ?? 'lide'], ...(volba.sKioskem ? ['kiosk'] : [])];
  const sSazbou = volba.sSazbou === true;
  const krome = volba.krome ?? -1;
  let rows: any[];
  try {
    rows = await sql`
      SELECT u.id, u.name, u.avatar, u.email, u.phone, u.shift_preference, u.team_id AS aktivni_team_id,
             COALESCE(m.role, u.role) AS role,
             COALESCE(m.job_title, u.job_title) AS job_title,
             CASE WHEN ${sSazbou} THEN (CASE WHEN m.user_id IS NOT NULL THEN m.hourly_rate ELSE u.hourly_rate END) ELSE NULL END AS hourly_rate,
             (m.user_id IS NOT NULL) AS clenstvi
      FROM users u
      LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${teamId}
      WHERE (m.user_id IS NOT NULL OR u.team_id = ${teamId})
        AND COALESCE(m.role, u.role) = ANY(${role})
        AND u.id <> ${krome}
      ORDER BY COALESCE(m.role, u.role) DESC, u.name ASC`;
  } catch {
    // Před migrací (team_members nebo hourly_rate ještě není): zrcadlo jako dřív.
    rows = await sql`
      SELECT u.id, u.name, u.avatar, u.email, u.phone, u.shift_preference, u.team_id AS aktivni_team_id,
             u.role, u.job_title, NULL AS hourly_rate, FALSE AS clenstvi
      FROM users u
      WHERE u.team_id = ${teamId} AND u.role = ANY(${role}) AND u.id <> ${krome}
      ORDER BY u.role DESC, u.name ASC`;
  }
  return rows.map(r => clenZRadku(r, teamId));
}

/** Jen id — pro notifyUsers a pro Set v cyklech. */
export async function idClenu(teamId: number, volba?: VolbaClenu): Promise<number[]> {
  return (await clenovePodniku(teamId, volba)).map(c => c.id);
}

/** Vedení podniku — příjemci oznámení. Nahrazuje kopie `SELECT id FROM users WHERE team_id AND role = 'employer'`. */
export async function vedeniPodniku(teamId: number, volba: { krome?: number } = {}): Promise<number[]> {
  return idClenu(teamId, { role: 'employer', krome: volba.krome });
}

/** Jeden člen podniku, nebo null. Tablet jen se `sKioskem`. Sazba je vždy z členství. */
export async function clenPodniku(userId: number, teamId: number, volba: { sKioskem?: boolean } = {}): Promise<ClenPodniku | null> {
  if (!userId || !teamId || !Number.isFinite(userId)) return null;
  const role = ['employer', 'employee', ...(volba.sKioskem ? ['kiosk'] : [])];
  let r: any;
  try {
    [r] = await sql`
      SELECT u.id, u.name, u.avatar, u.email, u.phone, u.shift_preference, u.team_id AS aktivni_team_id,
             COALESCE(m.role, u.role) AS role,
             COALESCE(m.job_title, u.job_title) AS job_title,
             (CASE WHEN m.user_id IS NOT NULL THEN m.hourly_rate ELSE u.hourly_rate END) AS hourly_rate,
             (m.user_id IS NOT NULL) AS clenstvi
      FROM users u
      LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${teamId}
      WHERE u.id = ${userId}
        AND (m.user_id IS NOT NULL OR u.team_id = ${teamId})
        AND COALESCE(m.role, u.role) = ANY(${role})`;
  } catch {
    [r] = await sql`
      SELECT u.id, u.name, u.avatar, u.email, u.phone, u.shift_preference, u.team_id AS aktivni_team_id,
             u.role, u.job_title, NULL AS hourly_rate, FALSE AS clenstvi
      FROM users u WHERE u.id = ${userId} AND u.team_id = ${teamId} AND u.role = ANY(${role})`;
  }
  return r ? clenZRadku(r, teamId) : null;
}

/** Je člověk v podniku? Členství nebo zrcadlo; tablet jen se `sKioskem`. */
export async function jeClenem(userId: number, teamId: number, volba?: { sKioskem?: boolean }): Promise<boolean> {
  return !!(await clenPodniku(userId, teamId, volba));
}

/** Sazba člena V TOMHLE podniku; 0 když není nastavená nebo člověk v podniku není. */
export async function sazbaVPodniku(userId: number, teamId: number): Promise<number> {
  return (await clenPodniku(userId, teamId))?.hourlyRate ?? 0;
}

/**
 * Počet lidí (bez tabletu) pro limit plánu Zdarma — členství nebo zrcadlo.
 * Počítá i členy právě přepnuté do jiného podniku: platí se za lidi, ne za
 * to, kde zrovna stojí.
 */
export async function pocetClenu(teamId: number): Promise<number> {
  try {
    const [r] = await sql`
      SELECT COUNT(DISTINCT u.id)::int AS n
      FROM users u LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${teamId}
      WHERE (m.user_id IS NOT NULL OR u.team_id = ${teamId}) AND COALESCE(m.role, u.role) <> 'kiosk'`;
    return Number(r?.n ?? 0);
  } catch {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM users WHERE team_id = ${teamId} AND role <> 'kiosk'`;
    return Number(r?.n ?? 0);
  }
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

/** Volající není vlastník podniku (ani jeho organizace) — další podnik zakládat nesmí. */
export class NeniVlastnikPodniku extends Error {
  constructor() { super('Další podnik zakládá vlastník podniku.'); }
}

/**
 * Další podnik — a tím organizaci NAD tím aktivním — smí založit jen
 * VLASTNÍK aktivního podniku; když už podnik organizaci má, jen její
 * vlastník. Role vedení nestačí: manažer povýšený přes Tým, nebo cizí
 * majitel pozvaný jako vedení, by si jinak založil organizaci nad podnikem,
 * který mu nepatří, stal se jejím vlastníkem, skutečnému majiteli zavřel
 * nastavení organizace a přes sdílené číselníky z jeho podniku četl.
 */
export async function smiZalozitDalsiPodnik(userId: number, teamId: number): Promise<boolean> {
  try {
    const [t] = await sql`SELECT owner_id FROM teams WHERE id = ${teamId}`;
    if (!t || Number(t.owner_id) !== userId) return false;
    const org = await organizaceTymu(teamId);
    return !org || org.ownerId === userId;
  } catch { return false; }
}

/**
 * Smí člověk dostat členství v tomhle podniku? Vedení vždy. Zaměstnanec jen
 * když organizace sdílení lidí má zapnuté — nebo když v žádném jejím jiném
 * podniku ještě není (první členství není sdílení). Bez organizace vždy.
 * Přepínač „Sdílení lidí" se dřív jen ukládal; tohle je místo, kde platí.
 */
export async function smiPridatClena(userId: number, teamId: number, role: RoleClenstvi): Promise<boolean> {
  const org = await organizaceTymu(teamId);
  if (!org || smiSdiletZamestnance(org.nastaveni, role)) return true;
  const jinde = (await clenstviUzivatele(userId)).some(c => c.organizationId === org.id && c.teamId !== teamId);
  return !jinde;
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
  // Routa se ptá dřív; tady ještě jednou, ať se tudy nikdy neprojde bez kontroly.
  if (!(await smiZalozitDalsiPodnik(ownerId, aktivniTeamId))) throw new NeniVlastnikPodniku();
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
    // Pozice a sazba jdou se členstvím: při přihlášení je zrcadlo tohohle
    // podniku (users.team_id = teamId), takže se vezmou odtud. Bez toho by
    // člověk, kterému vedení nastavilo sazbu před prvním přihlášením, měl
    // v členství NULL — a mzdu 0.
    await sql`
      INSERT INTO team_members (user_id, team_id, role, job_title, hourly_rate)
      SELECT id, ${teamId}, ${role}, job_title, hourly_rate FROM users WHERE id = ${userId}
      ON CONFLICT (user_id, team_id) DO NOTHING`;
  } catch { /* před migrací */ }
}
