// Crony po dávkách (spuštění, balík S — výkon).
//
// Denní souhrn, záloha a pokladna procházely podniky jeden po druhém a každý
// podnik stál desítky dotazů (a u pokladny volání Storyous). Se stovkou
// podniků by běh narazil na časový limit funkce (60 s) a podniky na konci
// seznamu by nedostaly nic — potichu. Tady jde několik podniků souběžně
// a běh si hlídá čas: co nestihne, nezačne, a řekne to v odpovědi
// (`nestihnuto`), místo aby ho Vercel uprostřed práce zabil.
//
// Čisté (bez databáze), čas se dá podstrčit kvůli testům.

export interface VysledekDavek { hotovo: number; chyby: number; nestihnuto: number }

/**
 * Projde `polozky` s nejvýš `soubezne` rozpracovanými najednou. Novou položku
 * nezačne, když od startu uplynulo víc než `rozpocetMs`. Chyba jedné položky
 * ostatní nezastaví (počítá se do `chyby`).
 */
export async function poDavkach<T>(
  polozky: readonly T[],
  fn: (p: T) => Promise<unknown>,
  { soubezne = 4, rozpocetMs = 50_000, ted = () => Date.now() }: { soubezne?: number; rozpocetMs?: number; ted?: () => number } = {},
): Promise<VysledekDavek> {
  const start = ted();
  let dalsi = 0;
  const v: VysledekDavek = { hotovo: 0, chyby: 0, nestihnuto: 0 };
  const pracovnik = async () => {
    while (dalsi < polozky.length) {
      if (ted() - start > rozpocetMs) return;
      const p = polozky[dalsi++];
      try { await fn(p); v.hotovo++; } catch { v.chyby++; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(soubezne, polozky.length)) }, pracovnik));
  v.nestihnuto = polozky.length - v.hotovo - v.chyby;
  return v;
}
