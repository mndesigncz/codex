// Překlad v serverových komponentách a routách.
//
// Jazyk požadavku = cookie `managero-lang`, jinak čeština. Hlavičku
// Accept-Language tady schválně nečteme: český majitel s anglickým prohlížečem
// by jinak otevřel aplikaci v angličtině. Jazyk prohlížeče se používá jen na
// hostovských stránkách (klient) a v menu-akce.html, kde host nemá jiný způsob,
// jak říct, čemu rozumí.

import { type Jazyk } from './config.ts';
import { jazykPozadavku } from './jazykPozadavku.ts';
import { preloz, prelozId, type Hodnoty } from './core.ts';
import { nactiSekce, SEKCE_VZDY, type Sekce } from './slovniky.ts';
import { vsechnySlovniky } from './stav.ts';
import { ZapisSlovniky } from './client.tsx';

export const getJazyk = jazykPozadavku;

export interface ServerT {
  (klic: string, hodnoty?: Hodnoty, ctx?: string): string;
  id: (id: string, cs: string, hodnoty?: Hodnoty) => string;
  jazyk: Jazyk;
}

/** `t` pro daný jazyk (nebo pro jazyk požadavku). Sekce se dotáhnou, než se vrátí. */
export async function getT(sekce: readonly Sekce[] = SEKCE_VZDY, jazyk?: Jazyk): Promise<ServerT> {
  const j = jazyk ?? (await getJazyk());
  await nactiSekce(j, sekce);
  return Object.assign(
    (klic: string, hodnoty?: Hodnoty, ctx?: string) => preloz(vsechnySlovniky(), j, klic, hodnoty, ctx),
    { id: (id: string, cs: string, hodnoty?: Hodnoty) => prelozId(vsechnySlovniky(), j, id, cs, hodnoty), jazyk: j },
  );
}

/** Serverová komponenta: dotáhne sekce pro jazyk požadavku a předá je klientovi, ať se nic nepřekreslí česky. */
export async function Slovniky({ sekce }: { sekce: Sekce[] }) {
  const jazyk = await getJazyk();
  if (jazyk === 'cs') return null;
  // Kořenový layout posílá všechny sekce (viz SEKCE_VZDY); sem zbývá jen to, co by přibylo navíc.
  const chybi = sekce.filter(s => !SEKCE_VZDY.includes(s));
  if (!chybi.length) return null;
  const slovniky = await nactiSekce(jazyk, chybi);
  return <ZapisSlovniky sekce={chybi} slovniky={slovniky} />;
}
