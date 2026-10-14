'use client';

// Řádek trestu v seznamech vedení (kolo 10, balík V): widget Tresty v týmu, profil
// člena, detail uzávěrky. Jedna podoba všude: avatar + jméno, den · položka sazebníku
// · kdo dal, text, chip stavu a dopad („−10 b · krácení 300 Kč", nebo Napomenutí).
// Sporný trest nese vyjádření člověka a dvě akce: Trest platí dál / Zrušit trest.
// Platný trest má „···" s Upravit a Zrušit. Zrušený je jen ke čtení — dopad
// přeškrtnutý a „Zrušeno: <poznámka>".
//
// Tón: věcně, bez červené všude — chip `bad` jen pro Nepotvrzeno (stavTrestu z lib).

import React from 'react';
import { cekaSpor, jeNapomenuti, stavTrestu, type Trest } from '@/lib/tresty';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { Avatar, Button, Chip, ListRow, Menu } from '../ui';
import { useMoney } from '../CurrencyProvider';

/**
 * Tón a text chipu stavu — texty z lib/tresty (česky) jako klíče t(). „Vzato na vědomí" je u vedení
 * tlumené, ne zelené: trest vzatý na vědomí není úspěch k oslavě (brief: `bad` jen Nepotvrzeno,
 * jinak tlumené tóny; Nesouhlasí zůstává čekací — vedení na něj má reagovat).
 */
export function chipStavuTrestu(t: PrekladFn, x: Trest): { tone: 'wait' | 'ok' | 'bad' | 'muted'; text: string } {
  const s = stavTrestu(x);
  switch (s.text) {
    case 'Zrušeno': return { tone: s.tone, text: t('Zrušeno') };
    case 'Nesouhlasí': return { tone: s.tone, text: t('Nesouhlasí') };
    case 'Nepotvrzeno': return { tone: s.tone, text: t('Nepotvrzeno') };
    default: return { tone: 'muted', text: t('Vzato na vědomí') };
  }
}

/** „−10 b · krácení 300 Kč", nebo „Napomenutí" (přeložené; měna podniku). */
export function dopadTrestu(t: PrekladFn, x: Pick<Trest, 'points' | 'bonusCut'>, money: (n: number) => string): string {
  if (jeNapomenuti(x)) return t('Napomenutí');
  return [
    x.points ? t('−{n} b', { n: x.points }) : null,
    x.bonusCut ? t('krácení {castka}', { castka: money(x.bonusCut) }) : null,
  ].filter(Boolean).join(' · ');
}

export function TrestRadek({ x, smiUdelit, onPlatiDal, onZrusit, onUpravit, pracuji = false, bezJmena = false, as }: {
  x: Trest;
  /** Divák smí tresty udělovat (tresty.udelit) — sporný řádek dostane akce, platný „···". */
  smiUdelit: boolean;
  onPlatiDal?: (x: Trest) => void;
  onZrusit?: (x: Trest) => void;
  onUpravit?: (x: Trest) => void;
  pracuji?: boolean;
  /** V profilu člena je jméno v nadpisu okna: titulek řádku je text trestu. */
  bezJmena?: boolean;
  as?: 'li' | 'div';
}) {
  const t = useT('widgety');
  const money = useMoney();
  const stav = chipStavuTrestu(t, x);
  const zruseno = x.status === 'zruseno';
  const spor = cekaSpor(x);
  const meta = [
    fmtDatum(x.day, { jazyk: t.jazyk, styl: 'denKratce' }),
    x.typeTitle,
    x.givenByName ? t('dal(a) {kdo}', { kdo: x.givenByName }) : null,
  ].filter(Boolean).join(' · ');
  const vyjadreni = x.response
    ? (x.disputed ? t('Nesouhlasí: {text}', { text: x.response }) : t('Vyjádření: {text}', { text: x.response }))
    : null;
  const zruseni = zruseno ? (x.cancelNote ? t('Zrušeno: {poznamka}', { poznamka: x.cancelNote }) : t('Zrušeno, body i krácení se vrátily.')) : null;
  const dopad = dopadTrestu(t, x, money);
  const stavADopad = (
    <span className="flex flex-wrap items-center justify-end gap-1.5" data-trest-stav={stav.text}>
      <Chip tone={stav.tone} size="sm">{stav.text}</Chip>
      <span className={`text-[13px] font-semibold tabular-nums whitespace-nowrap ${zruseno ? 'line-through text-black/40' : 'text-[#16181A]'}`}>{dopad}</span>
    </span>
  );
  const rozhodnuti = spor && smiUdelit && onPlatiDal && onZrusit;
  // Sporný řádek nese stav i dvě tlačítka pod textem, ne v ocasu: ve střední kartě (půl Přehledu, ~470 px)
  // by chip, dopad a dvě tlačítka vedle sebe smáčkly jméno i text na pár písmen.
  const detail = (
    <>
      {bezJmena ? null : <span className="block text-[#16181A]">{x.text}</span>}
      {vyjadreni && <span className={`block ${spor ? 'text-[#16181A]' : 'text-black/55'}`} data-trest-vyjadreni>{vyjadreni}</span>}
      {zruseni && <span className="block text-black/55">{zruseni}</span>}
      {x.photoUrl && (
        <a href={x.photoUrl} target="_blank" rel="noreferrer" className="inline-block underline underline-offset-2 tap-target-sm">{t('Fotka')}</a>
      )}
      {spor && <span className="mt-1.5 flex [&>span]:justify-start">{stavADopad}</span>}
      {rozhodnuti && (
        <span className="mt-2 flex flex-wrap items-center gap-2">
          {/* Jméno v přístupném názvu: v seznamu je víc stejných tlačítek za sebou. `tap-target` = 44 px na telefonu. */}
          <Button variant="secondary" size="sm" icon="check" loading={pracuji} disabled={pracuji} className="tap-target"
            aria-label={t('Trest platí dál: {jmeno}', { jmeno: x.userName })} onClick={() => onPlatiDal(x)}>{t('Trest platí dál')}</Button>
          <Button variant="danger" size="sm" disabled={pracuji} className="tap-target"
            aria-label={t('Zrušit trest: {jmeno}', { jmeno: x.userName })} onClick={() => onZrusit(x)}>{t('Zrušit trest')}</Button>
        </span>
      )}
    </>
  );
  const maDetail = !bezJmena || !!vyjadreni || !!zruseni || !!x.photoUrl || spor;
  const menu = !rozhodnuti && !zruseno && smiUdelit && onUpravit && onZrusit ? (
    // `!flex-none`: na telefonu by první prvek ocasu natáhlo přes řádek a „···" by stálo vlevo pod textem.
    <span className="!flex-none">
      <Menu size="sm" label={t('Upravit nebo zrušit trest: {jmeno}', { jmeno: x.userName })} items={[
        { label: t('Upravit…'), icon: 'pencil', onClick: () => onUpravit(x) },
        { label: t('Zrušit trest…'), icon: 'close', danger: true, onClick: () => onZrusit(x) },
      ]} />
    </span>
  ) : undefined;
  return (
    <ListRow as={as}
      lead={bezJmena ? undefined : <Avatar emoji={x.userAvatar} name={x.userName} size="sm" />}
      title={bezJmena ? x.text : x.userName || t('Člen týmu')}
      meta={meta}
      detail={maDetail ? detail : undefined}
      akceVRadku
      right={spor ? undefined : stavADopad}
      actions={menu} />
  );
}

export default TrestRadek;
