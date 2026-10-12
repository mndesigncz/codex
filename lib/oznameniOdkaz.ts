// Otevření oznámení — jedna logika pro zvonek i Centrum oznámení v Nastavení (kolo 6, balík B3).
//
// Zvonek oznámení proklikával (označit přečtené a jít na `link`), Centrum oznámení
// v Nastavení je jen vypsalo: řádek „Uzávěrka čeká na schválení" nikam nevedl a člověk
// hledal uzávěrku sám. Teď obě místa volají otevriOznameni.
//
// Navigace jde přes `window.location`, ne přes navigaci layoutu: Nastavení běží i v okně
// Managero client (vOkne), kde navigace vedení není, a odkaz v oznámení je celá adresa
// (`/employer/overview?view=reports`, `/client/…`), kterou umí otevřít jen prohlížeč.
// Čistý modul (fetch a přechod jdou podstrčit), testy: scripts/testy/k81-nastaveni.ts.

export interface OznameniKOtevreni {
  id: number;
  link?: string | null;
  is_read?: boolean;
  type?: string;
}

/** Ikona podle druhu oznámení (notifications.type). Neznámý druh = zvonek. */
export const IKONA_OZNAMENI: Record<string, string> = {
  chat: 'chat', inventory: 'box', shift: 'calendar', invite: 'users', info: 'bell',
  warning: 'warning', success: 'check', task: 'clipboard', billing: 'award',
};
export const ikonaOznameni = (typ: string | null | undefined): string => (typ && IKONA_OZNAMENI[typ]) || 'bell';

/** Druh z adresy (`?type=`) jen ve tvaru, jaký aplikace zapisuje; cokoli jiného = bez filtru. */
export function cistyDruhOznameni(v: unknown): string | null {
  return typeof v === 'string' && /^[a-z_]{1,32}$/.test(v) ? v : null;
}

/** Strop jedné dávky Centra oznámení (GET /api/notifications?limit=). */
export const LIMIT_OZNAMENI = { vychozi: 30, max: 100 } as const;
export function cistyLimitOznameni(v: unknown): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n < 1) return LIMIT_OZNAMENI.vychozi;
  return Math.min(LIMIT_OZNAMENI.max, Math.floor(n));
}

/** Kam oznámení vede: adresa uvnitř aplikace, jinak null (bez odkazu a „/" = nikam). */
export function cilOznameni(n: OznameniKOtevreni): string | null {
  const l = typeof n.link === 'string' ? n.link.trim() : '';
  if (!l || l === '/') return null;
  // Cesta v aplikaci, nebo celá adresa http(s) (tak to zvonek otevíral vždycky). `javascript:`
  // a `//cizi.cz` (adresa bez schématu, která vypadá jako cesta) se neotevírají.
  if (l.startsWith('/') && !l.startsWith('//')) return l;
  if (/^https?:\/\//i.test(l)) return l;
  return null;
}

/**
 * Otevře oznámení: nepřečtené označí jako přečtené (PATCH /api/notifications { id }),
 * po úspěchu zavolá `markRead` (místní stav), a když má odkaz, přejde na něj.
 * Na odkaz se jde i po nepovedeném zápisu — kvůli přečtení nemá smysl člověka zdržovat;
 * přečteno se pak ukáže, až to server opravdu zapíše (příští načtení).
 * Vrací, jestli server přečtení potvrdil (u už přečteného true bez dotazu).
 */
export async function otevriOznameni<T extends OznameniKOtevreni>(
  n: T,
  markRead: (n: T) => void,
  o: { fetch?: typeof fetch; jdi?: (url: string) => void } = {},
): Promise<boolean> {
  let oznaceno = !!n.is_read;
  if (!n.is_read) {
    try {
      const res = await (o.fetch ?? fetch)('/api/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }),
      });
      if (res.ok) { markRead(n); oznaceno = true; }
    } catch { /* bez sítě — přečtení srovná příští načtení */ }
  }
  const cil = cilOznameni(n);
  if (cil) (o.jdi ?? ((url: string) => { window.location.href = url; }))(cil);
  return oznaceno;
}
