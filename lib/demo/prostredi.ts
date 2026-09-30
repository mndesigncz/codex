// Izolace prostředí ukázky od skutečné aplikace na stejném původu.
//
// Ukázka běží pod původem skutečné aplikace, takže by sdílela úložiště
// prohlížeče. Kdo je přihlášený v aplikaci (nebo má v ní zvolený tmavý
// motiv a režim TO GO) by ukázkou tyhle volby přepsal, a naopak by je ukázka
// četla. Proto localStorage a sessionStorage v ukázce žijí jen v paměti
// stránky. Cookies ukázka nepoužívá vůbec.

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
 * Cizí skripty se v ukázce nevkládají. Balíček `@stripe/stripe-js` si při
 * importu (Nastavení → Předplatné) přidá <script src="https://js.stripe.com/…">
 * do <head>; ukázka nemá s platbami nic společného a CSP by ho stejně odmítla
 * s chybou v konzoli. Tichá obrana v prohlížeči je čistší než chybová hláška.
 */
function zakazCiziSkripty(): void {
  const jeCizi = (n: Node) => {
    if (!(n instanceof HTMLScriptElement) || !n.src) return false;
    try { return new URL(n.src, window.location.href).origin !== window.location.origin; } catch { return false; }
  };
  for (const cil of [HTMLHeadElement.prototype, HTMLBodyElement.prototype] as Node[]) {
    const puvodni = cil.appendChild;
    cil.appendChild = function <T extends Node>(this: Node, n: T): T { return jeCizi(n) ? n : puvodni.call(this, n) as T; };
  }
}

let hotovo = false;

export function zalozProstredi(): void {
  if (typeof window === 'undefined' || hotovo) return;
  hotovo = true;
  try { zakazCiziSkripty(); } catch { /* bez ochrany zůstane CSP */ }
  for (const jmeno of ['localStorage', 'sessionStorage'] as const) {
    try {
      const u = new PametovyUloziste();
      if (jmeno === 'localStorage') for (const [k, v] of Object.entries(PREDVOLBY)) u.setItem(k, v);
      Object.defineProperty(window, jmeno, { configurable: true, get: () => u });
    } catch { /* prohlížeč nedovolí přepsat: zůstane skutečné úložiště, ukázka funguje dál */ }
  }
}
