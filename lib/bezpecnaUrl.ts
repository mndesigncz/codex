// Adresy, které vyplňuje uživatel a které se pak vykreslí jako odkaz nebo
// obrázek. React `href="javascript:…"` pustí (ve verzi 18 jen varuje ve
// vývoji) a CSP s 'unsafe-inline' ho nezastaví. Zaměstnanec tak mohl do
// „webu dodavatele" nebo přílohy v chatu vložit skript, který se spustil
// s relací vedoucího, když na odkaz klikl.

/** Web mimo aplikaci: jen http(s). „www.makro.cz" dostane https://. Jinak null. */
export function webovaUrl(v: unknown, max = 500): string | null {
  const s = String(v ?? '').trim().slice(0, max);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  // Holá doména bez schématu — běžné, když se adresa opisuje z letáku.
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(s)) return `https://${s}`;
  return null;
}

/** Soubor nahraný do aplikace (vlastní cesta /api/…) nebo https obrázek. Jinak null. */
export function souborUrl(v: unknown, max = 500): string | null {
  const s = String(v ?? '').trim().slice(0, max);
  if (!s) return null;
  if (s.startsWith('/') && !s.startsWith('//') && !s.includes('\\')) return s;
  if (/^https:\/\//i.test(s)) return s;
  return null;
}

/**
 * Kam poslat člověka po přihlášení (`?next=`). Jen cesta v téhle aplikaci:
 * začíná jedním lomítkem, ne dvěma (`//zly.cz` je cizí doména) ani
 * zpětným lomítkem. Jinak výchozí stránka. Dřív šlo po přihlášení hosta
 * přesměrovat kamkoli, i na `javascript:`.
 */
export function mistniCesta(v: unknown, vychozi: string): string {
  const s = String(v ?? '').trim();
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || /[\u0000-\u001f]/.test(s)) return vychozi;
  return s;
}
