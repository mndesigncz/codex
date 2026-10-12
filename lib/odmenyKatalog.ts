// Katalog odměn: validace názvu, ceny a emoji pro přidání (POST) i úpravu (PATCH).
//
// Kolo 7: odměnu jde upravit (dřív jen vypnout nebo smazat — překlep v názvu znamenal
// smazat a založit znovu). Obě cesty validují stejně, aby úprava nepustila do katalogu
// něco, co by přidání odmítlo. Žádost o odměnu si název i cenu kopíruje v době žádosti
// (reward_redemptions.title/cost), takže změna ceny staré žádosti nepřepíše.

export const MAX_NAZEV_ODMENY = 80;
export const MAX_CENA_ODMENY = 100_000;
export const MAX_GRAFEMU_IKONY = 2;

export type ChybaOdmeny = 'nazev-chybi' | 'nazev-dlouhy' | 'cena' | 'ikona';

export interface HodnotyOdmeny {
  title?: string;
  cost?: number;
  /** null = bez ikony (smazaná). */
  icon?: string | null;
}

/** Česká hláška k chybě validace (API vrací česky, klient ji ukáže přes apiMessage). */
export const HLASKA_ODMENY: Record<ChybaOdmeny, string> = {
  'nazev-chybi': 'Název je povinný',
  'nazev-dlouhy': `Název může mít nejvýš ${MAX_NAZEV_ODMENY} znaků`,
  cena: 'Cena musí být celé číslo od 1 do 100 000 bodů',
  ikona: 'Ikona musí být jedno nebo dvě emoji',
};

/** Grafémy (to, co člověk vidí jako jeden znak — 👩‍🍳 je jeden, i když má pět kódových bodů). */
export function grafemy(s: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: 'grapheme' }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return [...new Seg('cs', { granularity: 'grapheme' }).segment(s)].map(x => x.segment);
  return [...s];
}

const OBRAZEK = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

/** Je to jedno až dvě emoji? Prázdné (po trim) je „bez ikony" a projde jako null. */
export function jeIkonaOdmeny(s: string): boolean {
  const g = grafemy(s.trim());
  if (g.length === 0) return true;
  if (g.length > MAX_GRAFEMU_IKONY) return false;
  if (s.trim().length > 32) return false;
  return g.every(x => OBRAZEK.test(x));
}

/**
 * Zvaliduje pole odměny. `povinne` = přidání (název a cena musí být); při úpravě se
 * kontroluje jen to, co v těle přišlo (`undefined` = beze změny).
 */
export function validujOdmenu(b: { title?: unknown; cost?: unknown; icon?: unknown }, povinne: boolean):
  { ok: true; hodnoty: HodnotyOdmeny } | { ok: false; chyba: ChybaOdmeny } {
  const hodnoty: HodnotyOdmeny = {};
  if (b.title !== undefined || povinne) {
    const nazev = String(b.title ?? '').trim();
    if (!nazev) return { ok: false, chyba: 'nazev-chybi' };
    if (grafemy(nazev).length > MAX_NAZEV_ODMENY) return { ok: false, chyba: 'nazev-dlouhy' };
    hodnoty.title = nazev;
  }
  if (b.cost !== undefined || povinne) {
    const surove = typeof b.cost === 'string' ? b.cost.trim().replace(/\s/g, '') : b.cost;
    const cena = surove === '' || surove == null || typeof surove === 'boolean' ? NaN : Number(surove);
    if (!Number.isInteger(cena) || cena < 1 || cena > MAX_CENA_ODMENY) return { ok: false, chyba: 'cena' };
    hodnoty.cost = cena;
  }
  if (b.icon !== undefined) {
    const ikona = b.icon == null ? '' : String(b.icon);
    if (!jeIkonaOdmeny(ikona)) return { ok: false, chyba: 'ikona' };
    hodnoty.icon = ikona.trim() || null;
  }
  return { ok: true, hodnoty };
}
