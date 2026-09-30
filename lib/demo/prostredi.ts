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

let hotovo = false;

export function zalozProstredi(): void {
  if (typeof window === 'undefined' || hotovo) return;
  hotovo = true;
  for (const jmeno of ['localStorage', 'sessionStorage'] as const) {
    try {
      const u = new PametovyUloziste();
      if (jmeno === 'localStorage') for (const [k, v] of Object.entries(PREDVOLBY)) u.setItem(k, v);
      Object.defineProperty(window, jmeno, { configurable: true, get: () => u });
    } catch { /* prohlížeč nedovolí přepsat: zůstane skutečné úložiště, ukázka funguje dál */ }
  }
}
