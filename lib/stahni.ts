// Uložení a sdílení souboru z webu — i v nativním obalu (WKWebView, Android WebView).
//
// Proč to existuje: `<a download>` z blob adresy (kalendář .ics, CSV, QR, tisk)
// v obalu TIŠE NEUDĚLÁ NIC. V prohlížeči soubor spadne do stažených, ve WKWebView
// se nestane nic a člověk kliká do prázdna. Tady je jedno místo, které:
//  * v prohlížeči stáhne soubor jako dřív,
//  * v obalu ho pošle do systémového sdílecího listu (tam je „Přidat do kalendáře“,
//    „Uložit do Souborů“, „Vytisknout“, AirDrop), nejdřív přes nativní pluginy
//    Filesystem + Share, jinak přes navigator.share se souborem,
//  * a když nejde nic z toho, poctivě vrátí `nejde`, ať to volající řekne.
//
// `window.print()` ve WebView nefunguje a okno z `window.open` ve WKWebView nedostane
// kontext relace, takže tisk v obalu jde stejnou cestou: dokument se sdílí jako
// soubor (HTML), ze sdílecího listu se dá vytisknout.

import { jeNativni, plugin } from './nativniMost';
import { obalZUserAgent } from './obal';
import { bezpecnyNazev } from './nazevSouboru';

export { bezpecnyNazev };

export type VysledekUlozeni = 'stazeno' | 'sdileno' | 'nejde';

/** Běží aplikace v nativním obalu (značka v User-Agentu, nebo Capacitor)? */
export function jeObalKlient(): boolean {
  if (typeof navigator === 'undefined') return false;
  return obalZUserAgent(navigator.userAgent).obal !== null || jeNativni();
}

function naBlob(obsah: Blob | string, mime: string): Blob {
  return typeof obsah === 'string' ? new Blob([obsah], { type: mime }) : obsah;
}

async function naBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function stahniVProhlizeci(nazev: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nazev;
  // Safari stahuje jen z odkazu, který je v dokumentu.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Okamžité uvolnění stažení v některých prohlížečích utne.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Sdílení přes nativní pluginy: soubor do cache a systémový sdílecí list. */
async function sdiletNativne(nazev: string, blob: Blob): Promise<boolean> {
  const fs = plugin('Filesystem');
  const share = plugin('Share');
  if (!fs || !share) return false;
  try {
    const zapsan = await fs.writeFile({ path: nazev, data: await naBase64(blob), directory: 'CACHE' });
    const uri = zapsan?.uri;
    if (!uri) return false;
    await share.share({ title: nazev, url: uri, dialogTitle: nazev });
    return true;
  } catch (e) {
    // Zrušení sdílecího listu uživatelem není chyba.
    return /cancel/i.test(String((e as any)?.message ?? e));
  }
}

/** Sdílení přes webové API: soubor jako File do navigator.share. */
async function sdiletPresWeb(nazev: string, blob: Blob, mime: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof File === 'undefined') return false;
    const soubor = new File([blob], nazev, { type: mime });
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [soubor] })) return false;
    await navigator.share({ files: [soubor], title: nazev });
    return true;
  } catch (e) {
    // AbortError = člověk sdílení zavřel; nic se nepokazilo.
    return (e as any)?.name === 'AbortError';
  }
}

/** Může obal soubor nabídnout ke sdílení? (Pro volající, kteří to musí vědět hned, např. tisk.) */
export function muzeSdiletSoubor(): boolean {
  if (plugin('Filesystem') && plugin('Share')) return true;
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
}

/**
 * Uloží soubor. V prohlížeči ho stáhne, v obalu otevře sdílecí list.
 * `nejde` znamená, že obal nemá čím soubor předat; volající to má člověku říct.
 */
export async function ulozSoubor(nazevSurovy: string, obsah: Blob | string, mime = 'application/octet-stream'): Promise<VysledekUlozeni> {
  const nazev = bezpecnyNazev(nazevSurovy);
  const blob = naBlob(obsah, typeof obsah === 'string' ? mime : (obsah.type || mime));
  if (!jeObalKlient()) { stahniVProhlizeci(nazev, blob); return 'stazeno'; }
  if (await sdiletNativne(nazev, blob)) return 'sdileno';
  if (await sdiletPresWeb(nazev, blob, blob.type || mime)) return 'sdileno';
  ohlasNejde();
  return 'nejde';
}

/**
 * Obal soubor nepředal: ohlásí se to jedním globálním oknem (components/UlozeniHlaska),
 * ať tlačítko Export nebo Tisk nezůstane mrtvé a nikdo si nemusel psát vlastní stav chyby.
 */
export const UDALOST_NEJDE = 'managero:ulozeni-nejde';
function ohlasNejde(): void {
  try { window.dispatchEvent(new CustomEvent(UDALOST_NEJDE)); } catch { /* bez okna */ }
}

/** Soubor z adresy (fotka účtenky, QR): stáhne se s relací a uloží/sdílí stejně jako blob. */
export async function ulozZAdresy(url: string, nazev: string): Promise<VysledekUlozeni> {
  try {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) return 'nejde';
    return ulozSoubor(nazev, await r.blob(), r.headers.get('content-type') ?? 'application/octet-stream');
  } catch { return 'nejde'; }
}

/** Otevře adresu v systémovém prohlížeči (obal), nebo v nové záložce (web). */
export function otevriVeSystemu(url: string): void {
  const browser = plugin('Browser');
  if (jeObalKlient() && browser?.open) { void browser.open({ url }); return; }
  window.open(url, '_blank', 'noopener');
}

/**
 * Stránka k vytištění (QR na stůl, generuje ji server s relací vedení): v prohlížeči se otevře
 * v nové záložce a vytiskne se, v obalu by `window.open` skončilo v systémovém prohlížeči bez
 * přihlášení (401) a `window.print()` nic nedělá. V obalu se proto stránka stáhne s relací
 * a nabídne jako soubor do sdílecího listu (Otevřít v prohlížeči, Vytisknout, AirDrop).
 */
export function otevriNaTisk(url: string, nazev = 'k-tisku.html'): void {
  if (jeObalKlient()) { void ulozZAdresy(url, nazev); return; }
  window.open(url, '_blank');
}

/** Hláška pro případ, že obal soubor nepředal. Jedna věta, ať ji volající nemusí vymýšlet. */
export const HLASKA_NEJDE_ULOZIT = 'Soubor se nepodařilo uložit. Aktualizujte aplikaci, nebo ho otevřete ve webovém prohlížeči.';
