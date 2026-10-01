// Profil podniku (Nastavení → Profil podniku): ověření IČO, DIČ a prahů skladu.
// Čistý modul (testy: scripts/testy/k79-nastaveni.ts), ať stejné pravidlo drží server i formulář.
//
// IČO a DIČ jsou jen údaje podniku k zobrazení (doklady, tisk); aplikace z nich nic nepočítá
// a nic neověřuje v registrech. Kontroluje se tvar, aby překlep neodešel na doklad.

/** Jen číslice a mezery pryč. */
const bezMezer = (v: unknown) => String(v ?? '').replace(/\s+/g, '');

/** Kontrolní číslice IČO (modulo 11, váhy 8…2); IČO má osm číslic. */
export function icoMaPlatnouKontrolu(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  let soucet = 0;
  for (let i = 0; i < 7; i++) soucet += Number(ico[i]) * (8 - i);
  const zbytek = soucet % 11;
  const kontrolni = zbytek === 0 ? 1 : zbytek === 1 ? 0 : 11 - zbytek;
  return kontrolni === Number(ico[7]);
}

/**
 * IČO z formuláře: prázdné = bez IČO (`null`), platné = osm číslic, jinak `undefined` (chyba).
 * Kratší IČO se doplní nulami zleva (v registru se píše i bez úvodních nul).
 */
export function cistyIco(v: unknown): string | null | undefined {
  const s = bezMezer(v);
  if (s === '') return null;
  if (!/^\d{1,8}$/.test(s)) return undefined;
  const ico = s.padStart(8, '0');
  return icoMaPlatnouKontrolu(ico) ? ico : undefined;
}

/**
 * DIČ z formuláře: prázdné = bez DIČ, jinak dvoupísmenný kód země + 2 až 12 znaků (CZ12345678,
 * SK2020123456, DE123456789); písmena se zvětší. Neplatné = `undefined`.
 */
export function cistyDic(v: unknown): string | null | undefined {
  const s = bezMezer(v).toUpperCase();
  if (s === '') return null;
  return /^[A-Z]{2}[0-9A-Z]{2,12}$/.test(s) ? s : undefined;
}

/**
 * Práh skladu: celé nezáporné číslo do rozumné meze, jinak `undefined`. Sloupce
 * (teams.low_stock_default, critical_stock_default) jsou INTEGER, desetinné číslo by uložení shodilo.
 * Prázdné se nepřijímá (práh vždy existuje).
 */
export function cistyPrah(v: unknown): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n) : undefined;
}

/** Kritický práh nesmí být nad nízkým (kritické „pod 8" při nízkém „pod 5" nedává smysl). */
export function pragySedi(nizky: number, kriticky: number): boolean {
  return kriticky <= nizky;
}
