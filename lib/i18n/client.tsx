'use client';

// Překladač v prohlížeči: provider, hooky `useT()` a `useJazyk()`.
//
// Jazyk přepíná `setJazyk`: nejdřív dotáhne slovníky nového jazyka pro všechny
// sekce, které už se používají, teprve pak přepne stav, takže se nikdy nepřekreslí
// napůl česky. Potom zapíše cookie (server podle ní vykreslí <html lang> a server
// komponenty), přihlášenému uživateli uloží `users.lang` a nechá server komponenty
// vykreslit znovu (`router.refresh()`).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { COOKIE_JAZYKA, KLIC_JAZYKA_HOSTA, VYCHOZI, cistyJazyk, jazykZAccept, type Jazyk } from './config.ts';
import { preloz, prelozId, type Hodnoty, type Slovnik } from './core.ts';
import { nactiSekce, SEKCE_VZDY, type Sekce } from './slovniky.ts';
import { nastavAktualniJazyk, pridejSlovnik, posluchejSlovniky, vsechnySlovniky } from './stav.ts';

export interface PrekladFn {
  (klic: string, hodnoty?: Hodnoty, ctx?: string): string;
  /** Text podle id z katalogu (alergeny, navigace): `t.id('nav.sklad', 'Sklad')`. */
  id: (id: string, cs: string, hodnoty?: Hodnoty) => string;
  jazyk: Jazyk;
}

interface Ctx {
  jazyk: Jazyk;
  t: PrekladFn;
  setJazyk: (j: Jazyk, o?: { ulozit?: boolean }) => Promise<void>;
  /** Sekce se načetla pro zvolený jazyk (pro cs vždy true). */
  pozadej: (sekce: Sekce) => void;
}

const VYCHOZI_T: PrekladFn = Object.assign(
  (klic: string, hodnoty?: Hodnoty) => preloz({}, 'cs', klic, hodnoty),
  { id: (_id: string, cs: string, hodnoty?: Hodnoty) => prelozId({}, 'cs', _id, cs, hodnoty), jazyk: VYCHOZI as Jazyk },
);

const I18nCtx = createContext<Ctx>({ jazyk: VYCHOZI, t: VYCHOZI_T, setJazyk: async () => {}, pozadej: () => {} });

/** Sekce, které stránka už potřebuje; při změně jazyka se dotáhnou pro nový jazyk. */
const pozadovane = new Set<Sekce>(SEKCE_VZDY);

/** Jazyk z cookie, nebo undefined. Jen prohlížeč. */
export function cteniCookieJazyka(): Jazyk | undefined {
  if (typeof document === 'undefined') return undefined;
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE_JAZYKA + '=([^;]*)'));
  return cistyJazyk(m?.[1]);
}

function zapisCookie(j: Jazyk) {
  try { document.cookie = `${COOKIE_JAZYKA}=${j}; Path=/; Max-Age=31536000; SameSite=Lax`; } catch { /* zakázané cookies */ }
}

/** Hostovské stránky, kde se jazyk bere z prohlížeče, když ho host ještě nezvolil. */
export function jeHostovskaCesta(cesta: string): boolean {
  return cesta === '/client' || cesta.startsWith('/client/') || cesta.startsWith('/s/');
}

/** Jazyk prohlížeče ∩ podporované (navigator.languages v pořadí preference). */
export function jazykZNavigatoru(): Jazyk | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const seznam = (navigator.languages && navigator.languages.length ? Array.from(navigator.languages) : [navigator.language]).filter(Boolean);
  // Stejná logika jako u hlavičky Accept-Language, jen s vahami podle pořadí.
  return jazykZAccept(seznam.map((l, i) => `${l};q=${(1 - i * 0.01).toFixed(2)}`).join(','));
}

export function I18nProvider({ jazyk: pocatecni, slovniky, children }: {
  jazyk: Jazyk;
  /** Slovníky, které server načetl předem (common + api), ať první vykreslení nebliká česky. */
  slovniky?: Partial<Record<Jazyk, Slovnik>>;
  children: React.ReactNode;
}) {
  // Zapsat dřív, než se vykreslí potomci: SSR i hydratace pak vidí překlady hned.
  if (slovniky) for (const j of Object.keys(slovniky) as Jazyk[]) pridejSlovnik(j, slovniky[j]!);
  const router = useRouter();
  const { status } = useSession();
  const [jazyk, setJazykStav] = useState<Jazyk>(pocatecni);
  const [verze, setVerze] = useState(0);
  nastavAktualniJazyk(jazyk);

  useEffect(() => posluchejSlovniky(() => setVerze(v => v + 1)), []);
  // Server po router.refresh() pošle nový pocatecni jazyk: srovná se stav.
  useEffect(() => { setJazykStav(pocatecni); }, [pocatecni]);

  const prihlasen = useRef(false);
  prihlasen.current = status === 'authenticated';

  const setJazyk = useCallback(async (novy: Jazyk, o?: { ulozit?: boolean }) => {
    await nactiSekce(novy, Array.from(pozadovane));
    zapisCookie(novy);
    try { localStorage.setItem(KLIC_JAZYKA_HOSTA, novy); } catch { /* soukromé okno */ }
    document.documentElement.lang = novy;
    nastavAktualniJazyk(novy);
    setJazykStav(novy);
    if (o?.ulozit !== false && prihlasen.current) {
      // Uložení na účet je doplněk: bez sloupce `users.lang` (před /api/init) nebo
      // bez sítě zůstane jazyk aspoň v cookie tohoto zařízení.
      fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: novy }) }).catch(() => {});
    }
    router.refresh();
  }, [router]);

  // Hostovské stránky: ?lang=, pak jazyk prohlížeče, dokud host nezvolil sám.
  useEffect(() => {
    if (typeof window === 'undefined' || !jeHostovskaCesta(location.pathname)) return;
    const zUrl = cistyJazyk(new URLSearchParams(location.search).get('lang'));
    const navrh = zUrl ?? (cteniCookieJazyka() ? undefined : jazykZNavigatoru());
    if (navrh && navrh !== jazyk) setJazyk(navrh, { ulozit: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pozadej = useCallback((sekce: Sekce) => {
    pozadovane.add(sekce);
    if (jazyk !== 'cs') nactiSekce(jazyk, [sekce]);
  }, [jazyk]);

  const hodnota = useMemo<Ctx>(() => {
    const t = Object.assign(
      (klic: string, hodnoty?: Hodnoty, ctx?: string) => preloz(vsechnySlovniky(), jazyk, klic, hodnoty, ctx),
      { id: (id: string, cs: string, hodnoty?: Hodnoty) => prelozId(vsechnySlovniky(), jazyk, id, cs, hodnoty), jazyk },
    );
    return { jazyk, t, setJazyk, pozadej };
    // `verze` je tu schválně: nová sekce slovníku musí překreslit všechny, kdo překládají.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jazyk, verze, setJazyk, pozadej]);

  return <I18nCtx.Provider value={hodnota}>{children}</I18nCtx.Provider>;
}

/** Funkce `t`. S názvem sekce ji hook navíc dotáhne, když ještě není načtená (klientské přechody). */
export function useT(sekce?: Sekce): PrekladFn {
  const { t, pozadej } = useContext(I18nCtx);
  useEffect(() => { if (sekce) pozadej(sekce); }, [sekce, pozadej]);
  return t;
}

export function useJazyk(): { jazyk: Jazyk; setJazyk: Ctx['setJazyk'] } {
  const { jazyk, setJazyk } = useContext(I18nCtx);
  return { jazyk, setJazyk };
}

/**
 * Serverové `<Slovniky>` sem pošle slovníky sekce a tahle komponenta je zapíše
 * do sdíleného stavu dřív, než se vykreslí stránka pod ní.
 */
export function ZapisSlovniky({ sekce, slovniky }: { sekce: Sekce[]; slovniky: Partial<Record<Jazyk, Slovnik>> }) {
  for (const s of sekce) pozadovane.add(s);
  for (const j of Object.keys(slovniky) as Jazyk[]) pridejSlovnik(j, slovniky[j]!);
  return null;
}
