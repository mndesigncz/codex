// Načítání slovníků ze souborů `locales/<jazyk>/<sekce>.json`.
//
// Dynamický `import()` se šablonou cesty webpack rozloží na samostatný chunk
// pro každý soubor, takže prohlížeč stáhne jen jazyk a sekce, které potřebuje.
// Čeština žádný slovník nemá (česká věta je klíč) a nic nenačítá. Chybějící
// soubor není chyba: znamená „celá sekce ve fallbacku".
//
// Slovníky musí být z vlastní domény (CSP `default-src 'self'`), žádné CDN.

import { retezJazyku, type Jazyk } from './config.ts';
import { pridejSlovnik } from './stav.ts';
import type { Slovnik } from './core.ts';

/** Sekce slovníků. */
export const SEKCE = [
  'common', 'api', 'auth', 'klient-host',
  'zamestnanec', 'kiosk', 'chat',
  'sprava', 'tym', 'navody', 'postupy',
  'rozvrh', 'sklad',
  'spolecne', 'pruvodce', 'predplatne',
] as const;
export type Sekce = (typeof SEKCE)[number];
/**
 * Sekce, které jdou s KAŽDOU stránkou (kořenový layout) a tedy jsou už i v prohlížeči: všechny.
 *
 * Proč ne jen ty, které stránka potřebuje: slovníky se na serveru ukládají do sdíleného stavu procesu
 * (lib/i18n/stav.ts) a ten přežije požadavek. SSR pak přeložilo větu z sekce, kterou si do procesu
 * nahrál úplně jiný dřívější požadavek, zatímco prohlížeč dostal jen sekce své stránky a vykreslil
 * češtinu: chyba hydratace #418 a probliknutí češtiny u každého cizího jazyka (v CI ji ukázala sonda
 * k78-spolecne, až když před ní běžely jiné stránky). Server i prohlížeč proto musí mít stejnou sadu.
 * Čeština nenačítá nic. Velikost: ~95 kB gzip na jazyk; záložní jazyk jde jen pro chybějící klíče.
 */
export const SEKCE_VZDY: readonly Sekce[] = SEKCE;

const rozpracovano = new Map<string, Promise<Slovnik>>();

/** Jeden soubor slovníku; nikdy nevyhazuje (chyba = prázdný slovník). */
export function nactiSoubor(jazyk: Jazyk, sekce: Sekce): Promise<Slovnik> {
  if (jazyk === 'cs') return Promise.resolve({});
  const klic = `${jazyk}/${sekce}`;
  let p = rozpracovano.get(klic);
  if (!p) {
    p = import(`../../locales/${jazyk}/${sekce}.json`)
      .then((m: any) => (m?.default ?? m) as Slovnik)
      .catch(() => ({} as Slovnik));
    rozpracovano.set(klic, p);
  }
  return p;
}

/**
 * Načte sekce pro jazyk i jeho náhradní jazyky (`de` → `de` + `en`) a zapíše je
 * do sdíleného stavu. Vrací, co přibylo, ať to může serverový kód poslat
 * klientovi, aby se první vykreslení neblikalo česky.
 */
export async function nactiSekce(jazyk: Jazyk, sekce: readonly Sekce[]): Promise<Partial<Record<Jazyk, Slovnik>>> {
  const out: Partial<Record<Jazyk, Slovnik>> = {};
  for (const j of retezJazyku(jazyk)) {
    if (j === 'cs') continue;
    const casti = await Promise.all(sekce.map(s => nactiSoubor(j, s)));
    const sloucene: Slovnik = Object.assign({}, ...casti);
    pridejSlovnik(j, sloucene);
    // Záložní jazyk (de → en) klientovi stačí jen pro věty, které zvolený jazyk nemá: zbytek by
    // payload zdvojnásobil a nikdy se nepoužije.
    const hlavni = out[jazyk] ?? sloucene;
    out[j] = j === jazyk ? sloucene : Object.fromEntries(Object.entries(sloucene).filter(([k]) => !(k in hlavni)));
  }
  return out;
}
