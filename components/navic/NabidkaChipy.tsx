'use client';

// Drobné sdílené kusy „Navíc" (kolo 9, N1 — balík Z): pilulky nabídky „Co se dá udělat navíc",
// chip stavu zápisu a text odměny. Jedna podoba pro okno, widget, uzávěrku i tablet.

import type { ReactNode } from 'react';
import { Button, Chip } from '../ui';
import { Icon, type IconName } from '../Icons';
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
 * Volba z nabídky / sazebníku v okně (v4, audit V03). Dřív řada `filter-pill` s `flex-wrap`:
 * každá pilulka jiné šířky, na telefonu zalomené pod sebe → zubatý sloupec se třemi pravými
 * hranami a třetí výškou (36) vedle polí 52. Teď řádek L→R jako pole okna (52, rádius pole):
 * název vlevo (smí se zalomit), dopad vpravo na R (`tabular-nums`, P15). Vybraná je inkoustová
 * (`seg-on`), ostatní šedá jamka jako pole. Řádky pod sebou s mezerou 8 (`VolbyRadky`).
 */
export function VolbaRadek({ vybrano, onClick, titul, hodnota, ikona, disabled, title, vyska = 'l', className = '', ...data }: {
  vybrano: boolean;
  /** l = 52 (okno, jako pole okna), m = 44 (karta na ploše — L patří jen oknu, P8). */
  vyska?: 'm' | 'l';
  onClick: () => void;
  titul: ReactNode;
  /** Dopad / odměna vpravo („−10 b", „20 b · 300 Kč"). */
  hodnota?: ReactNode;
  ikona?: IconName;
  disabled?: boolean;
  title?: string;
  className?: string;
} & { [k: `data-${string}`]: string | number | undefined }) {
  return (
    <button type="button" aria-pressed={vybrano} disabled={disabled} title={title} onClick={onClick} {...data}
      className={`flex w-full min-w-0 items-center gap-3 rounded-[var(--r-md)] px-4 py-2.5 ${vyska === 'l' ? 'min-h-[var(--h-l)]' : 'min-h-[var(--h-m)]'} text-left text-[0.9375rem] font-medium leading-snug select-none transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] ${vybrano ? 'seg-on' : 'btn-secondary'} ${className}`}>
      {ikona && <Icon name={ikona} size={18} className="shrink-0" />}
      <span className="min-w-0 flex-1 text-pretty">{titul}</span>
      {hodnota != null && hodnota !== '' && <><span className="sr-only"> · </span><span className="shrink-0 text-right tabular-nums">{hodnota}</span></>}
    </button>
  );
}

/**
 * Díl mřížky voleb (dny v týdnu, Všem / Vybraným, lidé, kategorie): krátká volba se stejnou
 * šířkou jako sousedé (`rada rada-rovne` nebo `grid grid-cols-n`) a výškou pole okna 52.
 * `role="tab"` jen tam, kde nahrazuje přepínač pohledu (aria-selected místo aria-pressed).
 */
export function VolbaDil({ vybrano, onClick, children, role, disabled, title, className = '', ...data }: {
  vybrano: boolean; onClick: () => void; children: ReactNode; role?: 'tab'; disabled?: boolean; title?: string; className?: string;
} & { [k: `data-${string}`]: string | number | undefined }) {
  const stav = role === 'tab' ? { role, 'aria-selected': vybrano } : { 'aria-pressed': vybrano };
  return (
    <button type="button" {...stav} disabled={disabled} title={title} onClick={onClick} {...data}
      className={`flex min-w-0 items-center justify-center rounded-[var(--r-md)] px-2 min-h-[var(--h-l)] text-center text-sm font-medium leading-tight select-none transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] ${vybrano ? 'seg-on' : 'btn-secondary'} ${className}`}>
      <span className="min-w-0 text-pretty [overflow-wrap:anywhere]">{children}</span>
    </button>
  );
}

/** Skupina voleb pod sebou: štítek → 6 → řádky L→R s mezerou 8. */
export function VolbyRadky({ label, ariaLabel, children, className = '', ...data }: {
  label?: ReactNode; ariaLabel: string; children: ReactNode; className?: string;
} & { [k: `data-${string}`]: string | number | undefined }) {
  return (
    <div className={`min-w-0 ${className}`} {...data}>
      {label && <p className="field-label">{label}</p>}
      <div className="sloupec sloupec-2" role="group" aria-label={ariaLabel}>{children}</div>
    </div>
  );
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
      <div className="flex gap-2 overflow-x-auto scroll-fade-x scrollbar-none snap-x snap-proximity -mx-1 px-1 py-0.5">
        {nabidka.map(n => {
          const { je, plno, vycerpano, titulek } = stav(n);
          return (
            <Button key={n.id} type="button" variant={je ? 'primary' : 'secondary'} size={velke ? 'lg' : 'md'}
              aria-pressed={je} disabled={vycerpano} data-nabidka={n.id}
              title={titulek}
              icon={n.autoApprove ? 'check' : 'plus'}
              onClick={() => onVyber(n)}
              className="shrink-0 snap-start min-h-[44px]">
              {popisekNabidky(n, money)}{plno && <> · {t('Obsazeno')}</>}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
