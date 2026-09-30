'use client';

// Kontext „v jakém nativním obalu běží aplikace“. Hodnotu čte server z User-Agentu
// (app/layout.tsx) a předává ji sem jako prop, takže se ceny a odkazy na platby
// nikdy nevykreslí a pak neschovají (žádné probliknutí při prvním vykreslení).
//
// Značka se nedá brát jako důkaz oprávnění (User-Agent si pošle kdokoli):
// slouží jen ke ZÚŽENÍ nabídky. Serverová brána je v middleware.ts a v routách.

import { createContext, useContext, type ReactNode } from 'react';
import type { Obal } from '@/lib/obal';

interface ObalKontext { obal: Obal; jeObal: boolean; smiPlatby: boolean }

const Vychozi: ObalKontext = { obal: null, jeObal: false, smiPlatby: true };
const Ctx = createContext<ObalKontext>(Vychozi);

export function ObalProvider({ obal, children }: { obal: Obal; children: ReactNode }) {
  const hodnota: ObalKontext = { obal, jeObal: obal !== null, smiPlatby: obal === null };
  return <Ctx.Provider value={hodnota}>{children}</Ctx.Provider>;
}

/** { obal, jeObal, smiPlatby } — v prohlížeči (bez obalu) jsou platby povolené. */
export function useObal(): ObalKontext {
  return useContext(Ctx);
}
