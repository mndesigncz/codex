// Překlad v serverových komponentách a routách.
//
// Jazyk požadavku = cookie `managero-lang`, jinak čeština. Hlavičku
// Accept-Language tady schválně nečteme: český majitel s anglickým prohlížečem
// by jinak otevřel aplikaci v angličtině. Jazyk prohlížeče se používá jen na
// hostovských stránkách (klient) a v menu-akce.html, kde host nemá jiný způsob,
// jak říct, čemu rozumí.

import { cookies } from 'next/headers';
import { COOKIE_JAZYKA, VYCHOZI, cistyJazyk, type Jazyk } from './config.ts';
import { preloz, prelozId, type Hodnoty } from './core.ts';
import { nactiSekce, SEKCE_VZDY, type Sekce } from './slovniky.ts';
import { vsechnySlovniky } from './stav.ts';
import { ZapisSlovniky } from './client.tsx';

export async function getJazyk(): Promise<Jazyk> {
  try {
    const c = await cookies();
    return cistyJazyk(c.get(COOKIE_JAZYKA)?.value) ?? VYCHOZI;
  } catch {
    // Mimo požadavek (build, statické generování) není cookie: čeština.
    return VYCHOZI;
  }
}

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
  const slovniky = await nactiSekce(jazyk, sekce);
  return <ZapisSlovniky sekce={sekce} slovniky={slovniky} />;
}
