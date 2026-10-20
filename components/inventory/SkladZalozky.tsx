'use client';

// Záložky „Sklad › Položky · Receptury z kasy · Inventura" pod hlavičkou Skladu
// i Receptur (kolo 82). Majitel hledal receptury ve Skladu a inventuru v menu
// „···"; teď jsou obě části na jednom místě z obou stran a chodí se mezi nimi
// jedním klepnutím.
//
// Receptury zůstávají vlastním pohledem (`recipes`) — deep linky z katalogu
// widgetů (`cil: { pohled: 'recipes' }`), `navigate('recipes', productId)`
// a `?view=recipes` dál platí. Inventura je okno nad Skladem: tady se otevře
// rovnou (`onInventura`), z Receptur přes `navigate('inventory', 'akce:inventura')`.

import { Segmented } from '../ui';
import { useT } from '@/lib/i18n/client';
import { AKCE_INVENTURA } from '@/lib/skladPredani';

export type ZalozkaSkladu = 'polozky' | 'receptury';

export default function SkladZalozky({ aktivni, onNavigate, smiReceptury, smiInventura, onInventura }: {
  aktivni: ZalozkaSkladu;
  onNavigate?: (view: string, arg?: string) => void;
  smiReceptury: boolean;
  smiInventura: boolean;
  /** Na Skladu otevře okno rovnou; jinde se jde přes navigate. */
  onInventura?: () => void;
}) {
  const t = useT('sklad');
  // Bez navigace (stránka vložená jinam) nemá přepínač kam vést.
  if (!onNavigate && !onInventura) return null;
  // v3: jeden segment „Položky · Receptury z kasy · Inventura". Dřív stál vedle segmentu
  // ještě samostatný knoflík Inventura — dva různé tvary pro tři sourozence a na telefonu
  // dvě řady pod hlavičkou. Inventura je okno nad Skladem: klepnutí ho otevře a vybraná
  // část zůstává, kde byla (segment je pohled, okno se nad ním jen otevře).
  const options = [
    { id: 'polozky' as const, label: t('Položky'), icon: 'archive' },
    ...(smiReceptury && onNavigate ? [{ id: 'receptury' as const, label: t('Receptury z kasy'), icon: 'receipt' }] : []),
    ...(smiInventura ? [{ id: 'inventura' as const, label: t('Inventura'), icon: 'clipboard' }] : []),
  ];
  if (options.length < 2) return null;
  return (
    <div className="flex min-w-0" data-sklad-zalozky>
      <Segmented ariaLabel={t('Části skladu')} value={aktivni}
        options={options}
        onChange={id => {
          if (id === 'inventura') { if (onInventura) onInventura(); else onNavigate?.('inventory', AKCE_INVENTURA); return; }
          if (id !== aktivni) onNavigate?.(id === 'receptury' ? 'recipes' : 'inventory');
        }} />
    </div>
  );
}
