'use client';

// Drobné sdílené kusy „Navíc" (kolo 9, N1 — balík Z): pilulky nabídky „Co se dá udělat navíc",
// chip stavu zápisu a text odměny. Jedna podoba pro okno, widget, uzávěrku i tablet.

import type { ReactNode } from 'react';
import { Button, Chip } from '../ui';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { limitNabidkyVycerpan, odmenaText, stavNavic, type NabidkaNavic, type Navic, type StavNavic } from '@/lib/navic';
import { popisekNabidky } from './logika';

export { popisekNabidky };

/** Text chipu stavu — klíče z lib/navic.stavNavic přeložené výslovně (check-i18n čte jen t('…')). */
export function textStavu(t: PrekladFn, s: StavNavic): string {
  if (s === 'ceka') return t('Čeká na uznání');
  if (s === 'uznano') return t('Uznáno');
  return t('Odmítnuto');
}

export function StavChip({ stav, size = 'sm' }: { stav: StavNavic; size?: 'sm' | 'md' }) {
  const t = useT('widgety');
  const s = stavNavic(stav);
  return <Chip tone={s.tone} size={size} icon={stav === 'uznano' ? 'check' : stav === 'odmitnuto' ? 'close' : 'clock'}>{textStavu(t, stav)}</Chip>;
}

/** „+20 b", „+20 b · 300 Kč" (měna podniku), nebo přeložené „bez odměny". */
export function odmena(t: PrekladFn, z: Pick<Navic, 'points' | 'bonusCzk'>, money: (n: number) => string): string {
  return z.points || z.bonusCzk ? odmenaText(z, money) : t('bez odměny');
}

/** Hlášky validace z lib/navic (stejné jako na serveru) přeložené výslovně. */
export function prelozChybu(t: PrekladFn, chyba: string): string {
  switch (chyba) {
    case 'Napiš, co bylo navíc.': return t('Napiš, co bylo navíc.');
    case 'Text je moc dlouhý (nejvýš 500 znaků) nebo moc krátký.': return t('Text je moc dlouhý (nejvýš 500 znaků) nebo moc krátký.');
    case 'Den nesedí (nesmí být v budoucnu).': return t('Den nesedí (nesmí být v budoucnu).');
    case 'Den nesedí — zapsat jde nejvýš 14 dní zpětně a ne do budoucna.': return t('Den nesedí — zapsat jde nejvýš 14 dní zpětně a ne do budoucna.');
    case 'Fotka má neplatnou adresu.': return t('Fotka má neplatnou adresu.');
    default: return chyba;
  }
}

/**
 * Pilulky nabídky. Každá je tlačítko ≥ 44 px (na telefonu i tabletu), text se smí zalomit
 * (na 320 px v polštině by „Zaskočit za kolegu na směnu · 50 b · 300 Kč" jinak přetekl).
 * Vyčerpaný denní limit pilulku vypne a řekne proč.
 */
export function NabidkaChipy({ nabidka, dnesniZapisy = [], vybrane = null, onVyber, money, velke = false, label, className = '' }: {
  nabidka: readonly NabidkaNavic[];
  /** Dnešní zápisy člověka — kvůli limitu za den (limitNabidkyVycerpan). */
  dnesniZapisy?: readonly Pick<Navic, 'offerId' | 'status'>[];
  /** Vybraná položka (v okně); jinde null. */
  vybrane?: number | null;
  onVyber: (n: NabidkaNavic) => void;
  money: (n: number) => string;
  /** Tablet: vyšší pilulky (lg). */
  velke?: boolean;
  label?: ReactNode;
  className?: string;
}) {
  const t = useT('widgety');
  if (nabidka.length === 0) return null;
  return (
    <div className={`min-w-0 ${className}`} data-nabidka-navic>
      {label && <p className="t-label mb-1.5">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {nabidka.map(n => {
          const vycerpano = limitNabidkyVycerpan(n, dnesniZapisy);
          const je = vybrane === n.id;
          return (
            <Button key={n.id} type="button" variant={je ? 'primary' : 'secondary'} size={velke ? 'lg' : 'md'}
              aria-pressed={je} disabled={vycerpano} data-nabidka={n.id}
              title={vycerpano ? t('Dnes už zapsané (limit {n}× za den).', { n: n.maxPerDay ?? 1 }) : n.description ?? undefined}
              icon={n.autoApprove ? 'check' : 'plus'}
              onClick={() => onVyber(n)}
              className="max-w-full !whitespace-normal h-auto min-h-11 py-2 text-left">
              {popisekNabidky(n, money)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
