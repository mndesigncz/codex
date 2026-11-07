// Relace správy platformy: podepsaná cookie, nezávislá na NextAuth.
//
// Správa (admin.managero.app, lib/spravaHost.ts) má vlastní přihlášení:
// heslo účtu Managero → kód z autentizační aplikace (lib/totp.ts). Mezi
// oběma kroky drží stav krátká cookie „krok" (5 minut, jen „heslo sedělo"),
// po kódu vznikne cookie relace na 12 hodin. Obě jsou
//
//   v1.<id účtu>.<vydáno, unix s>.<HMAC-SHA256>
//
// s klíčem odvozeným z APP_SECRET_KEY (jinak NEXTAUTH_SECRET) a s účelem
// v podepsaném textu, takže cookie „krok" nikdy neprojde jako relace.
// Prefix `__Host-` prohlížeči říká: jen Secure, bez Domain, cesta `/` — cookie
// se tak nepošle na www ani jinou subdoménu a nikdo ji tam nepodstrčí.
//
// Cookie sama o sobě nestačí: brána (lib/superadminGate.ts) a layout správy
// pokaždé znovu ověří podle databáze, že účet správcem pořád je.
//
// Čisté (jen node:crypto), testy ve scripts/testy/sprava-relace.ts.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_RELACE = '__Host-mgr-sprava';
export const COOKIE_KROK = '__Host-mgr-sprava-krok';
export const PLATNOST_RELACE_S = 12 * 60 * 60;
export const PLATNOST_KROKU_S = 5 * 60;

export type Ucel = 'relace' | 'krok';
const PLATNOST: Record<Ucel, number> = { relace: PLATNOST_RELACE_S, krok: PLATNOST_KROKU_S };

/** Tajemství pro podpis. Bez něj se správa nepřihlásí vůbec (zavřené dveře, ne otevřené). */
export function tajemstviSpravy(env: { APP_SECRET_KEY?: string; NEXTAUTH_SECRET?: string } = process.env): string | null {
  const raw = env.APP_SECRET_KEY || env.NEXTAUTH_SECRET;
  return raw && raw.length >= 16 ? raw : null;
}

function podpis(ucel: Ucel, telo: string, tajemstvi: string): string {
  // Oddělení domén: stejné tajemství podepisuje i jiné věci (NextAuth, lístky stran).
  return createHmac('sha256', `managero-sprava:${tajemstvi}`).update(`${ucel}|${telo}`).digest('base64url');
}

/** Vydá hodnotu cookie pro účet. */
export function vydej(ucel: Ucel, userId: number, tajemstvi: string, casMs = Date.now()): string {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('Neplatné id účtu.');
  const telo = `v1.${userId}.${Math.floor(casMs / 1000)}`;
  return `${telo}.${podpis(ucel, telo, tajemstvi)}`;
}

/** Ověří hodnotu cookie: id účtu, nebo null (špatný podpis, jiný účel, vypršelá, z budoucnosti). */
export function over(ucel: Ucel, hodnota: string | null | undefined, tajemstvi: string | null, casMs = Date.now()): number | null {
  if (!tajemstvi || !hodnota || hodnota.length > 200) return null;
  const m = /^(v1\.(\d{1,12})\.(\d{1,12}))\.([A-Za-z0-9_-]{43})$/.exec(hodnota);
  if (!m) return null;
  const cekany = Buffer.from(podpis(ucel, m[1], tajemstvi));
  const dany = Buffer.from(m[4]);
  if (cekany.length !== dany.length || !timingSafeEqual(cekany, dany)) return null;
  const id = Number(m[2]);
  const vydano = Number(m[3]);
  const ted = Math.floor(casMs / 1000);
  // Minuta tolerance na rozjeté hodiny mezi instancemi; víc z budoucnosti je podvrh.
  if (vydano > ted + 60) return null;
  if (ted - vydano > PLATNOST[ucel]) return null;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Hlavička Set-Cookie. `null` hodnota cookie smaže. */
export function setCookie(jmeno: string, hodnota: string | null, maxAgeS: number): string {
  const casti = [`${jmeno}=${hodnota ?? ''}`, 'Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict', `Max-Age=${hodnota === null ? 0 : maxAgeS}`];
  return casti.join('; ');
}

/** Hodnota cookie z hlavičky `Cookie`. */
export function cookieZHlavicky(hlavicka: string | null | undefined, jmeno: string): string | null {
  for (const cast of String(hlavicka ?? '').split(';')) {
    const i = cast.indexOf('=');
    if (i < 0) continue;
    if (cast.slice(0, i).trim() === jmeno) return cast.slice(i + 1).trim() || null;
  }
  return null;
}
