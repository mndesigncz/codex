'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useCurrency } from './CurrencyProvider';
import { useJazyk, useT } from '@/lib/i18n/client';
import { adresaPohledu, rozeberAdresu, slozNavigaci, stejnyPohled, type Rozhrani, type SlozenaNavigace } from '@/lib/navigace';

/**
 * Navigace pro layout: oprávnění rozhodují první (`smiPohled`), pak skrytí,
 * přejmenování a pořadí z `teams.nav_config`; výchozí názvy jdou přes slovník
 * (kontext `nav`). Bez konfigurace podniku je výsledek dnešní navigace.
 *
 * Výsledek se přepočítá, jen když se změní jazyk, konfigurace nebo oprávnění
 * (`zavislosti`: layout sem dává oprávnění a stav jejich načtení, protože
 * `smiPohled` vzniká znovu při každém vykreslení).
 */
export function useNavigaceAplikace(rozhrani: Rozhrani, smiPohled: (id: string) => boolean, zavislosti: readonly unknown[]): SlozenaNavigace {
  const { navConfig } = useCurrency();
  const { jazyk } = useJazyk();
  const t = useT();
  return useMemo(
    () => slozNavigaci({ rozhrani, smiPohled, nastaveni: navConfig, jazyk, nazev: cs => t(cs, undefined, 'nav') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rozhrani, navConfig, jazyk, t, ...zavislosti],
  );
}

// ---------------------------------------------------------------------------
// Historie obrazovek (kolo 8)
//
// Celá administrace i aplikace zaměstnance je jedna adresa a obrazovka byla
// jen stav Reactu: gesto Zpět na telefonu aplikaci zavřelo nebo skočilo na
// přihlášení, a odkaz „podívej se na tuhle uzávěrku" nešel poslat. Tenhle
// hook zapisuje každý přechod do historie prohlížeče (`?view=…&arg=…`),
// při Zpět/Vpřed přepne pohled zpátky a při načtení otevře, co je v adrese.
// Okna si své záznamy řeší v lib/useModal (Zpět nejdřív zavře okno).

export interface HistoriePohledu {
  /** Zapíše přechod do historie (po přepnutí pohledu). Tentýž pohled záznam jen přepíše. */
  zapis: (view: string, arg?: string | null) => void;
}

export function useHistoriePohledu({ vychozi, zname, naZpet, naStart }: {
  /** Pohled bez `?view=` (Přehled / Domů). */
  vychozi: string;
  /** Pohled, který layout zná (neznámý z adresy se ignoruje). */
  zname: (view: string) => boolean;
  /** Zpět / Vpřed: přepni na tenhle pohled (bez zápisu — záznam už v historii je). */
  naZpet: (view: string, arg?: string) => void;
  /** Při načtení s `?view=` v adrese: otevři ho (i s argumentem — `?view=tasks&arg=ukol:12`). */
  naStart: (view: string, arg?: string) => void;
}): HistoriePohledu {
  // Poslední zapsaný pohled: Zpět na tentýž pohled (zavřené okno, stejný záznam) nic nepřepíná.
  const posledni = useRef<{ view: string | null; arg: string | null }>({ view: null, arg: null });
  const ref = useRef({ zname, naZpet, naStart, vychozi });
  ref.current = { zname, naZpet, naStart, vychozi };

  useEffect(() => {
    const a = rozeberAdresu(window.location.search);
    const view = a.view && ref.current.zname(a.view) ? a.view : ref.current.vychozi;
    posledni.current = { view, arg: a.view === view ? a.arg : null };
    if (a.view && a.view === view) ref.current.naStart(view, a.arg ?? undefined);
    const naPop = () => {
      const b = rozeberAdresu(window.location.search);
      const cil = { view: b.view && ref.current.zname(b.view) ? b.view : ref.current.vychozi, arg: b.view && ref.current.zname(b.view) ? b.arg : null };
      if (stejnyPohled(cil, posledni.current)) return;
      posledni.current = cil;
      ref.current.naZpet(cil.view, cil.arg ?? undefined);
    };
    window.addEventListener('popstate', naPop);
    return () => window.removeEventListener('popstate', naPop);
  }, []);

  const zapis = useMemo(() => (view: string, arg?: string | null) => {
    if (typeof window === 'undefined') return;
    const cil = { view, arg: arg || null };
    const adresa = `${window.location.pathname}${adresaPohledu(window.location.search, view, arg)}`;
    // Záznam okna (`okno=1`) se přepíše: přechod z otevřeného okna jinam nemá nechat
    // v historii okno, které už není — Zpět by na něj „vrátil" a nic neukázal.
    const prepsat = stejnyPohled(cil, posledni.current) || window.history.state?.okno != null;
    posledni.current = cil;
    try {
      if (prepsat) window.history.replaceState({ view, arg: cil.arg }, '', adresa);
      else window.history.pushState({ view, arg: cil.arg }, '', adresa);
    } catch { /* prohlížeč bez historie (iframe se sandboxem) */ }
  }, []);

  return { zapis };
}
