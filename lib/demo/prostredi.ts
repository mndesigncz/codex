// Izolace prostředí ukázky od skutečné aplikace na stejném původu.
//
// Ukázka běží pod původem skutečné aplikace, takže by sdílela úložiště
// prohlížeče: localStorage, sessionStorage i COOKIES. Kdo je přihlášený
// v aplikaci (má v ní zvolený tmavý motiv, režim TO GO, nebo je to tablet
// s kioskovou relací a cookie `managero-kiosk-acting`) by ukázkou tyhle
// volby přepsal nebo smazal, a naopak by je ukázka četla. Proto všechno tři
// v ukázce žije jen v paměti stránky a nic z toho nesáhne na skutečné.
//
// Instalace je VRATNÁ (`zalozProstredi()` vrací funkci, která vše vrátí):
// ukázku lze opustit klientskou navigací a stránka pak nesmí nést dál
// paměťové úložiště ani zablokované cizí skripty.

class PametovyUloziste implements Storage {
  private d = new Map<string, string>();
  get length() { return this.d.size; }
  clear() { this.d.clear(); }
  getItem(k: string) { return this.d.has(k) ? this.d.get(k)! : null; }
  key(i: number) { return Array.from(this.d.keys())[i] ?? null; }
  removeItem(k: string) { this.d.delete(k); }
  setItem(k: string, v: string) { this.d.set(String(k), String(v)); }
  [name: string]: any;
}

/** Předvolby, ať ukázku nezdržují jednorázové rady („plochu si můžeš poskládat"). */
const PREDVOLBY: Record<string, string> = {
  'managero-hint-plocha-upravy': '1',
};

/**
 * Paměťový „cookie jar". Setter rozumí zápisu jako skutečné `document.cookie`
 * (`jmeno=hodnota; path=/; max-age=…; expires=…`), takže smazání přes
 * `max-age=0` nebo prošlé `expires` funguje; ostatní atributy ukázka nepotřebuje.
 */
class PametovyCookies {
  private d = new Map<string, string>();
  get(): string { return Array.from(this.d, ([k, v]) => `${k}=${v}`).join('; '); }
  set(zapis: string): void {
    const casti = String(zapis).split(';');
    const prvni = casti[0] ?? '';
    const i = prvni.indexOf('=');
    const jmeno = (i < 0 ? '' : prvni.slice(0, i)).trim();
    const hodnota = i < 0 ? prvni.trim() : prvni.slice(i + 1).trim();
    if (!jmeno) return;
    let smazat = false;
    for (const c of casti.slice(1)) {
      const [ka, ...va] = c.split('=');
      const atribut = ka.trim().toLowerCase();
      const v = va.join('=').trim();
      if (atribut === 'max-age') { const n = Number(v); if (Number.isFinite(n) && n <= 0) smazat = true; }
      if (atribut === 'expires') { const t = Date.parse(v); if (Number.isFinite(t) && t <= Date.now()) smazat = true; }
    }
    if (smazat) this.d.delete(jmeno); else this.d.set(jmeno, hodnota);
  }
}

/**
 * Cizí skripty se v ukázce nevkládají. Balíček `@stripe/stripe-js` si při
 * importu přidá <script src="https://js.stripe.com/…"> do <head>; ukázka nemá
 * s platbami nic společného a CSP by ho stejně odmítla s chybou v konzoli.
 * Tichá obrana v prohlížeči je čistší než chybová hláška.
 */
function zakazCiziSkripty(): () => void {
  const jeCizi = (n: Node) => {
    if (!(n instanceof HTMLScriptElement) || !n.src) return false;
    try { return new URL(n.src, window.location.href).origin !== window.location.origin; } catch { return false; }
  };
  const vratit: (() => void)[] = [];
  for (const cil of [HTMLHeadElement.prototype, HTMLBodyElement.prototype] as Node[]) {
    // Vlastní vlastnost prototypu (Head/Body ji zdědí od Node): při návratu ji stačí smazat.
    const mela = Object.prototype.hasOwnProperty.call(cil, 'appendChild');
    const puvodni = cil.appendChild;
    cil.appendChild = function <T extends Node>(this: Node, n: T): T { return jeCizi(n) ? n : puvodni.call(this, n) as T; };
    vratit.push(() => { if (mela) cil.appendChild = puvodni; else delete (cil as any).appendChild; });
  }
  return () => vratit.forEach(f => f());
}

/**
 * `beforeunload` aplikace („Opustit stránku? Neuložené změny") v ukázce nemá
 * co dělat: nic se neukládá a dialog by zablokoval reset ukázky (`demo-reset`
 * = načtení stránky) i přepnutí role, dokud ho člověk neodklikne. Zachytávací
 * posluchač na okně je první na řadě a ostatní (bez preventDefault) zastaví.
 */
function zakazDialogOdchodu(): () => void {
  const posluchac = (e: Event) => { e.stopImmediatePropagation(); };
  window.addEventListener('beforeunload', posluchac, true);
  return () => window.removeEventListener('beforeunload', posluchac, true);
}

let odinstalovat: (() => void) | null = null;

/**
 * Nainstaluje izolaci (bezpečné volat opakovaně: druhé volání nedělá nic a
 * vrací tutéž funkci pro návrat). Vrací funkci, která původní stav vrátí.
 */
export function zalozProstredi(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (odinstalovat) return odinstalovat;
  const vratit: (() => void)[] = [];

  try { vratit.push(zakazCiziSkripty()); } catch { /* bez ochrany zůstane CSP */ }
  try { vratit.push(zakazDialogOdchodu()); } catch { /* nejhůř dialog při resetu */ }

  for (const jmeno of ['localStorage', 'sessionStorage'] as const) {
    try {
      const puvodni = Object.getOwnPropertyDescriptor(window, jmeno);
      const u = new PametovyUloziste();
      if (jmeno === 'localStorage') for (const [k, v] of Object.entries(PREDVOLBY)) u.setItem(k, v);
      Object.defineProperty(window, jmeno, { configurable: true, get: () => u });
      vratit.push(() => { if (puvodni) Object.defineProperty(window, jmeno, puvodni); else delete (window as any)[jmeno]; });
    } catch { /* prohlížeč nedovolí přepsat: zůstane skutečné úložiště, ukázka funguje dál */ }
  }

  // Cookies: vlastní vlastnost na `document` zastíní accessor z Document.prototype,
  // takže skutečný getter ani setter se nikdy nezavolá (kiosk zapisuje
  // `managero-kiosk-acting`, kterou server u skutečné kioskové relace uznává).
  try {
    const jar = new PametovyCookies();
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => jar.get(), set: (v: string) => jar.set(v) });
    vratit.push(() => { delete (document as any).cookie; });
  } catch { /* prohlížeč nedovolí přepsat */ }

  const vse = () => {
    // V opačném pořadí, než se instalovalo.
    for (const f of vratit.reverse()) { try { f(); } catch { /* nic dalšího se s tím dělat nedá */ } }
    odinstalovat = null;
  };
  odinstalovat = vse;
  return vse;
}
