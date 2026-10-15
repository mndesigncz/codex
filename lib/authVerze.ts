// Verze relace (spuštění, balík S): změna nebo obnovení hesla odhlásí ostatní
// zařízení. `users.session_version` (výchozí 0 pro všechny) se při změně hesla
// zvýší; token si verzi nese od přihlášení a callback jwt v lib/auth.ts ho
// porovná se stavem z databáze (táž pětivteřinová mezipaměť jako role a tým,
// žádný dotaz navíc). Token z doby před zavedením verzi nemá = 0, takže nasazení
// nikoho neodhlásí. Výpadek databáze nic nerozhoduje: token zůstane, jaký byl
// (bez databáze stejně žádná routa nic nevrátí), a nikoho nezamkne.
//
// Čistá logika bez závislostí, ať jde otestovat bez Next a NextAuth.

/** Verze z tokenu nebo databáze; chybějící, záporná nebo nesmyslná = 0. */
export function verzeRelace(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Je relace odvolaná? Jen když databáze zná VYŠŠÍ verzi, než nese token.
 * Neznámá verze z databáze (null = sloupec chybí, výpadek) relaci nikdy neodvolá.
 */
export function relaceOdvolana(verzeTokenu: unknown, verzeDb: unknown): boolean {
  if (verzeDb == null) return false;
  return verzeRelace(verzeDb) > verzeRelace(verzeTokenu);
}

/** Chyba z callbacku jwt: NextAuth po ní smaže cookie relace a getServerSession vrátí null. */
export const RELACE_ODVOLANA = 'RELACE_ODVOLANA';
