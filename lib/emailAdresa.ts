// E-mail jako klíč účtu (adresa; odesílání pošty je v email.ts): jedno místo, kde se rozhoduje, co je „stejný e-mail".
//
// Proč: mobilní klávesnice při registraci napíše „Jan@firma.cz" a o týden
// později se člověk přihlašuje jako „jan@firma.cz". Databázový unikát je
// case-sensitive, takže se účet nenašel a šel založit i druhý se stejnou
// adresou. Od teď se každý e-mail před uložením i hledáním ořízne a zmenší
// (normalizujEmail) a hledá se přes `lower(email)`. Čisté funkce bez importů,
// aby je četly i testy a middleware.

/** Oříznutý a zmenšený e-mail — tvar, ve kterém se ukládá a porovnává. */
export function normalizujEmail(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/** Hrubá kontrola tvaru (něco@něco.něco); skutečnou adresu ověří až doručení. */
export function vypadaJakoEmail(v: string): boolean {
  return v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

/** Řádek z databáze, o kterém se rozhoduje při přihlášení. */
export interface KandidatUctu {
  id: number;
  email: string;
}

/**
 * Pořadí, v jakém se zkouší účty, které se shodují jen bez ohledu na velikost
 * písmen. Historicky mohly vzniknout dva účty „Jan@x" a „jan@x". Kdo se
 * přihlašuje přesně tak, jak se kdysi registroval, dostane svůj účet první
 * (nic se mu nezmění); ostatní ve stálém pořadí podle id. Heslo se ověřuje
 * u každého kandidáta zvlášť, takže cizí účet se tím neotevře — a nikdy se
 * nezkouší víc než `max` kandidátů, ať kolize nezdrží bcrypt.
 */
export function poradiKandidatu<T extends KandidatUctu>(zadany: unknown, kandidati: T[], max = 3): T[] {
  const surovy = String(zadany ?? '').trim();
  return [...kandidati]
    .sort((a, b) => {
      const pa = a.email === surovy ? 0 : 1;
      const pb = b.email === surovy ? 0 : 1;
      return pa - pb || a.id - b.id;
    })
    .slice(0, max);
}

/**
 * Prostý text z HTML e-mailu. Schránky (a spamové filtry) čekají u každé zprávy i textovou
 * část; e-mail jen s HTML bez ní se hodnotí hůř a v čtečkách bez HTML je prázdný.
 * Odkazy zůstanou jako „popisek (adresa)“, ať se dá odkaz opsat i bez tlačítka.
 */
export function htmlNaText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, url: string, label: string) => {
      const popisek = label.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      const adresa = url.replace(/&amp;/g, '&');
      return popisek && popisek !== adresa ? `${popisek}: ${adresa}` : adresa;
    })
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/tr|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim();
}
