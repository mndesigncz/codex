'use client';

import { useMemo } from 'react';
import { useCurrency } from './CurrencyProvider';
import { useJazyk, useT } from '@/lib/i18n/client';
import { slozNavigaci, type Rozhrani, type SlozenaNavigace } from '@/lib/navigace';

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
