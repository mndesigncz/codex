// Ochrana proti CSRF: požadavek, který něco mění, musí přijít z naší stránky.
//
// První vrstvou je cookie relace se `SameSite=Lax` (výchozí v NextAuth):
// prohlížeč ji k POSTu z cizí stránky nepřiloží. Tohle je druhá vrstva pro
// případy, kdy první nestačí — starší prohlížeče, cizí subdoména pod stejnou
// doménou, nebo budoucí změna nastavení cookies.
//
// Pravidlo: když prohlížeč pošle hlavičku `Origin` (u POST/PUT/PATCH/DELETE
// ji posílá vždy, i v rámci stejné domény) a ta neodpovídá hostiteli, na
// kterého požadavek míří, zamítne se. Bez hlavičky `Origin` jde požadavek
// dál: tak volají servery — webhook Stripe, pokladna Storyous, cron, MCP —
// a ty se prokazují vlastním podpisem nebo tajemstvím, ne cookie.

const MENI = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function ciziPuvod(metoda: string, origin: string | null, host: string | null): boolean {
  if (!MENI.has(metoda.toUpperCase())) return false;
  if (!origin) return false;
  // `Origin: null` posílá sandboxovaný rám nebo stránka ze souboru — nikdy naše stránka.
  if (origin === 'null') return true;
  if (!host) return true;
  try {
    return new URL(origin).host.toLowerCase() !== host.toLowerCase();
  } catch {
    return true;
  }
}
