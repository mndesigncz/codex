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
import { dnes } from './cas';
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
import { finance } from './routy/finance';
import { klient } from './routy/klient';
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
const OBSLUHY: Obsluha[] = [zaklad, lide, rozvrh, ukoly, uzaverky, sklad, komunikace, ostatni, finance, klient];

let stav: DemoStav | null = null;
let hlasitel: HlaseniAkce = () => {};
let bezici = 0;

/** Kolik požadavků mock právě vyřizuje (DemoRoot podle toho pozná, že se ukázka usadila). */
export const pocetBezicich = () => bezici;

/** Kdo poslouchá události ukázky (DemoRoot je přeposílá rodiči). */
export function nastavHlasitele(f: HlaseniAkce): void { hlasitel = f; }

// Přenos stavu mezi rolemi. Přepnutí role je čisté načtení stránky (jiná
// relace, oprávnění, rozložení), takže nový modul by začal od výchozích dat a
// příběh „zaměstnanec odešle uzávěrku, vedení ji vidí a schválí" by se
// rozpadl. Stav se proto těsně před načtením uloží do `window.name` (přežije
// načtení téhož okna, žádné úložiště aplikace se nesahá) a nový modul si ho
// JEDNOU převezme a hned smaže. Reset ukázky ho nikdy nepřenáší.
const PREFIX_PRENOSU = 'managero-demo-stav:';

const naJson = (s: DemoStav) => JSON.stringify(s, (_k, v) => (v instanceof Set ? { __set: Array.from(v) } : v));
const zJsonu = (t: string): DemoStav => JSON.parse(t, (_k, v) => (v && typeof v === 'object' && Array.isArray(v.__set) ? new Set(v.__set) : v));

function prevezmiPrenesenyStav(): DemoStav | null {
  if (typeof window === 'undefined' || !window.name.startsWith(PREFIX_PRENOSU)) return null;
  const text = window.name.slice(PREFIX_PRENOSU.length);
  window.name = '';
  try {
    const r = zJsonu(text) as DemoStav;
    // Jiný den (okno nechané přes půlnoc): dny ve stavu by neseděly, začít znovu.
    return r && Array.isArray(r.smeny) && r.dnes === dnes() ? r : null;
  } catch { return null; }
}

/** Aktuální stav ukázky (jen ke čtení mimo mock; zápisy dělají handlery). */
export function stavDema(): DemoStav {
  if (!stav) stav = prevezmiPrenesenyStav() ?? vytvorStav('vedeni');
  return stav;
}

/** Nový stav ukázky (reset). Roli si zachová; případný přenesený stav zahodí. */
export function resetujDemo(role?: RoleDema): void {
  if (typeof window !== 'undefined' && window.name.startsWith(PREFIX_PRENOSU)) window.name = '';
  stav = vytvorStav(role ?? stav?.role ?? 'vedeni');
}

/** Uloží stav pro následující načtení stránky (přepnutí role); převezme ho nový modul. */
export function ulozStavProPrenos(): void {
  if (typeof window === 'undefined' || !stav) return;
  try { window.name = PREFIX_PRENOSU + naJson(stav); } catch { /* bez přenosu začne druhá role od výchozích dat */ }
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
 * Nainstaluje interceptor. Bezpečné volat opakovaně (druhé volání nedělá nic
 * a vrací tutéž funkci pro návrat). Vrací funkci, která obnoví původní
 * `fetch`, `sendBeacon` i `serviceWorker.register`: ukázku lze opustit
 * klientskou navigací a skutečná aplikace pak nesmí odpovídat z paměti.
 *
 * Volá se před prvním vykreslením ukázky (kořenový SessionProvider si sáhne
 * na /api/auth/session až v efektu po připojení) a nesmí záviset na adrese:
 * klientská navigace na /demo vyhodnotí modul dřív, než se adresa změní.
 */
let odinstalovatApi: (() => void) | null = null;

export function instalujDemoApi(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (odinstalovatApi) return odinstalovatApi;
  window.__demoNainstalovano = true;
  window.__demoNezname ??= [];
  const nativniFetch = window.fetch;
  const puvodniFetch = nativniFetch.bind(window);
  stavDema();

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: URL;
    try {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      url = new URL(raw, window.location.href);
    } catch {
      return puvodniFetch(input, init);
    }
    if (url.origin !== window.location.origin) {
      // Ukázka nevolá nikam ven; volající dostane síťovou chybu jako při výpadku.
      return Promise.reject(new TypeError('Ukázka nemá přístup k síti.'));
    }
    if (!url.pathname.startsWith('/api/')) return puvodniFetch(input, init);

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
  const vratit: (() => void)[] = [() => { window.fetch = nativniFetch; }];

  // sendBeacon (next-auth loguje chyby přes něj) by šel na skutečnou adresu.
  try {
    const mel = Object.prototype.hasOwnProperty.call(navigator, 'sendBeacon');
    const puvodni = navigator.sendBeacon;
    const puvodniBeacon = puvodni?.bind(navigator);
    navigator.sendBeacon = (adresa: string | URL, data?: BodyInit | null) => {
      try {
        const u = new URL(String(adresa), window.location.href);
        if (u.origin !== window.location.origin || u.pathname.startsWith('/api/')) return true;
      } catch { return true; }
      return puvodniBeacon ? puvodniBeacon(adresa, data) : true;
    };
    vratit.push(() => { if (mel) navigator.sendBeacon = puvodni; else delete (navigator as any).sendBeacon; });
  } catch { /* prostředí bez sendBeacon */ }

  // Service worker v ukázce nikdy: kdyby ho něco přece jen zaregistrovalo,
  // cachoval by ukázku pod původem skutečné aplikace.
  try {
    if ('serviceWorker' in navigator) {
      const kontejner = navigator.serviceWorker;
      const mel = Object.prototype.hasOwnProperty.call(kontejner, 'register');
      const puvodni = kontejner.register;
      kontejner.register = () => Promise.reject(new Error('Ukázka nepoužívá service worker.'));
      vratit.push(() => { if (mel) kontejner.register = puvodni; else delete (kontejner as any).register; });
    }
  } catch { /* nelze přepsat — provider ho v ukázce stejně nemontuje */ }

  window.__demoReset ??= () => { resetujDemo(); };
  window.__demoStav = () => stavDema();

  odinstalovatApi = () => {
    for (const f of vratit.reverse()) { try { f(); } catch { /* nic dalšího se s tím dělat nedá */ } }
    window.__demoNainstalovano = false;
    odinstalovatApi = null;
  };
  return odinstalovatApi;
}
