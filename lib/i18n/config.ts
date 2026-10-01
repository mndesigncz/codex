// Jazyky aplikace: jedno místo, které zná seznam, výchozí jazyk a pořadí náhrad.
//
// Čtyři vrstvy (plán §2.3) se nesmí míchat: jazyk uživatele (users.lang,
// cookie), jazyk podniku (teams.default_lang), jazyk hosta (?lang, localStorage)
// a formátovací locale (peníze/čísla). Tenhle soubor drží jen to, co mají
// společné: seznam kódů a mapování na locale.
//
// Čistý modul bez Reactu a bez importu z Next: běží i v `npm test`
// (relativní importy s příponou, žádný alias `@/`).

export const JAZYKY = ['cs', 'en', 'de', 'sk', 'pl'] as const;
export type Jazyk = (typeof JAZYKY)[number];

/** Čeština je zdroj: česká věta je klíč, takže pro ni není žádný slovník. */
export const VYCHOZI: Jazyk = 'cs';

/** Cookie s jazykem uživatele. Není HttpOnly: klient ji čte, aby <html lang> seděl bez čekání. */
export const COOKIE_JAZYKA = 'managero-lang';
/** Jazyk hosta na hostovských stránkách (nemá účet, tak jen localStorage). */
export const KLIC_JAZYKA_HOSTA = 'managero-host-lang';

/**
 * Řetěz náhrad při chybějícím překladu. Poslední článek je vždycky česká
 * věta samotná (klíč), proto v seznamu není. Slovenština padá rovnou na
 * češtinu (rozumí se), ostatní přes angličtinu: Němec i Polák si poradí
 * s anglickou větou líp než s českou.
 */
export const FALLBACK: Record<Jazyk, Jazyk[]> = {
  cs: [],
  sk: [],
  en: [],
  de: ['en'],
  pl: ['en'],
};

/** Jazyk a jeho náhrady v pořadí, v jakém se hledá překlad: `de` → `['de', 'en']`. */
export function retezJazyku(jazyk: Jazyk): Jazyk[] {
  return [jazyk, ...FALLBACK[jazyk]];
}

/** Endonymy: v přepínači se nikdy nepřekládají, ať se člověk v cizím jazyce vrátí. */
export const JAZYK_NAZEV: Record<Jazyk, string> = {
  cs: 'Čeština',
  en: 'English',
  de: 'Deutsch',
  sk: 'Slovenčina',
  pl: 'Polski',
};

/** Dvoupísmenná zkratka do pilulky („CS"). */
export const JAZYK_KOD: Record<Jazyk, string> = { cs: 'CS', en: 'EN', de: 'DE', sk: 'SK', pl: 'PL' };

/** Locale pro Intl (datum, názvy dnů a měsíců). Peníze řídí teams.locale, ne tohle. */
export const LOCALE_PRO_JAZYK: Record<Jazyk, string> = {
  cs: 'cs-CZ',
  en: 'en-GB',
  de: 'de-DE',
  sk: 'sk-SK',
  pl: 'pl-PL',
};

/** Stripe zná přesně naši pětici; všechno ostatní nechá na `auto`. */
export const STRIPE_LOCALE: Record<Jazyk, string> = { cs: 'cs', en: 'en', de: 'de', sk: 'sk', pl: 'pl' };

export function jeJazyk(v: unknown): v is Jazyk {
  return typeof v === 'string' && (JAZYKY as readonly string[]).includes(v);
}

export function stripeLocale(jazyk: unknown): string {
  return jeJazyk(jazyk) ? STRIPE_LOCALE[jazyk] : 'auto';
}

/** Cokoli z cookie, URL nebo databáze → platný jazyk, jinak undefined. Nikdy nevyhazuje. */
export function cistyJazyk(v: unknown): Jazyk | undefined {
  if (typeof v !== 'string') return undefined;
  const k = v.trim().toLowerCase().slice(0, 2);
  return jeJazyk(k) ? k : undefined;
}

/**
 * Jazyk z hlavičky Accept-Language ∩ podporované (podle váhy q a pořadí).
 * `cs-CZ,cs;q=0.9,en;q=0.8` → cs; `de-AT` → de; `fr` → undefined.
 */
export function jazykZAccept(hlavicka: string | null | undefined, povolene: readonly Jazyk[] = JAZYKY): Jazyk | undefined {
  if (!hlavicka) return undefined;
  const radky = hlavicka.split(',').map((cast, i) => {
    const [kod, ...par] = cast.trim().split(';');
    const q = par.map(p => p.trim()).find(p => p.startsWith('q='));
    const vaha = q ? Number(q.slice(2)) : 1;
    return { kod: kod.trim().toLowerCase().slice(0, 2), vaha: Number.isFinite(vaha) ? vaha : 0, i };
  }).filter(r => r.vaha > 0).sort((a, b) => b.vaha - a.vaha || a.i - b.i);
  for (const r of radky) {
    const j = cistyJazyk(r.kod);
    if (j && povolene.includes(j)) return j;
  }
  return undefined;
}

/**
 * Jazyky, jejichž překlad napsal model a nečetl ho rodilý mluvčí. Přepínač
 * u nich ukáže poznámku „zatím strojový" (plán §3, `_meta.json`).
 */
export const STROJOVY_PREKLAD: readonly Jazyk[] = ['en', 'de', 'sk', 'pl'];

/**
 * Jazyk podle země návštěvníka (dvoupísmenný kód ISO, na Vercelu z hlavičky
 * `x-vercel-ip-country`). Platí jen pro toho, kdo si jazyk ještě nezvolil:
 * volba v přepínači (cookie) má vždy přednost. Česko, Slovensko a Polsko mají
 * vlastní jazyk, německy mluvící země němčinu, zbytek světa angličtinu.
 * Bez známé země (lokální vývoj, sondy) undefined, a tedy čeština.
 */
export function jazykZeZeme(zeme: string | null | undefined): Jazyk | undefined {
  const z = (zeme ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(z) || z === 'XX' || z === 'T1') return undefined;
  if (z === 'CZ') return 'cs';
  if (z === 'SK') return 'sk';
  if (z === 'PL') return 'pl';
  if (z === 'DE' || z === 'AT' || z === 'CH' || z === 'LI' || z === 'LU') return 'de';
  return 'en';
}
