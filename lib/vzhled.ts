// Osobní vzhled tohoto zařízení: hustota, velikost písma, omezení pohybu a vysoký kontrast.
//
// Ukládá se do localStorage zařízení (klíč `managero-vzhled`), ne na účet: velikost písma
// a pohyb závisí na displeji a na tom, co zrovna drží v ruce, a tablet za barem má mít jiné
// písmo než telefon majitele. Motiv (světlý/tmavý/podle systému) je výjimka: ten se
// s účtem synchronizuje (users.theme).
//
// Nastavení se projeví jako data-atributy na <html> (app/globals.css je čte). Stejná
// pravidla opakuje malý skript v app/layout.tsx, ať se vzhled uplatní před prvním
// vykreslením a nic neproblikne; změníš-li jedno, změň i druhé.

export const KLIC_VZHLEDU = 'managero-vzhled';

export type Hustota = 'pohodlna' | 'kompaktni';
export type VelikostPisma = 'normalni' | 'vetsi' | 'nejvetsi';

export interface Vzhled {
  hustota: Hustota;
  pismo: VelikostPisma;
  /** Ruční „Omezit pohyb" (navíc k nastavení systému prefers-reduced-motion). */
  pohyb: boolean;
  /** Ruční „Vysoký kontrast" (navíc k nastavení systému prefers-contrast). */
  kontrast: boolean;
}

export const VYCHOZI_VZHLED: Vzhled = { hustota: 'pohodlna', pismo: 'normalni', pohyb: false, kontrast: false };

export function cistyVzhled(v: unknown): Vzhled {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return {
    hustota: o.hustota === 'kompaktni' ? 'kompaktni' : 'pohodlna',
    pismo: o.pismo === 'vetsi' || o.pismo === 'nejvetsi' ? o.pismo : 'normalni',
    pohyb: o.pohyb === true,
    kontrast: o.kontrast === true,
  };
}

/** Data-atributy pro <html>; `null` = atribut se odebere. */
export function atributyVzhledu(v: Vzhled): Record<'data-density' | 'data-fontsize' | 'data-motion' | 'data-contrast', string | null> {
  return {
    'data-density': v.hustota === 'kompaktni' ? 'compact' : null,
    'data-fontsize': v.pismo === 'vetsi' ? 'large' : v.pismo === 'nejvetsi' ? 'xlarge' : null,
    'data-motion': v.pohyb ? 'reduce' : null,
    'data-contrast': v.kontrast ? 'high' : null,
  };
}

/** Uložený vzhled zařízení; mimo prohlížeč nebo bez localStorage výchozí. */
export function nactiVzhled(): Vzhled {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KLIC_VZHLEDU) : null;
    return raw ? cistyVzhled(JSON.parse(raw)) : VYCHOZI_VZHLED;
  } catch { return VYCHOZI_VZHLED; }
}

/** Zapíše atributy na <html>. */
export function pouzijVzhled(v: Vzhled): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [k, val] of Object.entries(atributyVzhledu(v))) {
    if (val === null) root.removeAttribute(k); else root.setAttribute(k, val);
  }
}

/** Uloží a hned uplatní. Soukromé okno bez úložiště: vzhled platí aspoň do znovunačtení. */
export function ulozVzhled(v: Vzhled): void {
  try { localStorage.setItem(KLIC_VZHLEDU, JSON.stringify(v)); } catch { /* soukromé okno */ }
  pouzijVzhled(v);
}
