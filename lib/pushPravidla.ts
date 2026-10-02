// Které kategorie oznámení si člověk řídí a jak se vyhodnotí ztlumení.
// Čisté, bez importů (scripts/testy/k77-obal.ts), aby pravidlo neleželo v souboru,
// který tahá web-push a databázi.

// User-toggleable notification categories (Settings → Notifikace). Anything not
// in one of these categories is 'general' and always delivered.
//  * message, stock, shift — výchozí ZAPNUTO, člověk je může vypnout
//  * novinky — rozesílky a akce podniků hostům: výchozí VYPNUTO, chodí jen po
//    výslovném souhlasu (Apple 4.5.4, zákon 480/2004 o obchodních sděleních)
//  * task, closing, booking, timeoff — (kolo 73) úkoly, uzávěrky, rezervace a objednávky,
//    volno; výchozí ZAPNUTO. Dřív chodily jako 'general' (vždy), kromě volna, které bylo
//    pod 'shift': proto volno bez vlastního nastavení dědí nastavení směn (DEDI), ať
//    kdo si směny ztlumil, nezačne dostávat volno.
export type NotifCategory = 'message' | 'stock' | 'shift' | 'task' | 'closing' | 'booking' | 'timeoff' | 'novinky' | 'general';

export const CATEGORY_PREF: Record<Exclude<NotifCategory, 'general'>, string> = {
  message: 'messages',
  stock: 'lowStock',
  shift: 'shifts',
  task: 'ukoly',
  closing: 'uzaverky',
  booking: 'rezervace',
  timeoff: 'volno',
  novinky: 'novinky',
};

/** Kategorie bez vlastního nastavení přebírá nastavení jiné (klíč preference). */
const DEDI: Partial<Record<NotifCategory, string>> = { timeoff: 'shifts' };

/** Kategorie, které chodí jen s výslovným souhlasem (chybějící nastavení = NE). */
export const OPT_IN: ReadonlySet<NotifCategory> = new Set<NotifCategory>(['novinky']);

/** Je kategorie pro člověka s těmito preferencemi ztlumená? Chybějící preference ⇒ vše zapnuté, kromě opt-in. */
export function jeZtlumeno(prefs: Record<string, unknown> | null | undefined, category?: NotifCategory): boolean {
  if (!category || category === 'general') return false;
  const p = prefs ?? {};
  let v = p[CATEGORY_PREF[category]];
  if (typeof v !== 'boolean' && DEDI[category]) v = p[DEDI[category]!];
  return OPT_IN.has(category) ? v !== true : v === false;
}

/** „HH:MM" → minuty od půlnoci; null pro cokoli jiného. */
export function minutyZHM(v: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/**
 * Tiché hodiny (`prefs.ticho = { zap, od, do }`): je teď (pražské „HH:MM") v zakázaném okně?
 * Okno může přes půlnoc (22:00–07:00). Shodné „od" a „do" nebo nečitelná hodnota = tiché hodiny nejsou.
 * Tiché hodiny tlumí jen PUSH; oznámení samo zůstane v centru oznámení (viz lib/push.ts).
 */
export function jeVTichychHodinach(prefs: Record<string, unknown> | null | undefined, ted: string): boolean {
  const t = (prefs ?? {}).ticho as { zap?: unknown; od?: unknown; do?: unknown } | undefined;
  if (!t || t.zap !== true) return false;
  const od = minutyZHM(t.od); const doo = minutyZHM(t.do); const n = minutyZHM(ted);
  if (od === null || doo === null || n === null || od === doo) return false;
  return od < doo ? n >= od && n < doo : n >= od || n < doo;
}

/**
 * Text nativního pushe pro oznámení o předplatném a platbě: bez ceny, bez odkazu
 * a bez výzvy k zaplacení (Apple 3.1.1, Google Play Billing). Podstatu oznámení
 * vedení najde na webu; aplikace jen řekne, že něco vyžaduje pozornost.
 */
export function neutralniProNativni<T extends { title: string; body?: string; link?: string; tag?: string }>(
  payload: T,
  typ?: string,
): T {
  if (typ !== 'billing') return payload;
  return { ...payload, title: 'Upozornění k účtu podniku', body: 'Vedení podniku ho může vyřídit mimo aplikaci.', link: undefined };
}
