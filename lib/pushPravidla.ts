// Které kategorie oznámení si člověk řídí a jak se vyhodnotí ztlumení.
// Čisté, bez importů (scripts/testy/k77-obal.ts), aby pravidlo neleželo v souboru,
// který tahá web-push a databázi.

// User-toggleable notification categories (Settings → Notifikace). Anything not
// in one of these categories is 'general' and always delivered.
//  * message, stock, shift — výchozí ZAPNUTO, člověk je může vypnout
//  * novinky — rozesílky a akce podniků hostům: výchozí VYPNUTO, chodí jen po
//    výslovném souhlasu (Apple 4.5.4, zákon 480/2004 o obchodních sděleních)
export type NotifCategory = 'message' | 'stock' | 'shift' | 'novinky' | 'general';

export const CATEGORY_PREF: Record<Exclude<NotifCategory, 'general'>, string> = {
  message: 'messages',
  stock: 'lowStock',
  shift: 'shifts',
  novinky: 'novinky',
};

/** Kategorie, které chodí jen s výslovným souhlasem (chybějící nastavení = NE). */
export const OPT_IN: ReadonlySet<NotifCategory> = new Set<NotifCategory>(['novinky']);

/** Je kategorie pro člověka s těmito preferencemi ztlumená? Chybějící preference ⇒ vše zapnuté, kromě opt-in. */
export function jeZtlumeno(prefs: Record<string, unknown> | null | undefined, category?: NotifCategory): boolean {
  if (!category || category === 'general') return false;
  const v = (prefs ?? {})[CATEGORY_PREF[category]];
  return OPT_IN.has(category) ? v !== true : v === false;
}
