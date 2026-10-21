'use client';

// Drobné sdílené kusy „Navíc" (kolo 9, N1 — balík Z): pilulky nabídky „Co se dá udělat navíc",
// chip stavu zápisu a text odměny. Jedna podoba pro okno, widget, uzávěrku i tablet.

import type { ReactNode } from 'react';
import { Button, Chip, VolbaRadek, VolbyRadky } from '../ui';
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
 * Nabídka „Co se dá udělat navíc". Každá volba je tlačítko ≥ 44 px (na telefonu i tabletu), text se smí zalomit
 * (na 320 px v polštině by „Zaskočit za kolegu na směnu · 50 b · 300 Kč" jinak přetekl).
 * Vyčerpaný denní limit pilulku vypne a řekne proč.
 */
export function NabidkaChipy({ nabidka, dnesniZapisy = [], vybrane = null, onVyber, money, velke = false, pas = false, vOkne = false, obsazene, label, className = '' }: {
  nabidka: readonly NabidkaNavic[];
  /** Dnešní zápisy člověka — kvůli limitu za den (limitNabidkyVycerpan). */
  dnesniZapisy?: readonly Pick<Navic, 'offerId' | 'status'>[];
  /** Vybraná položka (v okně); jinde null. */
  vybrane?: number | null;
  onVyber: (n: NabidkaNavic) => void;
  money: (n: number) => string;
  /** Tablet: vyšší pilulky (lg). */
  velke?: boolean;
  /**
   * Střední karta widgetu: jeden vodorovný pás, který se posouvá do strany (jako příjemci výplaty
   * v uzávěrce) — tři položky pod sebou by na 390 px vzaly kartě půlku výšky a seznam by zmizel
   * pod „Zobrazit vše". Jinde (okno, velká karta, tablet) řádky L→R pod sebou (VolbaRadek, v4) —
   * dřív zalamované pilulky různé šířky (audit V03).
   */
  pas?: boolean;
  /** V okně: řádky 52 jako pole okna (jinde 44, tablet 52). */
  vOkne?: boolean;
  /**
   * Úkoly za body, které jsou dnes plné (kapacita, kolo 11 — `obsazeneNabidky` z /api/navic/ukoly):
   * pilulka se vypne a řekne „Obsazeno". Vybraná (úprava vlastního zápisu) zůstává zapnutá.
   */
  obsazene?: ReadonlySet<number>;
  label?: ReactNode;
  className?: string;
}) {
  const t = useT('widgety');
  if (nabidka.length === 0) return null;
  const stav = (n: NabidkaNavic) => {
    const je = vybrane === n.id;
    const plno = !je && !!obsazene?.has(n.id);
    const vycerpano = plno || limitNabidkyVycerpan(n, dnesniZapisy);
    const titulek = plno ? t('Obsazeno — dnes to už má někdo vzaté.') : vycerpano ? t('Dnes už zapsané (limit {n}× za den).', { n: n.maxPerDay ?? 1 }) : n.description ?? undefined;
    return { je, plno, vycerpano, titulek };
  };
  if (!pas) {
    // Okno, velká karta, tablet: řádky L→R (VolbaRadek) — název vlevo, odměna vpravo na R.
    return (
      <VolbyRadky className={className} label={label} ariaLabel={t('Co se dá udělat navíc')} data-nabidka-navic="">
        {nabidka.map(n => {
          const { je, plno, vycerpano, titulek } = stav(n);
          const odm = [n.points > 0 ? `${n.points} b` : '', n.bonusCzk ? money(n.bonusCzk) : ''].filter(Boolean).join(' · ');
          return (
            <VolbaRadek key={n.id} vybrano={je} disabled={vycerpano} data-nabidka={n.id} title={titulek}
              ikona={n.autoApprove ? 'check' : 'plus'} onClick={() => onVyber(n)} vyska={vOkne || velke ? 'l' : 'm'} className={velke ? 'text-base' : ''}
              titul={<>{n.title}{plno && <> · {t('Obsazeno')}</>}</>} hodnota={odm} />
          );
        })}
      </VolbyRadky>
    );
  }
  return (
    <div className={`min-w-0 ${className}`} data-nabidka-navic>
      {label && <p className="t-label mb-1.5">{label}</p>}
      {/* Pás zůstává mezi L a R karty (P11 v kartě) — dřív `-mx-1 px-1` vyčuhoval o 4 px přes hranu obsahu. */}
      {/* Od sm, kde je místa dost, je pás řadou rovných dílů L→R (P2) — dřív tři obsahové pilulky vlevo a půl karty prázdné. */}
      <div className="flex gap-2 overflow-x-auto scroll-fade-x scrollbar-none snap-x snap-proximity py-0.5 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] sm:overflow-visible sm:[mask-image:none] sm:[-webkit-mask-image:none]">
        {nabidka.map(n => {
          const { je, plno, vycerpano, titulek } = stav(n);
          return (
            <Button key={n.id} type="button" variant={je ? 'primary' : 'secondary'} size={velke ? 'lg' : 'md'}
              aria-pressed={je} disabled={vycerpano} data-nabidka={n.id}
              title={titulek}
              icon={n.autoApprove ? 'check' : 'plus'}
              onClick={() => onVyber(n)}
              className="shrink-0 snap-start min-h-[44px] sm:w-full sm:min-w-0 sm:whitespace-normal sm:h-auto sm:py-2 sm:text-center">
              {popisekNabidky(n, money)}{plno && <> · {t('Obsazeno')}</>}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
