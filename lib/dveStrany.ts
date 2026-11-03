// Jeden e-mail, dvě strany. Tatáž adresa smí mít jeden účet v provozu
// (podnik, zaměstnanec, kiosk) a jeden hostovský (Managero client): majitel
// kavárny je zároveň hostem jiných podniků. Pod kapotou jsou to dva řádky
// v `users` (unikát users_email_strana v app/api/init), pro člověka jeden
// účet: stejné heslo, přepínač stran a po přihlášení volba „Kam jdeš“.
//
// Pravidla, která drží heslo jedno:
// - druhý řádek, který si člověk zakládá sám, vzniká jen s heslem, které sedí
//   na ten první; hostovský řádek, který založil podnik (import, kartička u kasy),
//   si nechává své heslo — přepnout se na něj jde i tak, lístkem,
// - změna a obnova hesla se propíše do obou řádků a odhlásí oba,
// - kiosk a účet s heslem od vedoucího se nepárují vůbec (viz lzeParovat).
// Čisté funkce nahoře čtou testy; databázové dole.

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Strana = 'podnik' | 'host';

/** Cookie s poslední stranou, kterou si člověk vybral (volba „Kam jdeš“ se pak neptá). */
export const COOKIE_STRANA = 'mgr_strana';

/** Strana účtu podle role: host je jen `customer`, všechno ostatní je provoz. */
export function stranaRole(role: unknown): Strana {
  return role === 'customer' ? 'host' : 'podnik';
}

export function jeStrana(v: unknown): v is Strana {
  return v === 'podnik' || v === 'host';
}

export function opacnaStrana(s: Strana): Strana {
  return s === 'host' ? 'podnik' : 'host';
}

/** Kam strana vede po přihlášení. */
export function cestaStrany(s: Strana): string {
  return s === 'host' ? '/client' : '/';
}

/**
 * Pořadí kandidátů při přihlášení: když formulář řekl stranu, její účty jdou
 * první. Druhá strana zůstává jako záloha — kdo se omylem přihlásí do správy
 * jen s hostovským účtem, nepadne na „špatné heslo“, jen skončí u sebe.
 */
export function seradPodleStrany<T extends { role: unknown }>(kandidati: T[], strana: unknown): T[] {
  if (!jeStrana(strana)) return kandidati;
  return [...kandidati].sort((a, b) => Number(stranaRole(a.role) !== strana) - Number(stranaRole(b.role) !== strana));
}

// ---- Krátký lístek pro přepnutí strany ----
// Přepnutí nevyžaduje heslo znovu: server vydá lístek platný minutu, podepsaný
// NEXTAUTH_SECRET. Lístek nese id obou řádků, verzi relace zdrojového účtu
// (po změně hesla nebo odhlášení všude je mrtvý) a způsob přihlášení
// (heslem / kódem z e-mailu) — ten se dědí do nové relace, ať kód z e-mailu
// nikdy neotevře správu podniku. Provider `prepnout-stranu` (lib/auth.ts)
// navíc ověří, že ho uplatňuje relace zdrojového účtu.

const PLATNOST_LISTKU_S = 60;

/** Jak se člověk do relace dostal: heslem, nebo kódem z e-mailu (jen host). */
export type Metoda = 'heslo' | 'kod';

export function jeMetoda(v: unknown): v is Metoda {
  return v === 'heslo' || v === 'kod';
}

/**
 * Způsob přihlášení relace. Tokeny z doby před tímhle polem ho nemají: do správy
 * podniku se dalo dostat jen heslem, u hosta se počítá s kódem (opatrnější čtení).
 */
export function metodaRelace(metoda: unknown, role: unknown): Metoda {
  if (jeMetoda(metoda)) return metoda;
  return stranaRole(role) === 'podnik' ? 'heslo' : 'kod';
}

/** Správa podniku chce heslo. Relace z kódu z e-mailu na ni nepřepne. */
export function smiNaStranu(cil: Strana, metoda: unknown): boolean {
  return cil !== 'podnik' || metoda === 'heslo';
}

export const HLASKA_PODNIK_HESLEM = 'Do správy podniku se přihlas heslem.';

export interface Listek { zId: number; naId: number; sv: number; metoda: Metoda }

function podpis(data: string, tajemstvi: string): string {
  return createHmac('sha256', tajemstvi).update(`strana:${data}`).digest('base64url');
}

export function vydejListek(l: Listek, tajemstvi: string, ted = Date.now()): string {
  const data = `${l.zId}.${l.naId}.${Math.floor(ted / 1000) + PLATNOST_LISTKU_S}.${l.sv}.${l.metoda === 'kod' ? 'k' : 'h'}`;
  return `${data}.${podpis(data, tajemstvi)}`;
}

/** Ověří lístek; vrací jeho obsah, nebo null (padělek, vypršel, nesmysl). */
export function overListek(listek: unknown, tajemstvi: string, ted = Date.now()): Listek | null {
  if (typeof listek !== 'string' || listek.length > 200) return null;
  const casti = listek.split('.');
  if (casti.length !== 6) return null;
  const [z, na, exp, sv, m, sig] = casti;
  if (![z, na, exp, sv].every((c) => /^\d{1,12}$/.test(c)) || (m !== 'h' && m !== 'k')) return null;
  const ocekavany = Buffer.from(podpis(`${z}.${na}.${exp}.${sv}.${m}`, tajemstvi));
  const dodany = Buffer.from(sig);
  if (ocekavany.length !== dodany.length || !timingSafeEqual(ocekavany, dodany)) return null;
  if (Number(exp) * 1000 < ted) return null;
  if (z === na) return null;
  return { zId: Number(z), naId: Number(na), sv: Number(sv), metoda: m === 'k' ? 'kod' : 'heslo' };
}

// ---- Párování ----
// Dvojníci jsou jen dva řádky, o kterých je doložené, že je drží jeden člověk:
// mají stejný otisk hesla. Ten vznikne jen tak, že druhou stranu založil
// heslem té první (hesloProDruhouStranu), nebo obnovou hesla přes e-mail, která
// dokládá adresu a nastaví heslo oběma stranám (app/api/account/heslo/obnovit).
// Sama shoda adresy nestačí: podnik se registruje bez ověření e-mailu a hosta
// zakládá i podnik (karty, import).
// Heslo zaměstnance, které zadal vedoucí (/api/users), zná i on. Takový účet
// se nepáruje vůbec, dokud si heslo člověk neobnoví přes e-mail — ani změna
// v nastavení nestačí, mohl by ji udělat vedoucí jeho heslem.

/** Před migrací sloupce `heslo_od_spravce` se nepozná, kdo heslo zadal: páruje se jen host. */
export function hesloOdSpravcePredMigraci(role: unknown): boolean {
  return role !== 'customer';
}

/** Smí se účet párovat s druhou stranou? Kiosk ne (heslo zná celá směna), heslo od vedoucího ne. */
export function lzeParovat(u: { role: unknown; hesloOdSpravce: boolean }): boolean {
  return u.role !== 'kiosk' && !u.hesloOdSpravce;
}

type Radek = { id: number; role: unknown; hesloOdSpravce: boolean; passwordHash: string };

/** Dvojník účtu `userId` mezi účty téže adresy (oba smí párovat, stejný otisk hesla), nebo null. */
export function dvojnikZ<T extends Radek>(ucty: T[], userId: number): T | null {
  const ja = ucty.find((u) => u.id === userId);
  if (!ja || !lzeParovat(ja) || !ja.passwordHash) return null;
  const cil = opacnaStrana(stranaRole(ja.role));
  return ucty.find((u) => u.id !== userId && lzeParovat(u) && stranaRole(u.role) === cil && u.passwordHash === ja.passwordHash) ?? null;
}

/**
 * Účet téže adresy na druhé straně pro obnovu hesla přes e-mail: kdo doložil
 * adresu, drží obě strany (i dosud nespárované). Kiosk ne, ten je směny.
 */
export function protejsekZ<T extends Radek>(ucty: T[], userId: number): T | null {
  const ja = ucty.find((u) => u.id === userId);
  if (!ja || ja.role === 'kiosk') return null;
  const cil = opacnaStrana(stranaRole(ja.role));
  return ucty.find((u) => u.id !== userId && u.role !== 'kiosk' && stranaRole(u.role) === cil) ?? null;
}

/** Chybí sloupec (42703)? Jen to smí spadnout na náhradní dotaz, jiná chyba ne. */
export function chybiSloupec(e: unknown): boolean {
  return (e as any)?.code === '42703';
}

// ---- Databáze ----

export interface UcetStrany { id: number; name: string; email: string; role: string; passwordHash: string; hesloOdSpravce: boolean }

function radek(r: any): UcetStrany {
  const role = String(r.role);
  const hesloOdSpravce = r.heslo_od_spravce === undefined ? hesloOdSpravcePredMigraci(role) : r.heslo_od_spravce === true;
  return { id: Number(r.id), name: String(r.name), email: String(r.email), role, passwordHash: String(r.password_hash ?? ''), hesloOdSpravce };
}

/**
 * Živé účty s touto adresou (nejvýš jeden na stranu, starší první).
 * Smazané (anonymizované) se nepočítají. Před migrací chybí `heslo_od_spravce`
 * (pak se počítá opatrně podle role) nebo i `deleted_at`; jiná chyba databáze
 * se propaguje, ať se nic nepustí naslepo.
 */
export async function uctyEmailu(emailMale: string): Promise<UcetStrany[]> {
  const sql = neon(process.env.DATABASE_URL!);
  let rows: any[];
  try {
    rows = await sql`SELECT id, name, email, role, password_hash, heslo_od_spravce FROM users WHERE lower(email) = ${emailMale} AND deleted_at IS NULL ORDER BY id LIMIT 5` as any[];
  } catch (e) {
    if (!chybiSloupec(e)) throw e;
    try {
      rows = await sql`SELECT id, name, email, role, password_hash FROM users WHERE lower(email) = ${emailMale} AND deleted_at IS NULL ORDER BY id LIMIT 5` as any[];
    } catch (e2) {
      if (!chybiSloupec(e2)) throw e2;
      rows = await sql`SELECT id, name, email, role, password_hash FROM users WHERE lower(email) = ${emailMale} ORDER BY id LIMIT 5` as any[];
    }
  }
  return rows.map(radek);
}

/** Účet téže adresy na dané straně, se kterým se smí párovat (viz lzeParovat), nebo null. */
export async function ucetNaStrane(emailMale: string, strana: Strana): Promise<UcetStrany | null> {
  return (await uctyEmailu(emailMale)).find((u) => lzeParovat(u) && stranaRole(u.role) === strana) ?? null;
}

async function uctyAdresyUctu(userId: number): Promise<UcetStrany[]> {
  const sql = neon(process.env.DATABASE_URL!);
  const [ja] = await sql`SELECT email FROM users WHERE id = ${userId}` as any[];
  return ja?.email ? uctyEmailu(String(ja.email).toLowerCase()) : [];
}

/** Dvojník účtu na druhé straně (viz dvojnikZ), nebo null. */
export async function dvojnik(userId: number): Promise<UcetStrany | null> {
  return dvojnikZ(await uctyAdresyUctu(userId), userId);
}

/** Protějšek pro obnovu hesla přes e-mail (viz protejsekZ), nebo null. */
export async function protejsek(userId: number): Promise<UcetStrany | null> {
  return protejsekZ(await uctyAdresyUctu(userId), userId);
}

/**
 * Druhá strana, na kterou smí tahle relace přejít: dvojník, a do správy podniku
 * jen z relace přihlášené heslem. Jinak null (přepínač ani „Kam jdeš“ se neukáže).
 */
export async function druhaStranaRelace(userId: number, metoda: unknown): Promise<UcetStrany | null> {
  const d = await dvojnik(userId);
  return d && smiNaStranu(stranaRole(d.role), metoda) ? d : null;
}

/** Verze relace účtu (lib/authVerze) pro lístek; před migrací 0. */
export async function verzeRelaceUctu(userId: number): Promise<number> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const [r] = await sql`SELECT session_version FROM users WHERE id = ${userId}` as any[];
    const { verzeRelace } = await import('./authVerze');
    return verzeRelace(r?.session_version);
  } catch {
    return 0;
  }
}

/**
 * Zakládá se druhá strana k existujícímu účtu: heslo musí sedět na ten
 * existující. Vrací jeho otisk (nový řádek ho převezme, heslo zůstane jedno),
 * `null` když účet na druhé straně není, `false` když heslo nesedí.
 */
export async function hesloProDruhouStranu(emailMale: string, novaStrana: Strana, heslo: string): Promise<string | null | false> {
  const druhy = await ucetNaStrane(emailMale, opacnaStrana(novaStrana));
  if (!druhy) return null;
  if (!druhy.passwordHash || !(await bcrypt.compare(String(heslo ?? ''), druhy.passwordHash))) return false;
  return druhy.passwordHash;
}

/** Hláška, když druhá strana existuje a heslo nesedí (podnik vyká, Managero client tyká). */
export const HLASKA_JINE_HESLO = 'Tenhle e-mail už v Managero má účet. Použijte k němu stejné heslo, ať je účet jeden, nebo se přihlaste.';
export const HLASKA_JINE_HESLO_TY = 'Tenhle e-mail už v Managero má účet. Použij k němu stejné heslo, ať je účet jeden, nebo se přihlas.';

/**
 * Nové heslo účtům (účet a jeho dvojník / protějšek) jedním příkazem, takže
 * se nestane, že jedna strana má nové heslo a druhá staré. `zEmailu`: heslo
 * přišlo přes odkaz v e-mailu, zná ho jen majitel adresy, takže už není od
 * vedoucího (před migrací sloupec chybí a není co měnit). Odhlášení zařízení
 * (verze relace) dělá volající.
 */
export async function nastavHeslo(ids: number[], hash: string, zEmailu: boolean): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  if (!zEmailu) {
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ANY(${ids})`;
    return;
  }
  try {
    await sql`UPDATE users SET password_hash = ${hash}, heslo_od_spravce = false WHERE id = ANY(${ids})`;
  } catch (e) {
    if (!chybiSloupec(e)) throw e;
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ANY(${ids})`;
  }
}
