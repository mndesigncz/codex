// Most mezi webem a nativním obalem (Capacitor) — čisté pomocné funkce bez React.
//
// Web NIKDY neimportuje `@capacitor/*`: build na Vercelu by je táhl i do
// prohlížeče. Nativní pluginy jsou v obalu dostupné přes `window.Capacitor.Plugins`
// (obal načítá živý web, Capacitor do něj vloží most), a tenhle modul na ně jen
// sahá, když tam jsou. Bez obalu všechny funkce vrátí `null`/`false` a web se chová
// jako dřív.
//
// Značka obalu je `ManageroApp/` (provoz) a `ManageroClient/` (hosté) v User-Agentu,
// přidaná přes `appendUserAgent` v apps/*/capacitor.config.ts. Značce se nedá věřit
// k autorizaci (kdokoli si ji pošle), tady slouží jen k tomu, aby se nativní kód
// vůbec načetl.

export type KlicObalu = 'managero' | 'client';

export interface ObalZUa { obal: KlicObalu | null; verze: string | null; build: number | null }

/** Zrcadlí lib/obal.ts (serverová brána); po sloučení obou větví je možné sjednotit. */
export function zjistiObalUa(ua: string | null | undefined): ObalZUa {
  const s = String(ua ?? '');
  const m = /Managero(App|Client)\/([\d.]+)(?: \(build (\d+)\))?/.exec(s);
  if (!m) return { obal: null, verze: null, build: null };
  return { obal: m[1] === 'App' ? 'managero' : 'client', verze: m[2], build: m[3] ? Number(m[3]) : null };
}

/** Jak se aplikace jmenuje na serveru v tabulce zařízení (`device_tokens.app`, viz plan-app-host.md 4.3). */
export function aplikaceVServeru(obal: KlicObalu): 'provoz' | 'klient' {
  return obal === 'managero' ? 'provoz' : 'klient';
}

// Hostitelé, jejichž odkazy obal otevře sám. Apex jen přesměrovává na www, ale vytištěné
// QR kódy ho mohou obsahovat, takže ho čteme (a navigujeme už na stejný původ stránky).
const HOSTITELE = new Set(['www.managero.app', 'managero.app']);
// Schémata, která obal registruje jako záložní (apps/apps.json: urlSchema).
const SCHEMATA = new Set(['managero:', 'manageroclient:']);

function jenMistniCesta(s: string): string | null {
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || /[\u0000-\u001f]/.test(s)) return null;
  return s;
}

/**
 * Odkaz z `appUrlOpen` (universal link, App Link, vlastní schéma) na cestu uvnitř
 * aplikace. Cizí hostitel → null (ignorovat). Vrací cestu + query + hash.
 */
export function cestaZOdkazu(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && HOSTITELE.has(u.hostname)) return jenMistniCesta(u.pathname + u.search + u.hash);
    if (SCHEMATA.has(u.protocol)) {
      // managero://employer/x → host = 'employer', path = '/x'
      const c = `/${u.hostname}${u.pathname === '/' ? '' : u.pathname}`;
      return jenMistniCesta(c + u.search + u.hash);
    }
  } catch { /* není URL */ }
  return null;
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,60}$/i;

/**
 * Obsah naskenovaného QR na cestu v Managero client: celá adresa podniku nebo stolu
 * (`https://www.managero.app/client/<slug>?tab=order&table=3&t=…`) nebo holý kód
 * podniku (slug). Cokoli jiného → null (cizí QR se neotevírá).
 */
export function cestaZQr(text: string | null | undefined): string | null {
  const t = String(text ?? '').trim();
  if (!t || t.length > 600) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    const c = cestaZOdkazu(t);
    return c && (c === '/client' || c.startsWith('/client/') || c.startsWith('/client?')) ? c : null;
  }
  return SLUG.test(t) ? `/client/${t.toLowerCase()}` : null;
}

/** Kód karty hosta (osm znaků A–Z, 0–9) z QR; jinak null. Stejné pravidlo jako webová kamera v CardScan. */
export function kodKarty(text: string | null | undefined): string | null {
  const c = String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{8}$/.test(c) ? c : null;
}

/** Je stránka jen pro veřejný kiosk (sdílený tablet)? Tam se nenastavuje push ani zámek. */
export function jeKioskCesta(pathname: string | null | undefined): boolean {
  return /^\/kiosk(\/|$)/.test(String(pathname ?? ''));
}

// ---------------------------------------------------------------------------------------------
// Přístup k pluginům (jen v prohlížeči, jen v obalu).
// ---------------------------------------------------------------------------------------------

interface CapacitorOkno {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: Record<string, any>;
  };
}
const okno = (): CapacitorOkno | null => (typeof window === 'undefined' ? null : (window as unknown as CapacitorOkno));

export const jeNativni = (): boolean => !!okno()?.Capacitor?.isNativePlatform?.();
export const platforma = (): 'ios' | 'android' | 'web' => {
  const p = okno()?.Capacitor?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : 'web';
};
/** Nativní plugin podle jména (`PushNotifications`, `Share`…), nebo null. */
export function plugin<T = any>(jmeno: string): T | null {
  const p = okno()?.Capacitor?.Plugins?.[jmeno];
  return p ?? null;
}

/** Bezpečný zápis do localStorage: v soukromém okně a při blokaci úložiště může hodit výjimku. */
export function uloz(klic: string, hodnota: string | null): void {
  try {
    if (hodnota == null) localStorage.removeItem(klic); else localStorage.setItem(klic, hodnota);
  } catch { /* bez úložiště to jede dál */ }
}
export function nacti(klic: string): string | null {
  try { return localStorage.getItem(klic); } catch { return null; }
}
