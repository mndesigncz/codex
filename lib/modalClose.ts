// Kdy okno zavřít a kdy se zeptat.
//
// Rozhodnutí je oddělené od hooku, aby se dalo proměřit testem. Hook kolem
// toho jen sbírá události z prohlížeče.

/**
 * Jak se okno zavírá:
 *   • `uklepnuti` — Escape nebo klik vedle okna. Uživatel nemířil na nic
 *     konkrétního; když má rozepsáno, ptáme se.
 *   • `zavrit` — křížek. Znamená „chci pryč", ne „zahoď to"; u rozepsaného
 *     se ptáme taky.
 *   • `zahodit` — tlačítko Zrušit nebo Zahodit. Na tlačítku je napsané, co
 *     dělá, takže se neptáme. Ptát se podruhé na to, co uživatel právě
 *     vyslovil, je jen práce navíc.
 */
export type ZpusobZavreni = 'uklepnuti' | 'zavrit' | 'zahodit';

export type Reakce = 'zavrit' | 'zeptat se' | 'zpet k upravam';

export function reakceNaZavreni({ rozepsano, ptameSe, zpusob }: {
  rozepsano: boolean;
  /** Už je otázka na obrazovce? */
  ptameSe: boolean;
  zpusob: ZpusobZavreni;
}): Reakce {
  // Escape nad otevřenou otázkou je „zpět", ne druhé zavření. Kdyby Escape
  // procházel skrz, druhý stisk by zahodil přesně to, na co se okno ptá.
  if (ptameSe) return zpusob === 'zahodit' ? 'zavrit' : 'zpet k upravam';
  if (zpusob === 'zahodit') return 'zavrit';
  return rozepsano ? 'zeptat se' : 'zavrit';
}

/**
 * Do kterých polí se počítá „rozepsaný text". Zaškrtávátko, přepínač ani
 * výběr z nabídky ne: takové ovládání se v aplikaci skoro vždy ukládá hned
 * a jedno kliknutí zpátky není ztráta, kvůli které stojí za to se ptát.
 * Hledání (`type="search"`) je filtr, ne obsah.
 */
const PSANE = new Set(['', 'text', 'email', 'number', 'tel', 'url', 'password']);

export function jePsanePole(tag: string, typ = ''): boolean {
  const t = tag.toUpperCase();
  if (t === 'TEXTAREA') return true;
  if (t !== 'INPUT') return false;
  return PSANE.has(typ.toLowerCase());
}

/**
 * Rozepsáno je, jen když v některém z polí, kam se psalo, něco zůstalo.
 * Kdo text napíše a zase smaže, nic neztrácí a nemá se na co ptát.
 */
export function jeRozepsano(hodnoty: readonly (string | null | undefined)[]): boolean {
  return hodnoty.some(v => (v ?? '').trim() !== '');
}
