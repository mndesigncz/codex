// Verze podmínek užívání a zásad ochrany osobních údajů (spuštění, balík P).
//
// Souhlas se dřív ukládal jen u hosta a jen jako čas (users.terms_accepted_at) —
// a server ho dal každému, i když klient žádný souhlas neposlal. U podniku a
// zaměstnance se neukládalo nic. Teď:
//  * registrace podniku, připojení zaměstnance (kód i pozvánka) a registrace hosta
//    chtějí výslovné zaškrtnutí (`terms: true`, host navíc `vek15: true`); bez něj
//    server účet nezaloží;
//  * k účtu se uloží verze podmínek a zásad a čas (users.terms_version,
//    users.privacy_version, users.terms_accepted_at);
//  * když se verze tady zvýší, brána components/pravni/NovaVerze.tsx ukáže
//    přihlášenému okno se souhlasem (POST /api/account/souhlas).
//
// Verze je datum „RRRR-MM-DD" — porovnává se jako text. Při věcné změně textu v
// lib/pravni/texty.ts zvyš verzi (a datum AKTUALIZACE tam).
//
// Čistý modul bez databáze (testy: scripts/testy/k88-pravni-souhlas.ts).

export const VERZE_PODMINEK = '2026-10-14';
export const VERZE_ZASAD = '2026-10-14';

/** Nejmladší věk hosta, který si smí sám založit účet (souhlas se zpracováním v ČR od 15 let). */
export const MIN_VEK_HOSTA = 15;

const jeVerze = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Uložený souhlas je aktuální: obě verze jsou aspoň ty dnešní. Chybějící = neaktuální. */
export function souhlasAktualni(r: { terms_version?: unknown; privacy_version?: unknown } | null | undefined): boolean {
  if (!r) return false;
  return jeVerze(r.terms_version) && r.terms_version >= VERZE_PODMINEK && jeVerze(r.privacy_version) && r.privacy_version >= VERZE_ZASAD;
}

/**
 * Má brána člověku ukázat okno se souhlasem? Sdílený tablet (účet typu kiosk) ne:
 * za podnik souhlas nedává, a kdo u tabletu zrovna stojí, není majitel účtu.
 */
export function potrebujeSouhlas(role: unknown, r: { terms_version?: unknown; privacy_version?: unknown } | null | undefined): boolean {
  if (role === 'kiosk') return false;
  return !souhlasAktualni(r);
}

/** Zaškrtnutí z těla požadavku: jen výslovné `true`, ne „cokoli truthy". */
export const souhlasZTela = (b: unknown): boolean => (b as { terms?: unknown } | null)?.terms === true;

/** Host navíc potvrzuje věk (výslovné `true`). */
export const vekZTela = (b: unknown): boolean => (b as { vek15?: unknown } | null)?.vek15 === true;

/** Hláška serveru, když souhlas chybí (překládá se jako ostatní hlášky přihlášení). */
export const HLASKA_BEZ_SOUHLASU = 'Bez souhlasu s podmínkami účet založit nejde.';
export const HLASKA_BEZ_VEKU = 'Účet hosta si můžeš založit od 15 let.';

/** Kam vedou odkazy na podmínky a zásady: česky české stránky, ostatní jazyky anglické. */
export function odkazyPravni(jazyk: string): { podminky: string; soukromi: string } {
  const p = jazyk === 'cs' ? '' : '/en';
  return { podminky: `${p}/podminky`, soukromi: `${p}/soukromi` };
}

/** Klíč v sessionStorage: v tomhle prohlížeči a relaci je souhlas ověřený (brána se znovu neptá serveru). */
export const klicOvereniSouhlasu = (userId: string | number): string => `managero-souhlas:${userId}:${VERZE_PODMINEK}:${VERZE_ZASAD}`;

/** Cesty, kde brána nového souhlasu běží: aplikace po přihlášení, ne veřejné a právní stránky. */
export function cestaSBranou(cesta: string | null | undefined): boolean {
  if (!cesta) return false;
  return /^\/(employer|employee|client|admin)(\/|$)/.test(cesta)
    && !/^\/client\/(login|register|zapomenute-heslo|nove-heslo|odhlasit)(\/|$)/.test(cesta);
}
