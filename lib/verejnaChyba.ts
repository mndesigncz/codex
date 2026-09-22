// Co z výjimky smí do prohlížeče.
//
// Naše knihovny vyhazují srozumitelné české hlášky („Položka nenalezena",
// „Na výrobu chybí mléko") a ty má člověk vidět. Do stejného `catch` ale
// padá i chyba Postgresu („column … does not exist", názvy tabulek a
// omezení), Stripe nebo obyčejný TypeError — a ta ven nemá: prozrazuje
// schéma a nic neřekne. Pravidlo: chyba databáze (má SQLSTATE `code`),
// chyba Stripe (`type` Stripe…) a vestavěné chyby JavaScriptu se nahradí
// obecnou hláškou; podrobnost jde do logu serveru.

const VESTAVENE = new Set(['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'NeonDbError', 'PostgresError', 'FetchError', 'AbortError']);

export function jeInterniChyba(e: unknown): boolean {
  if (!e || typeof e !== 'object') return true;
  const x = e as { name?: unknown; code?: unknown; type?: unknown; severity?: unknown };
  if (typeof x.code === 'string' && /^[0-9A-Z]{5}$/.test(x.code)) return true;   // SQLSTATE
  if (typeof x.severity === 'string') return true;                                // hláška Postgresu
  if (typeof x.type === 'string' && /^Stripe/.test(x.type)) return true;
  if (typeof x.name === 'string' && VESTAVENE.has(x.name)) return true;
  return false;
}

export function verejnaHlaska(e: unknown, vychozi: string, kde?: string): string {
  if (kde) console.error(kde, e);
  if (jeInterniChyba(e)) return vychozi;
  const m = String((e as { message?: unknown })?.message ?? '').trim();
  return m ? m.slice(0, 200) : vychozi;
}
