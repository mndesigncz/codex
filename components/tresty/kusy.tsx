'use client';

// Drobné sdílené kusy „Tresty" (kolo 10, balík Z): chip stavu a dopad trestu do věty.
// Jedna podoba pro widget Moje tresty i okno DetailTrestu. Texty z lib/tresty
// (stavTrestu, trestText) jsou české klíče — tady se překládají výslovně, ať je
// check-i18n vidí (čte jen t('…')).

import { Chip } from '../ui';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { jeNapomenuti, stavTrestu, type Trest } from '@/lib/tresty';

/** Text chipu stavu přeložený výslovně. */
export function textStavuTrestu(t: PrekladFn, tr: Pick<Trest, 'status' | 'seenAt' | 'disputed' | 'disputeHandledAt' | 'points' | 'bonusCut'>): string {
  switch (stavTrestu(tr).text) {
    case 'Zrušeno': return t('Zrušeno');
    case 'Nesouhlasí': return t('Nesouhlasí');
    case 'Nepotvrzeno': return t('Nepotvrzeno');
    default: return t('Vzato na vědomí');
  }
}

/**
 * Chip stavu: `bad` jen pro „Nepotvrzeno" (tak to chce lib/tresty.stavTrestu), jinak
 * tlumené tóny — trest čte zaměstnanec na telefonu a červená všude by křičela.
 */
export function StavTrestuChip({ trest, size = 'sm' }: { trest: Trest; size?: 'sm' | 'md' }) {
  const t = useT('widgety');
  const s = stavTrestu(trest);
  const ikona = trest.status === 'zruseno' ? 'close' : s.tone === 'bad' ? 'warning' : s.tone === 'wait' ? 'chat' : 'check';
  return <Chip tone={s.tone} size={size} icon={ikona}>{textStavuTrestu(t, trest)}</Chip>;
}

/** Body dolů krátce: „−10 b". */
export const bodyDolu = (t: PrekladFn, n: number): string => t('−{n} b', { n });

/** Dopad do věty: „−10 b · krácení 300 Kč", nebo „Napomenutí" (měna přes formátovač podniku). */
export function dopadTrestu(t: PrekladFn, tr: Pick<Trest, 'points' | 'bonusCut'>, money: (n: number) => string): string {
  if (jeNapomenuti(tr)) return t('Napomenutí');
  const casti: string[] = [];
  if (tr.points) casti.push(bodyDolu(t, tr.points));
  if (tr.bonusCut) casti.push(t('krácení {castka}', { castka: money(tr.bonusCut) }));
  return casti.join(' · ');
}
