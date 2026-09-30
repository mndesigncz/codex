// Most k nativnímu obalu (Capacitor) z webu. Jen klient; na serveru a v běžném
// prohlížeči se nic neděje a funkce vrací „nedostupné“.
//
// Web se NIKDY nespoléhá na to, že je binárka nová: každá funkce nejdřív ověří,
// že plugin existuje (`window.Capacitor.Plugins.<Plugin>`), jinak spadne na webové
// chování nebo vrátí `nedostupny`. @capacitor/* se do webového balíku neimportuje
// (plugin je vstříknutý nativní vrstvou). Jestli je `window.Capacitor.Plugins`
// při `server.url` naplněné bez bundlování @capacitor/core, je třeba ověřit na
// zařízení (apps/README).

export type StavPovoleni = 'granted' | 'denied' | 'prompt' | 'nedostupny';

interface CapacitorOkno {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, any>;
}

function cap(): CapacitorOkno | null {
  if (typeof window === 'undefined') return null;
  const c = (window as unknown as { Capacitor?: CapacitorOkno }).Capacitor;
  return c ?? null;
}

/** Běží aplikace v nativním obalu (Capacitor)? */
export function jeNativni(): boolean {
  try { return !!cap()?.isNativePlatform?.(); } catch { return false; }
}

export function platforma(): 'ios' | 'android' | null {
  try {
    const p = cap()?.getPlatform?.();
    return p === 'ios' || p === 'android' ? p : null;
  } catch { return null; }
}

export function plugin<T = any>(jmeno: string): T | null {
  try { return (cap()?.Plugins?.[jmeno] as T) ?? null; } catch { return null; }
}

const KLIC_TOKENU = 'managero-native-push-token';
const cteni = (): string | null => { try { return localStorage.getItem(KLIC_TOKENU); } catch { return null; } };
const zapis = (t: string | null) => { try { if (t) localStorage.setItem(KLIC_TOKENU, t); else localStorage.removeItem(KLIC_TOKENU); } catch { /* soukromé okno */ } };

export async function stavNativnihoPushe(): Promise<StavPovoleni> {
  const p = plugin('PushNotifications');
  if (!jeNativni() || !p) return 'nedostupny';
  try {
    const r = await p.checkPermissions();
    const s = String(r?.receive ?? 'prompt');
    return s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt';
  } catch { return 'nedostupny'; }
}

async function odesliToken(token: string): Promise<boolean> {
  try {
    const r = await fetch('/api/native/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: platforma() ?? 'ios', env: 'production' }),
    });
    if (r.ok) zapis(token);
    return r.ok;
  } catch { return false; }
}

let posluchaceHotovo = false;

/**
 * Zapne nativní push: v případě potřeby se zeptá na povolení (systémový dialog),
 * zaregistruje zařízení a pošle token na server. Volat až v kontextu (přepínač
 * v Nastavení, souhlas hosta), ne hned po startu.
 */
export async function zapniNativniPush(zeptatSe = true): Promise<StavPovoleni | 'chyba'> {
  const p = plugin('PushNotifications');
  if (!jeNativni() || !p) return 'nedostupny';
  try {
    let stav = await stavNativnihoPushe();
    if (stav === 'prompt' && zeptatSe) {
      const r = await p.requestPermissions();
      stav = String(r?.receive) === 'granted' ? 'granted' : 'denied';
    }
    if (stav !== 'granted') return stav;
    if (!posluchaceHotovo) {
      posluchaceHotovo = true;
      p.addListener('registration', (t: { value?: string }) => { if (t?.value) void odesliToken(t.value); });
      p.addListener('registrationError', () => { /* bez tokenu push nechodí; uživateli se nic nehlásí hlasitě */ });
    }
    await p.register();
    return 'granted';
  } catch { return 'chyba'; }
}

/** Odhlásí token tohoto zařízení na serveru (před odhlášením uživatele, dokud je relace platná). */
export async function vypniNativniPush(): Promise<void> {
  const t = cteni();
  if (!t) return;
  try {
    await fetch('/api/native/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) });
  } catch { /* offline: token zůstane, přepíše ho další přihlášení na zařízení */ }
  zapis(null);
}

/**
 * Cesta z odkazu, který obal otevřel (universal link / klepnutí na oznámení):
 * jen naše doména a jen místní cesta, cokoli jiného se ignoruje.
 */
export function mistniCestaZOdkazu(odkaz: unknown, povolenyHost = 'www.managero.app'): string | null {
  if (typeof odkaz !== 'string' || !odkaz) return null;
  if (odkaz.startsWith('/') && !odkaz.startsWith('//')) return odkaz;
  try {
    const u = new URL(odkaz);
    if (u.protocol !== 'https:' || u.host.toLowerCase() !== povolenyHost) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch { return null; }
}
