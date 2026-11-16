'use client';

// Drobné sdílené kusy „Tresty" (kolo 10, balík Z): chip stavu a dopad trestu do věty.
// Jedna podoba pro widget Moje tresty i okno DetailTrestu. Texty z lib/tresty
// (stavTrestu, trestText) jsou české klíče — tady se překládají výslovně, ať je
// check-i18n vidí (čte jen t('…')).

import { Chip } from '../ui';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { jeNapomenuti, stavTrestu, type Trest } from '@/lib/tresty';
import { stavSrazky, type SrazkaTrestu, type StavSrazky } from '@/lib/trestyPenize';

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

/** Dopad do věty: „−10 b · krácení 300 Kč · srážka 1 500 Kč (čeká na souhlas)", nebo „Napomenutí" (měna přes formátovač podniku). */
export function dopadTrestu(t: PrekladFn, tr: Pick<Trest, 'points' | 'bonusCut'> & { penize?: Trest['penize'] }, money: (n: number) => string): string {
  if (jeNapomenutiSPenezi(tr)) return t('Napomenutí');
  const casti: string[] = [];
  if (tr.points) casti.push(bodyDolu(t, tr.points));
  if (tr.bonusCut) casti.push(t('krácení {castka}', { castka: money(tr.bonusCut) }));
  for (const s of tr.penize?.srazky ?? []) if (s.stav !== 'zruseno') casti.push(srazkaKratce(t, s, money));
  return casti.join(' · ');
}

/** Napomenutí = bez bodů, bez krácení a bez srážky (lib/tresty.jeNapomenuti srážky nezná). */
export const jeNapomenutiSPenezi = (tr: Pick<Trest, 'points' | 'bonusCut'> & { penize?: Trest['penize'] }): boolean =>
  jeNapomenuti(tr) && !(tr.penize?.srazky ?? []).some(s => s.stav !== 'zruseno');

/** „srážka 1 500 Kč (čeká na souhlas)" — jedna srážka / náhrada do věty, přeložená. */
export function srazkaKratce(t: PrekladFn, s: Pick<SrazkaTrestu, 'druh' | 'castka' | 'stav'>, money: (n: number) => string): string {
  const castka = money(s.castka);
  if (s.druh === 'nahrada') {
    return s.stav === 'ceka' ? t('náhrada {castka} (čeká na souhlas)', { castka }) : s.stav === 'nesouhlas' ? t('náhrada {castka} (nesouhlas)', { castka }) : t('náhrada {castka}', { castka });
  }
  return s.stav === 'ceka' ? t('srážka {castka} (čeká na souhlas)', { castka }) : s.stav === 'nesouhlas' ? t('srážka {castka} (nesouhlas)', { castka }) : t('srážka {castka}', { castka });
}

/** Text chipu stavu srážky z pohledu zaměstnance (lib/trestyPenize.stavSrazky dává tón). */
export function textStavuSrazky(t: PrekladFn, stav: StavSrazky): string {
  switch (stav) {
    case 'ceka': return t('Čeká na tvůj souhlas');
    case 'uplatneno': return t('Uplatněno');
    case 'nesouhlas': return t('Nesouhlasíš');
    default: return t('Zrušeno');
  }
}

/** Chip stavu srážky: čeká = wait, uplatněno = ok, nesouhlas tlumeně (je to tvoje rozhodnutí, ne chyba), zrušeno muted. */
export function StavSrazkyChip({ stav, size = 'sm' }: { stav: StavSrazky; size?: 'sm' | 'md' }) {
  const t = useT('widgety');
  const s = stavSrazky(stav);
  const tone = stav === 'nesouhlas' ? 'muted' : s.tone;
  const ikona = stav === 'ceka' ? 'clock' : stav === 'uplatneno' ? 'check' : stav === 'nesouhlas' ? 'chat' : 'close';
  return <Chip tone={tone} size={size} icon={ikona}>{textStavuSrazky(t, stav)}</Chip>;
}
