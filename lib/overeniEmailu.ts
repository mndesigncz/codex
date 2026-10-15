// Ověření e-mailu vedení při registraci podniku (spuštění, balík S).
//
// Nic se neblokuje: neověřený e-mail znamená jen banner „Potvrď e-mail"
// a prázdné `users.email_verified_at`. Co s neověřenými (omezit pozvánky,
// platby…) rozhodne Martin později; data na to už budou.
// Bez RESEND_API_KEY se ověření nenabízí vůbec — e-mail by neodešel a banner
// by prosil o něco, co nejde splnit.
//
// Čistá logika bez databáze (testy k90-bezpecnost-email.ts).

/** Odkaz platí 48 hodin. */
export const OVERENI_PLATNOST_MIN = 48 * 60;
/** Kolikrát za hodinu jde poslat odkaz znovu. */
export const OVERENI_ZNOVU_ZA_HODINU = 3;

export function nabizetOvereni(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.RESEND_API_KEY ?? '').trim();
}

export function cestaOvereniEmailu(token: string): string {
  return `/overit-email?token=${encodeURIComponent(token)}`;
}

export type StavOvereni = 'overeno' | 'ceka' | 'nenabizi' | 'nezahajeno';

/**
 * Co ukázat: `ceka` = banner s „Poslat znovu" (účet dostal odkaz a ještě ho
 * nepotvrdil), `nezahajeno` = jen nabídka v Nastavení (účty z doby před
 * ověřováním — banner by je zaskočil), `overeno` a `nenabizi` = nic.
 */
export function stavOvereni(r: { overenoAt: unknown; zahajeno: boolean; nabizi: boolean }): StavOvereni {
  if (r.overenoAt) return 'overeno';
  if (!r.nabizi) return 'nenabizi';
  return r.zahajeno ? 'ceka' : 'nezahajeno';
}

/** Sedí token k účtu i dnes? E-mail účtu se mezitím nesměl změnit. */
export function tokenSediKUctu(tokenEmail: unknown, uctovyEmail: unknown): boolean {
  const a = String(tokenEmail ?? '').trim().toLowerCase();
  return !!a && a === String(uctovyEmail ?? '').trim().toLowerCase();
}
