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

import { Button, Segmented } from '../ui';
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
  const options = [
    { id: 'polozky' as const, label: t('Položky'), icon: 'archive' },
    ...(smiReceptury ? [{ id: 'receptury' as const, label: t('Receptury z kasy'), icon: 'receipt' }] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" data-sklad-zalozky>
      {options.length > 1 && onNavigate && (
        <Segmented ariaLabel={t('Části skladu')} size="sm" value={aktivni}
          options={options}
          onChange={id => { if (id !== aktivni) onNavigate(id === 'receptury' ? 'recipes' : 'inventory'); }} />
      )}
      {smiInventura && (
        <Button variant="secondary" size="sm" icon="clipboard"
          onClick={() => { if (onInventura) onInventura(); else onNavigate?.('inventory', AKCE_INVENTURA); }}>
          {t('Inventura')}
        </Button>
      )}
    </div>
  );
}
