// Idempotency-Key u kasy: čistá část (bez databáze).
//
// Čtečka u kasy posílá s každou akcí (razítko, účtenka, body, kredit) klíč.
// Když síť vypadne po odeslání a obsluha klepne znovu, přijde stejný klíč a
// server nepřipíše nic podruhé — vrátí původní odpověď. Klíč smí obsahovat
// jen písmena, číslice a _ - : . (8 až 80 znaků); cokoli jiného se ignoruje
// a akce proběhne bez ochrany (jako dřív).

export const MIN_KLIC = 8;
export const MAX_KLIC = 80;

export function ocistiKlic(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (s.length < MIN_KLIC || s.length > MAX_KLIC) return null;
  return /^[A-Za-z0-9_:.-]+$/.test(s) ? s : null;
}

/** Nový klíč v prohlížeči (crypto.randomUUID, jinak náhrada z času a náhody). */
export function novyKlic(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
