'use client';

// Řádek zápisu „navíc" v seznamech vedení (kolo 9, balík V): widget Navíc v týmu,
// profil člena, detail uzávěrky. Jedna podoba všude: avatar + jméno, den · z nabídky
// · kdo zapsal, text, chip stavu a odměna; u čekajícího inline Uznat / Odmítnout.
// Odmítnutý nese důvod, uznaný poznámku vedení.

import React from 'react';
import { odmenaText, type Navic, type StavNavic } from '@/lib/navic';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { Avatar, Button, Chip, ListRow } from '../ui';
import { useMoney } from '../CurrencyProvider';

/** Tón a text chipu stavu — texty jako klíče t() (lib/navic stavNavic je nese česky). */
export function chipStavu(t: PrekladFn, s: StavNavic): { tone: 'wait' | 'ok' | 'bad'; text: string } {
  if (s === 'ceka') return { tone: 'wait', text: t('Čeká na uznání') };
  if (s === 'uznano') return { tone: 'ok', text: t('Uznáno') };
  return { tone: 'bad', text: t('Odmítnuto') };
}

/** „+20 b · 200 Kč", nebo „bez odměny" (přeložené). */
export function textOdmeny(t: PrekladFn, z: Pick<Navic, 'points' | 'bonusCzk'>, money: (n: number) => string): string {
  return z.points || z.bonusCzk ? odmenaText(z, money) : t('bez odměny');
}

export function NavicRadek({ z, smiUznat, onUznat, onOdmitnout, pracuji = false, bezJmena = false, as }: {
  z: Navic;
  /** Divák smí rozhodovat (navic.uznat) — čekající řádek dostane Uznat / Odmítnout. */
  smiUznat: boolean;
  onUznat?: (z: Navic) => void;
  onOdmitnout?: (z: Navic) => void;
  pracuji?: boolean;
  /** V profilu člena je jméno v nadpisu okna: titulek řádku je text zápisu. */
  bezJmena?: boolean;
  as?: 'li' | 'div';
}) {
  const t = useT('widgety');
  const money = useMoney();
  const stav = chipStavu(t, z.status);
  const den = fmtDatum(z.day, { jazyk: t.jazyk, styl: 'denKratce' });
  const meta = [
    den,
    z.offerTitle ? t('z nabídky: {nazev}', { nazev: z.offerTitle }) : null,
    z.reportedByName && z.reportedBy !== z.userId ? t('zapsal(a) {kdo}', { kdo: z.reportedByName }) : null,
  ].filter(Boolean).join(' · ');
  const poznamka = z.status === 'odmitnuto' && z.decisionNote ? t('Důvod: {text}', { text: z.decisionNote })
    : z.status === 'uznano' && z.decisionNote ? z.decisionNote : null;
  const detail = (
    <>
      {bezJmena ? null : <span className="block text-[#16181A]">{z.text}</span>}
      {poznamka && <span className="block text-black/55">{poznamka}</span>}
      {z.photoUrl && (
        <a href={z.photoUrl} target="_blank" rel="noreferrer" className="inline-block underline underline-offset-2 tap-target-sm">{t('Fotka')}</a>
      )}
    </>
  );
  const ceka = z.status === 'ceka';
  return (
    <ListRow as={as}
      lead={bezJmena ? undefined : <Avatar emoji={z.userAvatar} name={z.userName} size="sm" />}
      title={bezJmena ? z.text : z.userName || t('Člen týmu')}
      meta={meta}
      detail={bezJmena && !poznamka && !z.photoUrl ? undefined : detail}
      right={(
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          <Chip tone={stav.tone} size="sm">{stav.text}</Chip>
          {z.status === 'uznano' && <span className="text-[13px] font-semibold tabular-nums text-[#16181A] whitespace-nowrap">{textOdmeny(t, z, money)}</span>}
          {ceka && z.pointsProposed != null && z.pointsProposed > 0 && <span className="t-meta whitespace-nowrap">{t('návrh +{n} b', { n: z.pointsProposed })}</span>}
        </span>
      )}
      actions={ceka && smiUznat && onUznat && onOdmitnout ? (
        <>
          {/* Jméno v přístupném názvu: v seznamu je víc stejných tlačítek za sebou. */}
          {/* `tap-target`: malé tlačítko (36 px) dostane na telefonu dotykovou plochu 44 px. */}
          <Button variant="primary" size="sm" icon="check" loading={pracuji} disabled={pracuji} className="tap-target"
            aria-label={t('Uznat: {jmeno}', { jmeno: z.userName })} onClick={() => onUznat(z)}>{t('Uznat')}</Button>
          <Button variant="danger" size="sm" disabled={pracuji} className="tap-target"
            aria-label={t('Odmítnout: {jmeno}', { jmeno: z.userName })} onClick={() => onOdmitnout(z)}>{t('Odmítnout')}</Button>
        </>
      ) : undefined} />
  );
}

export default NavicRadek;
