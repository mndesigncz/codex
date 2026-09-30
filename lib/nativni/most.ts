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

import { obalZUserAgent, type Obal, type RozpoznanyObal } from '../obal.ts';

export type KlicObalu = Exclude<Obal, null>;
export type ObalZUa = RozpoznanyObal;

/**
 * Značka obalu z User-Agentu. Jediná implementace je v lib/obal.ts (server ji používá
 * pro bránu tras), klient ji jen přebírá, aby se UI a brána nikdy neshodly.
 */
export const zjistiObalUa: (ua: string | null | undefined) => ObalZUa = obalZUserAgent;

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

// ---------------------------------------------------------------------------------------------
// Veřejné API mostu. Listenery pluginů, token zařízení a volbu „push vypnut“ vlastní výhradně
// components/NativeBridge (vystaví je jako `window.manageroNative`); ostatní kód volá tohle.
// ---------------------------------------------------------------------------------------------

export type StavPovoleni = 'granted' | 'denied' | 'prompt' | 'nedostupny';
export type VysledekPushe = StavPovoleni | 'chyba';

export interface NativniApi {
  obal: KlicObalu;
  /** Otevře nativní skener, vrátí obsah QR, nebo null (zrušeno / nejde). */
  skenujQr: () => Promise<string | null>;
  /** Naskenuje QR podniku, stolu nebo kód podniku a otevře ho v aplikaci. Vrací false, když QR není náš. */
  skenujAOtevri: () => Promise<boolean>;
  sdilej: (d: { title?: string; text?: string; url?: string }) => Promise<boolean>;
  haptika: (druh?: 'lehka' | 'stredni' | 'uspech' | 'chyba') => void;
  /** Zapne push: povolení (systémový dialog), registrace tokenu, zrušení volby „vypnuto“. Volat z kontextu. */
  zapniPush: () => Promise<VysledekPushe>;
  /** Vypne push: smaže token tohoto zařízení na serveru a zabrání automatické registraci. */
  vypniPush: () => Promise<void>;
  /** Uživatel push vypnul (automatická registrace je potlačená). */
  pushVypnuto: () => boolean;
  /** Před odhlášením: smaže token na serveru (dokud je relace platná). Volbu „vypnuto“ nemění. */
  odhlasitPush: () => Promise<void>;
  zamek: { dostupny: () => Promise<boolean>; zapnuto: () => Promise<boolean>; nastav: (zap: boolean) => Promise<boolean> };
}
declare global { interface Window { manageroNative?: NativniApi } }

/** Stav systémového povolení k upozorněním (jen čte plugin, nic neregistruje). */
export async function stavNativnihoPushe(): Promise<StavPovoleni> {
  const p = plugin('PushNotifications');
  if (!jeNativni() || !p) return 'nedostupny';
  try {
    const r = await p.checkPermissions();
    const s = String(r?.receive ?? 'prompt');
    return s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt';
  } catch { return 'nedostupny'; }
}

/**
 * Počká, až NativeBridge (načítá se líně po startu) vystaví `window.manageroNative`.
 * Mimo obal nebo po vypršení času vrací null a volající spadne na webové chování.
 */
export function nativniMost(cekatMs = 4000): Promise<NativniApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.manageroNative) return Promise.resolve(window.manageroNative);
  if (!jeNativni() && !zjistiObalUa(navigator.userAgent).obal) return Promise.resolve(null);
  return new Promise(resolve => {
    const hotovo = (v: NativniApi | null) => { clearTimeout(t); window.removeEventListener('managero:nativni-pripraveno', naUdalost); resolve(v); };
    const naUdalost = () => hotovo(window.manageroNative ?? null);
    const t = setTimeout(() => hotovo(window.manageroNative ?? null), cekatMs);
    window.addEventListener('managero:nativni-pripraveno', naUdalost);
  });
}
