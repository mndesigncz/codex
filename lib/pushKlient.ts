// Může tenhle prohlížeč a tahle instalace vůbec posílat push notifikace?
//
// Bez VAPID klíčů (NEXT_PUBLIC_VAPID_PUBLIC_KEY při buildu, VAPID_PRIVATE_KEY
// na serveru) je push potichu vypnutý: PushManager se hned vrátí a lib/push
// nic neodešle. Nastavení přitom dál nabízelo přepínač „Push notifikace“,
// který nic nezmohl. Proto se o dostupnosti rozhoduje tady a UI nabídku
// zapnutí ukáže jen tam, kde by opravdu fungovala.

/** Veřejný klíč je zapečený do buildu; bez něj se push nikdy nezaregistruje. */
export const PUSH_NAKONFIGUROVAN = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

export type StavPush = 'ok' | 'nenakonfigurovano' | 'nepodporovano';

/** Čistá funkce kvůli testu; `podporuje` je výsledek zjištění v prohlížeči. */
export function stavPush(nakonfigurovan: boolean, podporuje: boolean): StavPush {
  if (!nakonfigurovan) return 'nenakonfigurovano';
  return podporuje ? 'ok' : 'nepodporovano';
}

/** Zná prohlížeč service worker, push a notifikace? (iPhone jen u aplikace přidané na plochu.) */
export function prohlizecUmiPush(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
