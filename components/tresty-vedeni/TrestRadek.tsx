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
import { Avatar, Button, Chip, ListRow, Menu, Rada, type MenuItem } from '../ui';
import type { SrazkaTrestu } from '@/lib/trestyPenize';
import { useMoney } from '../CurrencyProvider';
import { akceSrazky, platneSrazky } from './penize';
import { PenizeVRadku } from './PenizeRadku';

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

/**
 * „−10 b · krácení 300 Kč", nebo „Napomenutí" (přeložené; měna podniku). Kolo 96: s `penize`
 * přibudou platné srážky a náhrady („srážka 500 Kč") — trest jen se srážkou napomenutí není.
 */
export function dopadTrestu(t: PrekladFn, x: Pick<Trest, 'points' | 'bonusCut'> & Partial<Pick<Trest, 'penize'>>, money: (n: number) => string): string {
  const srazky = platneSrazky(x.penize).filter(s => s.stav !== 'nesouhlas');
  if (jeNapomenuti(x) && !srazky.length) return t('Napomenutí');
  return [
    x.points ? t('−{n} b', { n: x.points }) : null,
    x.bonusCut ? t('krácení {castka}', { castka: money(x.bonusCut) }) : null,
    ...srazky.map(s => (s.druh === 'nahrada' ? t('náhrada škody {castka}', { castka: money(s.castka) }) : t('srážka {castka}', { castka: money(s.castka) }))),
  ].filter(Boolean).join(' · ');
}

/** Akce nad srážkou z menu řádku. */
export type AkceSrazky = 'snizit' | 'zrusit' | 'znovu';

export function TrestRadek({ x, smiUdelit, onPlatiDal, onZrusit, onUpravit, pracuji = false, bezJmena = false, as, davka, smiPenize = false, onSrazka, onZaskok }: {
  x: Trest;
  /** Kolik lidí má hromadný trest (batchId) v seznamu — „Hromadný trest · 3 lidí". */
  davka?: number;
  /** Divák smí peníze (finance.mzdy) — menu dostane akce nad srážkou a záskokem. */
  smiPenize?: boolean;
  onSrazka?: (x: Trest, s: SrazkaTrestu, akce: AkceSrazky) => void;
  onZaskok?: (x: Trest) => void;
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
      <PenizeVRadku x={x} davka={davka} />
      {x.photoUrl && (
        <a href={x.photoUrl} target="_blank" rel="noreferrer" className="inline-block underline underline-offset-2 tap-target-sm">{t('Fotka')}</a>
      )}
      {spor && <span className="mt-1.5 flex [&>span]:justify-start">{stavADopad}</span>}
      {rozhodnuti && (
        // Pár akcí ½ + ½ (P12) na ose textu, stejná výška — dřív dvě obsahové šířky vlevo.
        <Rada vyska="s" className="mt-2 sm:max-w-[24rem]">
          {/* Jméno v přístupném názvu: v seznamu je víc stejných tlačítek za sebou. `tap-target` = 44 px na telefonu. */}
          <Button variant="secondary" size="sm" icon="check" loading={pracuji} disabled={pracuji} className="tap-target max-sm:[&>svg]:hidden"
            aria-label={t('Trest platí dál: {jmeno}', { jmeno: x.userName })} onClick={() => onPlatiDal(x)}>{t('Trest platí dál')}</Button>
          <Button variant="danger" size="sm" disabled={pracuji} className="tap-target"
            aria-label={t('Zrušit trest: {jmeno}', { jmeno: x.userName })} onClick={() => onZrusit(x)}>{t('Zrušit trest')}</Button>
        </Rada>
      )}
    </>
  );
  const srazky = platneSrazky(x.penize);
  const maDetail = !bezJmena || !!vyjadreni || !!zruseni || !!x.photoUrl || spor || srazky.length > 0 || !!x.batchId
    || !!x.penize?.zaskok.prevody.some(p => p.stav === 'plati');
  // Kolo 96: akce nad penězi (finance.mzdy) — snížit / zrušit srážku, znovu o souhlas, změnit záskok.
  const kolik = (c: number) => (srazky.length > 1 ? ` (${money(c)})` : '');
  const polozkyPenez: MenuItem[] = smiPenize && !zruseno && onSrazka ? srazky.flatMap(s => {
    const a = akceSrazky(s, x.status === 'plati');
    return [
      ...(a.znovu ? [{ label: t('Znovu požádat o souhlas') + kolik(s.castka), icon: 'refresh', onClick: () => onSrazka(x, s, 'znovu') }] : []),
      ...(a.snizit ? [{ label: t('Snížit srážku…') + kolik(s.castka), icon: 'minus', onClick: () => onSrazka(x, s, 'snizit') }] : []),
      ...(a.zrusit ? [{ label: t('Zrušit srážku…') + kolik(s.castka), icon: 'close', onClick: () => onSrazka(x, s, 'zrusit') }] : []),
    ];
  }) : [];
  const strhava = !!x.penize && (x.penize.kraceni > 0 || srazky.some(s => s.stav !== 'nesouhlas'));
  if (smiPenize && !zruseno && onZaskok && strhava) polozkyPenez.push({ label: t('Změnit záskok…'), icon: 'swap', onClick: () => onZaskok(x) });
  const menu = !rozhodnuti && !zruseno && smiUdelit && onUpravit && onZrusit ? (
    // `!flex-none`: na telefonu by první prvek ocasu natáhlo přes řádek a „···" by stálo vlevo pod textem.
    <span className="!flex-none">
      <Menu size="sm" label={t('Upravit nebo zrušit trest: {jmeno}', { jmeno: x.userName })} items={[
        { label: t('Upravit…'), icon: 'pencil', onClick: () => onUpravit(x) },
        ...polozkyPenez,
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
      // v4: na telefonu jde stav do druhého řádku na OSE TEXTU — ListRow to dělá sám.
      right={spor ? undefined : stavADopad}
      actions={menu} />
  );
}

export default TrestRadek;
