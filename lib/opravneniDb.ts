// Role a oprávnění (kolo 67) — databázová část. Logika (závislosti,
// pravidla proti eskalaci) je v lib/opravneni.ts.
//
// Oprávnění se NEukládají do tokenu: token žije 30 dní a změna role by se
// do něj propsala až po odhlášení. Počítají se na serveru z členství
// v AKTIVNÍM podniku (users.team_id z databáze, nikdy z těla požadavku)
// s krátkou cache v paměti instance.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { neon } from '@neondatabase/serverless';
import { authOptions } from './auth';
import {
  SYSTEMOVE_ROLE, VSECHNA, roleZTypu, systemovaRole, vycisti, sZavislostmi,
  type TypRole, type SystemovaRole,
} from './opravneni';
import { efektivniSystemova, jeUpravitelnaSystemova, poleOpravneni, type EfektivniRole, type UpravaRole } from './roleUpravy';

const sql = neon(process.env.DATABASE_URL!);

export interface RoleClena {
  userId: number;
  teamId: number;
  jeVlastnik: boolean;
  /** Klíč systémové role, nebo null u vlastní. */
  klic: string | null;
  /** Id vlastní role, nebo null u systémové. */
  roleId: number | null;
  nazev: string;
  typ: TypRole;
  opravneni: Set<string>;
}

const TTL_MS = 5_000;
const cache = new Map<string, { at: number; v: RoleClena | null }>();

/** Zahodí cache oprávnění — po změně role, jejích oprávnění nebo členství. */
export function zneplatniOpravneni(userId?: number, teamId?: number): void {
  if (userId == null) { cache.clear(); return; }
  if (teamId == null) { for (const k of [...cache.keys()]) if (k.startsWith(`${userId}:`)) cache.delete(k); return; }
  cache.delete(`${userId}:${teamId}`);
}

/**
 * Zahodí cache všech členů podniku — po úpravě přednastavené role (drží ji
 * kdokoli v podniku, včetně lidí, kterým se role odvozuje z typu účtu).
 */
export function zneplatniOpravneniPodniku(teamId: number): void {
  for (const k of [...cache.keys()]) if (k.endsWith(`:${teamId}`)) cache.delete(k);
}

/**
 * Role a oprávnění člena v podniku, nebo null, když členem není.
 * Vlastník podniku má vždy celý katalog, ať má v členství cokoli.
 * Při chybě databáze vyhodí (null znamená jen „opravdu není člen").
 */
export async function roleClena(userId: number, teamId: number, opts: { cerstve?: boolean } = {}): Promise<RoleClena | null> {
  if (!Number.isFinite(userId) || !Number.isFinite(teamId)) return null;
  const k = `${userId}:${teamId}`;
  const c = cache.get(k);
  if (!opts.cerstve && c && Date.now() - c.at < TTL_MS) return c.v;
  // Výjimka z nactiRoli projde dál a do cache se nic nezapíše: „nevím"
  // se nesmí na 5 s proměnit v „není člen".
  const v = await nactiRoli(userId, teamId);
  cache.set(k, { at: Date.now(), v });
  return v;
}

/**
 * Chyba „tabulka/sloupec neexistuje" (Postgres 42P01 / 42703) — databáze
 * ještě neprošla migrací kola 67. Jen ta smí spadnout na starší dotaz;
 * cokoli jiného (výpadek Neonu, timeout) je „nevím" a musí se propagovat,
 * jinak by přechodná chyba z člověka udělala nečlena nebo mu dala roli
 * podle typu účtu.
 */
const jePredMigraci = (e: unknown): boolean => {
  const kod = (e as { code?: unknown } | null)?.code;
  return kod === '42P01' || kod === '42703';
};

/**
 * Načte roli z databáze. Při chybě DB (mimo stav před migrací) VYHODÍ —
 * volající (roleClena) pak nic necachuje a brána vrátí 503, klient zůstane
 * v režimu „ukázat vše, rozhodne server".
 */
async function nactiRoli(userId: number, teamId: number): Promise<RoleClena | null> {
  let m: any = null;
  try {
    [m] = await sql`
      SELECT m.role, m.role_id, m.role_klic, r.nazev AS r_nazev, r.typ AS r_typ, r.opravneni AS r_opravneni
      FROM team_members m LEFT JOIN roles r ON r.id = m.role_id AND r.team_id = m.team_id
      WHERE m.user_id = ${userId} AND m.team_id = ${teamId}`;
  } catch (e) {
    if (!jePredMigraci(e)) throw e;
    // Před migrací kola 67 (roles, role_id ještě nejsou): role z typu účtu.
    try { [m] = await sql`SELECT role FROM team_members WHERE user_id = ${userId} AND team_id = ${teamId}`; }
    catch (e2) { if (!jePredMigraci(e2)) throw e2; m = null; }
  }
  // Zrcadlo users.role pro AKTIVNÍ podnik (users.team_id = teamId). Čte se,
  // jen když je potřeba: bez členství (viz níž), nebo když členství nemá
  // vybranou roli a typ se může rozcházet se zrcadlem.
  const bezVybraneRole = m != null && m.role_id == null && !m.role_klic;
  let u: any = null;
  if (!m || (bezVybraneRole && m.role !== 'employer')) {
    try { [u] = await sql`SELECT role FROM users WHERE id = ${userId} AND team_id = ${teamId}`; }
    catch (e) { if (!jePredMigraci(e)) throw e; u = null; }
  }
  // Členství NEBO zrcadlo (stejná definice jako clenovePodniku v lib/tenant):
  // tablet nemá řádek v team_members (zakládá se jen v users) a starší účty,
  // které se od zavedení členství nepřihlásily, taky ne. Host (customer)
  // se zrcadlem projít nesmí.
  if (!m && u && (u.role === 'kiosk' || u.role === 'employer' || u.role === 'employee')) m = { role: u.role };
  let t: any = null;
  try { [t] = await sql`SELECT owner_id, show_team_schedule FROM teams WHERE id = ${teamId}`; }
  catch (e) { if (!jePredMigraci(e)) throw e; t = null; }
  const jeVlastnik = t != null && Number(t.owner_id) === userId;
  if (!m && !jeVlastnik) return null;

  if (jeVlastnik) {
    return { userId, teamId, jeVlastnik, klic: 'vedeni', roleId: null, nazev: 'Vlastník', typ: 'vedeni', opravneni: new Set(VSECHNA) };
  }
  // Vlastní role — jen ta, která patří TOMUHLE podniku (JOIN výš hlídá team_id).
  if (m.role_id != null && m.r_nazev != null) {
    const raw = Array.isArray(m.r_opravneni) ? m.r_opravneni : (() => { try { return JSON.parse(m.r_opravneni); } catch { return []; } })();
    const typ: TypRole = m.r_typ === 'vedeni' || m.r_typ === 'kiosk' ? m.r_typ : 'zamestnanec';
    return { userId, teamId, jeVlastnik, klic: null, roleId: Number(m.role_id), nazev: String(m.r_nazev), typ, opravneni: new Set(sZavislostmi(vycisti(raw))) };
  }
  let sys: SystemovaRole;
  if (m.role_id != null) {
    // role_id ukazuje do prázdna (role smazaná souběžně s přiřazením, nebo
    // patří jinému podniku). Typ účtu (employer u role typu vedeni) tady
    // nerozhoduje — to by z omezené role udělalo plné Vedení. Bezpečné
    // minimum je Barista, tedy to, co dostane každý nový člen.
    sys = systemovaRole('barista')!;
  } else if (bezVybraneRole && m.role !== 'employer' && u?.role === 'employer') {
    // Nesoulad typu: v aktivním podniku člověk vystupuje jako vedení
    // (users.role = employer), jen členství zůstalo na starším typu. Dnes
    // má práva vedení, přechod na role mu je nesmí vzít (invariant).
    sys = roleZTypu('employer');
  } else {
    sys = systemovaRole(m.role_klic) ?? roleZTypu(m.role);
  }
  // Úprava přednastavené role podnikem (role_upravy). Vedení a Tablet se
  // nedotazují vůbec — upravit nejdou. Chyba databáze (mimo stav před
  // migrací) se propaguje jako výš: sada z kódu místo upravené by mohla
  // dát víc, než podnik roli nechal.
  if (jeUpravitelnaSystemova(sys.klic)) sys = efektivniSystemova(sys, await upravaRole(teamId, sys.klic));
  const opr = new Set(sys.opravneni);
  // Podnik, který zaměstnancům schoval rozvrh týmu (dřívější přepínač),
  // ho schovává dál — přepínač teď znamená „Barista bez náhledu rozvrhu".
  if (sys.klic === 'barista' && t?.show_team_schedule === false) opr.delete('rozvrh.nahled');
  return { userId, teamId, jeVlastnik, klic: sys.klic, roleId: null, nazev: sys.nazev, typ: sys.typ, opravneni: opr };
}

const naUpravu = (r: any): UpravaRole => ({
  klic: String(r.klic), opravneni: poleOpravneni(r.opravneni).filter((x): x is string => typeof x === 'string'),
  nazev: r.nazev ?? null, popis: r.popis ?? null, verze: Number(r.verze) || 1,
});

/**
 * Úprava jedné přednastavené role v podniku, nebo null. Před migrací
 * (tabulka role_upravy ještě není) null = platí kód. Jiná chyba VYHODÍ.
 */
export async function upravaRole(teamId: number, klic: string): Promise<UpravaRole | null> {
  try {
    const [r] = await sql`SELECT klic, opravneni, nazev, popis, verze FROM role_upravy WHERE team_id = ${teamId} AND klic = ${klic}`;
    return r ? naUpravu(r) : null;
  } catch (e) {
    if (jePredMigraci(e)) return null;
    throw e;
  }
}

/** Všechny přednastavené role, jak platí v podniku (s úpravami). Chyba DB mimo stav před migrací VYHODÍ. */
export async function systemoveRolePodniku(teamId: number): Promise<EfektivniRole[]> {
  let upravy = new Map<string, UpravaRole>();
  try {
    const rows = await sql`SELECT klic, opravneni, nazev, popis, verze FROM role_upravy WHERE team_id = ${teamId}` as any[];
    upravy = new Map(rows.map(r => [String(r.klic), naUpravu(r)]));
  } catch (e) {
    if (!jePredMigraci(e)) throw e;
  }
  return SYSTEMOVE_ROLE.map(r => efektivniSystemova(r, upravy.get(r.klic)));
}

/**
 * Přednastavená role podle klíče, jak platí v podniku — pro přidělení
 * člověku, výchozí roli a pozvánky. Kdo roli přiděluje, musí „pokrýt"
 * sadu, kterou člověk opravdu dostane, ne tu z kódu.
 */
export async function systemovaRolePodniku(teamId: number, klic: string | null | undefined): Promise<EfektivniRole | null> {
  const r = systemovaRole(klic);
  if (!r) return null;
  return efektivniSystemova(r, jeUpravitelnaSystemova(r.klic) ? await upravaRole(teamId, r.klic) : null);
}

export async function maOpravneni(userId: number, teamId: number, klic: string): Promise<boolean> {
  const r = await roleClena(userId, teamId);
  return !!r && r.opravneni.has(klic);
}

/** Členové podniku, kteří mají dané oprávnění — příjemci upozornění. */
export async function clenoveSOpravnenim(teamId: number, klic: string): Promise<number[]> {
  let ids: number[] = [];
  try {
    // Kandidáti jako dřív u vedeniPodniku: členství i zrcadlo (bez tabletu
    // a hostů — ti upozornění nedostávali).
    const rows = await sql`
      SELECT user_id FROM team_members WHERE team_id = ${teamId}
      UNION SELECT id AS user_id FROM users WHERE team_id = ${teamId} AND role IN ('employer', 'employee')` as any[];
    ids = rows.map(r => Number(r.user_id));
    const [t] = await sql`SELECT owner_id FROM teams WHERE id = ${teamId}`;
    if (t?.owner_id != null && !ids.includes(Number(t.owner_id))) ids.push(Number(t.owner_id));
  } catch { return []; }
  const out: number[] = [];
  for (const id of ids) {
    // Upozornění jsou doplněk — když se u někoho nepodaří ověřit roli,
    // nedostane ho (neposílá se naslepo), ale ostatní ano.
    try { if (await maOpravneni(id, teamId, klic)) out.push(id); } catch { /* přeskočit */ }
  }
  return out;
}

export interface Kontext { meId: number; teamId: number; role: RoleClena }

/**
 * Brána pro API routu: přihlášený člen AKTIVNÍHO podniku (z databáze) s
 * daným oprávněním. Vrátí kontext, nebo hotovou odpověď 401/403.
 * `klic` = null znamená „stačí být členem".
 */
export async function pozaduj(klic: string | string[] | null): Promise<Kontext | NextResponse> {
  const s = await getServerSession(authOptions);
  if (!s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((s.user as any).id);
  // Chyba databáze je 503 „zkus znovu", ne 403 — jinak by přechodný
  // výpadek vypadal jako odebraná práva.
  const nevim = () => NextResponse.json({ error: 'Oprávnění se teď nepodařilo ověřit. Zkus to za chvíli znovu.' }, { status: 503 });
  let teamId: number | null = null;
  try {
    const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
    teamId = u?.team_id != null ? Number(u.team_id) : null;
  } catch { return nevim(); }
  if (teamId == null) return NextResponse.json({ error: 'Nejsi v žádném podniku.' }, { status: 403 });
  let role: RoleClena | null;
  try { role = await roleClena(meId, teamId); } catch { return nevim(); }
  if (!role) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const klice = klic == null ? [] : Array.isArray(klic) ? klic : [klic];
  // Pole = stačí kterékoli z nich (např. uzávěrka: vlastní NEBO všechny).
  if (klice.length && !klice.some(k => role.opravneni.has(k))) {
    return NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });
  }
  return { meId, teamId, role };
}

export const jeOdpoved = (v: unknown): v is NextResponse => v instanceof NextResponse;

/** Vlastní role podniku. */
export interface VlastniRole { id: number; nazev: string; popis: string | null; typ: TypRole; opravneni: string[]; zdroj: string | null; verze: number }

export async function vlastniRole(teamId: number): Promise<VlastniRole[]> {
  try {
    const rows = await sql`SELECT id, nazev, popis, typ, opravneni, zdroj, verze FROM roles WHERE team_id = ${teamId} ORDER BY nazev, id` as any[];
    return rows.map(r => ({
      id: Number(r.id), nazev: String(r.nazev), popis: r.popis ?? null,
      typ: r.typ === 'vedeni' || r.typ === 'kiosk' ? r.typ : 'zamestnanec',
      opravneni: sZavislostmi(vycisti(Array.isArray(r.opravneni) ? r.opravneni : [])), zdroj: r.zdroj ?? null, verze: Number(r.verze) || 1,
    }));
  } catch { return []; }
}

/** Kolik členů má kterou roli — systémové podle klíče (i odvozené z typu), vlastní podle id. */
export async function pocetyRoli(teamId: number): Promise<{ system: Record<string, number>; vlastni: Record<number, number> }> {
  const system: Record<string, number> = {};
  const vlastni: Record<number, number> = {};
  try {
    const [t] = await sql`SELECT owner_id FROM teams WHERE id = ${teamId}`;
    const rows = await sql`SELECT user_id, role, role_id, role_klic FROM team_members WHERE team_id = ${teamId}` as any[];
    for (const r of rows) {
      if (t && Number(r.user_id) === Number(t.owner_id)) continue;
      if (r.role_id != null) vlastni[Number(r.role_id)] = (vlastni[Number(r.role_id)] ?? 0) + 1;
      else { const k = systemovaRole(r.role_klic)?.klic ?? roleZTypu(r.role).klic; system[k] = (system[k] ?? 0) + 1; }
    }
  } catch { /* před migrací */ }
  return { system, vlastni };
}

export { SYSTEMOVE_ROLE };
