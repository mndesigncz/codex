// Mock server ukázky: window.fetch interceptor pro VŠECHNO /api/*.
//
// Proč interceptor v prohlížeči a ne testovací server: ukázka má běžet na
// veřejné prodejní stránce i v nahrávce obrazovky bez jakékoli databáze a
// hlavně bez rizika, že by návštěvník něco zapsal skutečnému podniku. Skutečná
// aplikace (EmployerLayout, EmployeeLayout, KioskApp) volá `fetch('/api/…')`
// jako vždy; tady se ta volání zachytí dřív, než opustí prohlížeč, a odpoví
// se z paměti (lib/demo/stav.ts). Nic z toho, co ukázka udělá, nejde na síť.
//
// Pravidla:
//  - `/api/*` (i /api/auth/session, /api/teams/mine, /api/rozlozeni…) → vždy z paměti;
//  - neznámý endpoint: GET vrátí prázdný tvar, zápis `{ ok: true }`, a přidá se
//    do `window.__demoNezname` (sonda tak pozná, že scéna volá něco, co ukázka nezná);
//  - jiný původ než náš → odmítnuto (ukázka nemá nikam volat);
//  - ostatní vlastní adresy (chunky, statické soubory, RSC) projdou beze změny.

import { vytvorStav, type DemoStav } from './stav';
import type { RoleDema } from './sceny';
import type { Kontext, Obsluha, Odpoved, Pozadavek, HlaseniAkce } from './typy';
import { zaklad } from './routy/zaklad';
import { lide } from './routy/lide';
import { rozvrh } from './routy/rozvrh';
import { ukoly } from './routy/ukoly';
import { uzaverky } from './routy/uzaverky';
import { sklad } from './routy/sklad';
import { komunikace } from './routy/komunikace';
import { ostatni } from './routy/ostatni';
import { prazdne } from './routy/prazdne';

declare global {
  interface Window {
    __demoReset?: () => void;
    __demoNezname?: string[];
    __demoStav?: () => DemoStav;
    __demoNainstalovano?: boolean;
  }
}

// Pořadí je důležité: konkrétní handlery před obecným zbytkem.
const OBSLUHY: Obsluha[] = [zaklad, lide, rozvrh, ukoly, uzaverky, sklad, komunikace, ostatni];

let stav: DemoStav | null = null;
let hlasitel: HlaseniAkce = () => {};
let puvodniFetch: typeof fetch | null = null;
let bezici = 0;

/** Kolik požadavků mock právě vyřizuje (DemoRoot podle toho pozná, že se ukázka usadila). */
export const pocetBezicich = () => bezici;

/** Kdo poslouchá události ukázky (DemoRoot je přeposílá rodiči). */
export function nastavHlasitele(f: HlaseniAkce): void { hlasitel = f; }

/** Aktuální stav ukázky (jen ke čtení mimo mock; zápisy dělají handlery). */
export function stavDema(): DemoStav {
  if (!stav) stav = vytvorStav('vedeni');
  return stav;
}

/** Nový stav ukázky (reset). Roli si zachová. */
export function resetujDemo(role?: RoleDema): void {
  stav = vytvorStav(role ?? stav?.role ?? 'vedeni');
}

/** Přepne, za koho je ukázka přihlášená (session, oprávnění, rozložení). */
export function nastavRoli(role: RoleDema): void {
  stavDema().role = role;
}

function zapisNezname(p: Pozadavek): void {
  const zaznam = `${p.metoda} ${p.cesta}`;
  const seznam = (window.__demoNezname ??= []);
  if (!seznam.includes(zaznam)) seznam.push(zaznam);
  // Jen ve vývoji: v produkci by hláška v konzoli nikoho nezajímala.
  if (process.env.NODE_ENV !== 'production') console.info('[demo] neznámý endpoint', zaznam);
}

/** Odpověď pro endpoint, který ukázka nezná: GET prázdný tvar, zápis ok. */
function zaklady(p: Pozadavek): Odpoved {
  zapisNezname(p);
  return p.metoda === 'GET' ? { telo: prazdne(p) } : { telo: { ok: true } };
}

export function obsluz(p: Pozadavek): Odpoved {
  const k: Kontext = { stav: stavDema(), hlas: (a, d) => hlasitel(a, d) };
  for (const o of OBSLUHY) {
    const r = o(p, k);
    if (r) return r;
  }
  return zaklady(p);
}

async function precistTelo(input: RequestInfo | URL, init?: RequestInit): Promise<any> {
  let raw: unknown = init?.body ?? null;
  if (raw == null && typeof Request !== 'undefined' && input instanceof Request) {
    try { raw = await input.clone().text(); } catch { raw = null; }
  }
  if (raw == null) return null;
  if (typeof raw === 'string') {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }
  // FormData (nahrání souboru) a ostatní: obsah ukázka nepotřebuje.
  return {};
}

const jeJson = (o: Odpoved) => new Response(JSON.stringify(o.telo ?? null), {
  status: o.status ?? 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// Lehké zpoždění, ať se ukazuje stav načítání a ukázka nepůsobí jako obrázek.
// Zápisy jsou pomalejší (pošlou se, uloží se); generování rozvrhu si řekne samo.
const ZPOZDENI_CTENI = 60;
const ZPOZDENI_ZAPISU = 140;
const pockej = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Nainstaluje interceptor. Volá se na úrovni modulu klientské komponenty,
 * tedy PŘED prvním vykreslením ukázky (kořenový SessionProvider si sáhne
 * na /api/auth/session až v efektu po připojení). Bezpečné volat opakovaně.
 */
export function instalujDemoApi(): void {
  if (typeof window === 'undefined' || window.__demoNainstalovano) return;
  window.__demoNainstalovano = true;
  window.__demoNezname = [];
  puvodniFetch = window.fetch.bind(window);
  stavDema();

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: URL;
    try {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      url = new URL(raw, window.location.href);
    } catch {
      return puvodniFetch!(input, init);
    }
    if (url.origin !== window.location.origin) {
      // Ukázka nevolá nikam ven; volající dostane síťovou chybu jako při výpadku.
      return Promise.reject(new TypeError('Ukázka nemá přístup k síti.'));
    }
    if (!url.pathname.startsWith('/api/')) return puvodniFetch!(input, init);

    const metoda = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const p: Pozadavek = { metoda, url, cesta: url.pathname.replace(/\/+$/, '') || '/', q: url.searchParams, telo: await precistTelo(input, init) };
    bezici++;
    try {
      const o = obsluz(p);
      await pockej(o.zpozdeni ?? (metoda === 'GET' ? ZPOZDENI_CTENI : ZPOZDENI_ZAPISU));
      return jeJson(o);
    } finally {
      bezici--;
    }
  };

  // sendBeacon (next-auth loguje chyby přes něj) by šel na skutečnou adresu.
  try {
    const puvodniBeacon = navigator.sendBeacon?.bind(navigator);
    navigator.sendBeacon = (adresa: string | URL, data?: BodyInit | null) => {
      try {
        const u = new URL(String(adresa), window.location.href);
        if (u.origin !== window.location.origin || u.pathname.startsWith('/api/')) return true;
      } catch { return true; }
      return puvodniBeacon ? puvodniBeacon(adresa, data) : true;
    };
  } catch { /* prostředí bez sendBeacon */ }

  // Service worker v ukázce nikdy: kdyby ho něco přece jen zaregistrovalo,
  // cachoval by ukázku pod původem skutečné aplikace.
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register = () => Promise.reject(new Error('Ukázka nepoužívá service worker.'));
    }
  } catch { /* nelze přepsat — provider ho v ukázce stejně nemontuje */ }

  window.__demoReset = () => { resetujDemo(); };
  window.__demoStav = () => stavDema();
}
