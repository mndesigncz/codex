'use client';

// Detail úkolu: celé zadání na jednom místě (popis, kdo, kdy, priorita, opakování, zdroj, kroky, kdo a kdy ho splnil).
// Seznam ukazuje jen řádek; tohle okno je pro „co přesně mám udělat" a pro akce, které se do řádku nevejdou.
// Společné pro Úkoly vedení i zaměstnance — co smí divák udělat, určují předané akce (bez akce se tlačítko nekreslí).
// Kolo 9 (N1): „Zapsat jako navíc" — úkol, který člověk udělal nad rámec (za kolegu, mimo svůj rozpis), jde
// jedním klepnutím zapsat jako „navíc" s názvem úkolu a vazbou taskId; vidí ho každý s navic.zapsat.

import { useState, type ReactNode } from 'react';
import { Button, Chip, Modal, Rada } from '../ui';
import { useSmi } from '../widgety/NavigaceKontext';
import { ZapsatNavic } from '../navic/ZapsatNavic';
import { TaskChecklist, recurrenceLabel, type ChecklistItem } from '../TaskChecklist';
import { ChipPredUzaverkou } from '../PredUzaverkou';
import { Poznamky } from '../Poznamky';
import { useT } from '@/lib/i18n/client';
import { aktualniJazyk } from '@/lib/i18n/stav';
import { jeHotovy, jePoTerminu, type Ukol } from '@/lib/ukolyPrehled';
import { postupChecklistu, poCase } from '@/lib/ukolyFiltr';
import { dayPlus, pragueDaySafe, pragueHM } from '@/lib/pragueTime';
import { fmtHM } from '@/lib/i18n/format';
import { TlacitkoHodnotitSmenu, useSmiHodnotitSmenu } from '../hodnoceni-smeny/TlacitkoHodnotitSmenu';

const prioTon = (p: string): 'bad' | 'wait' | 'muted' => (p === 'high' ? 'bad' : p === 'medium' ? 'wait' : 'muted');

export function UkolDetail({ ukol, dnes, kdo, navodHref, onClose, onSplnit, onStav, onUpravit, onSmazat, onOdlozit, onChecklist, onChecklistVse, zamceno }: {
  ukol: Ukol;
  dnes: string;
  /** Komu úkol patří (jméno nebo odkaz na člověka). */
  kdo: ReactNode;
  navodHref?: string;
  onClose: () => void;
  /** Označit jako hotový / vrátit zpět; chybí, když divák úkol splnit nesmí. */
  onSplnit?: (hotovo: boolean) => void;
  /** Kolo 7: „Začít" — úkol přejde do Probíhá (vedení i zaměstnanec stejně); chybí, když divák úkol plnit nesmí. */
  onStav?: (status: 'in_progress') => void;
  onUpravit?: () => void;
  onSmazat?: () => void;
  /** Přesune termín na jiný den (jen kdo smí úkol upravit); nabízí se u nehotového úkolu. */
  onOdlozit?: (den: string) => void;
  onChecklist?: (index: number) => void;
  onChecklistVse?: (hotovo: boolean) => void;
  zamceno?: boolean;
}) {
  const t = useT('widgety');
  const loc = aktualniJazyk();
  const smi = useSmi();
  const [navic, setNavic] = useState(false);
  // Hodnocení směny, na které se úkol dělal (den splnění, jinak termín — jen dnešní a starší).
  const smiHodnotitSmenu = useSmiHodnotitSmenu();
  const hotovo = jeHotovy(ukol);
  const denSmeny = (() => {
    const d = (hotovo && ukol.completedAt && pragueDaySafe(ukol.completedAt)) || ukol.dueDate || null;
    return d && d <= dnes ? d : null;
  })();
  const poTerminu = jePoTerminu(ukol, dnes);
  // Kolo 7: dnešní úkol, jehož čas termínu minul (okno je otevřené krátce — stačí čas při vykreslení).
  const poCasu = poCase(ukol, dnes, pragueHM());
  const casTerminu = ukol.dueDate && ukol.dueTime ? fmtHM(ukol.dueTime) : null;
  const den = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const cas = (iso: string) => new Date(iso).toLocaleString(loc, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' });
  const opakovani = recurrenceLabel(ukol.recurrence);
  const postup = postupChecklistu(ukol);
  const priorita = ukol.priority === 'high' ? t('Vysoká priorita') : ukol.priority === 'low' ? t('Nízká priorita') : t('Střední priorita');

  const terminPopis = (() => {
    if (!ukol.dueDate) return t('Bez termínu');
    const doCasu = casTerminu ? ` · ${t('do {cas}', { cas: casTerminu })}` : '';
    if (hotovo) return `${den(ukol.dueDate)}${doCasu}`;
    if (ukol.dueDate === dnes) return `${den(ukol.dueDate)} · ${casTerminu ? t('dnes do {cas}', { cas: casTerminu }) : t('dnes')}${poCasu ? ` · ${t('po čase')}` : ''}`;
    if (ukol.dueDate === dayPlus(dnes, 1)) return `${den(ukol.dueDate)} · ${casTerminu ? t('zítra do {cas}', { cas: casTerminu }) : t('zítra')}`;
    return `${den(ukol.dueDate)}${doCasu}${poTerminu ? ` · ${t('po termínu')}` : ''}`;
  })();

  const radek = (nazev: string, hodnota: ReactNode) => (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2 text-[14px]">
      <dt className="text-black/50">{nazev}</dt>
      <dd className="min-w-0 text-[#16181A] text-pretty">{hodnota}</dd>
    </div>
  );

  return (
    <Modal open onClose={onClose} size="lg" title={ukol.title}
      subtitle={hotovo ? t('Hotovo') : poTerminu ? t('Po termínu') : t('Čeká na splnění')}
      footer={(() => {
        // v4 (V5, V6): vedlejší akce rovným dílem v jedné řadě 52, pod nimi hlavní L→R × 52.
        // Dřív pět tlačítek různé šířky zalomených do tří řad (tiché vlevo, Upravit vpravo).
        const vedlejsi = [
          onUpravit && <Button key="upravit" variant="secondary" icon="pencil" onClick={onUpravit}>{t('Upravit')}</Button>,
          onOdlozit && !hotovo && <Button key="odlozit" variant="secondary" icon="clock" onClick={() => onOdlozit(dayPlus(ukol.dueDate && ukol.dueDate > dnes ? ukol.dueDate : dnes, 1))}>{ukol.dueDate && ukol.dueDate > dnes ? t('Odložit o den') : t('Odložit na zítra')}</Button>,
          onStav && !zamceno && !hotovo && ukol.status !== 'in_progress' && <Button variant="secondary" icon="play" key="zacit" onClick={() => onStav('in_progress')}>{t('Začít')}</Button>,
        ].filter(Boolean);
        const hlavni = onSplnit && !zamceno ? (hotovo
          ? <Button variant="secondary" icon="undo" onClick={() => onSplnit(false)}>{t('Vrátit mezi nehotové')}</Button>
          : <Button variant="primary" icon="check" onClick={() => onSplnit(true)}>{t('Označit jako hotový')}</Button>) : null;
        if (!vedlejsi.length && !hlavni) return undefined;
        return (
          <div className="sloupec sloupec-2 w-full">
            {vedlejsi.length > 0 && <Rada vyska="l">{vedlejsi}</Rada>}
            {hlavni && <Rada vyska="l">{hlavni}</Rada>}
          </div>
        );
      })()}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={prioTon(ukol.priority)} size="sm">{priorita}</Chip>
          {poTerminu && <Chip tone="bad" size="sm" icon="clock">{t('Po termínu')}</Chip>}
          {ukol.status === 'in_progress' && !hotovo && <Chip tone="info" size="sm">{t('Probíhá')}</Chip>}
          {ukol.source === 'production' && <Chip tone="info" size="sm" icon="leaf">{t('Výroba')}</Chip>}
          {opakovani && <Chip tone="muted" size="sm" icon="refresh">{opakovani}</Chip>}
          {ukol.requireBeforeClosing && !hotovo && <ChipPredUzaverkou />}
        </div>

        {ukol.description
          ? <p className="text-[15px] text-black/75 whitespace-pre-wrap text-pretty">{ukol.description}</p>
          : <p className="t-meta">{t('Úkol nemá popis.')}</p>}

        <dl className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
          {radek(t('Komu'), ukol.teamTask ? t('Kdokoli z týmu') : kdo)}
          {radek(t('Termín'), <span className={poTerminu || poCasu ? 'text-bad-ink font-medium' : undefined}>{terminPopis}</span>)}
          {ukol.createdAt && radek(t('Založeno'), cas(ukol.createdAt))}
          {hotovo && ukol.completedAt && radek(t('Splněno'), <>{cas(ukol.completedAt)}{ukol.completedByName ? ` · ${ukol.completedByName}` : ''}</>)}
          {hotovo && !ukol.completedAt && ukol.completedByName && radek(t('Splnil'), ukol.completedByName)}
          {navodHref && radek(t('Návod'), <a href={navodHref} className="btn btn-ghost btn-sm -my-1"><span className="truncate max-w-[16rem]">{ukol.sourceMeta?.guideTitle ?? t('Otevřít návod')}</span></a>)}
        </dl>

        {/* Kolo 7: fotka jako důkaz splnění — pod řádkem Splněno, klepnutí otevře plnou velikost. */}
        {ukol.completionPhoto && (
          <div>
            <p className="t-label">{t('Fotka ze splnění')}</p>
            <a href={ukol.completionPhoto} target="_blank" rel="noopener noreferrer" title={t('Otevřít fotku v plné velikosti')}
              className="mt-1.5 inline-block max-w-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ukol.completionPhoto} alt={t('Fotka ze splnění úkolu {nazev}', { nazev: ukol.title })} loading="lazy"
                className="block rounded-2xl max-h-64 w-auto max-w-full" />
            </a>
          </div>
        )}

        {postup != null && (
          <div>
            <p className="t-label">{t('Kroky')} · {postup} %</p>
            <TaskChecklist items={ukol.checklist as ChecklistItem[]} velky onToggle={onChecklist} onToggleAll={onChecklistVse} />
          </div>
        )}

        {/* Co k úkolu řekli ostatní („dodavatel vozí až po 10:00") — vidí a píše každý, kdo úkol vidí. */}
        <Poznamky typ="task" id={ukol.id} className="pt-2" />

        {/* Tiché akce na konci obsahu jako řádková tlačítka ½ + ½ (V5: destruktivní poslední, červený text). */}
        {(onSmazat || smi('navic.zapsat') || (smiHodnotitSmenu && denSmeny)) && (
          <Rada vyska="m" className="pt-2">
            {smi('navic.zapsat') && <Button variant="ghost" icon="sparkle" onClick={() => setNavic(true)} data-ukol-navic>{t('Zapsat jako navíc')}</Button>}
            {smiHodnotitSmenu && denSmeny && <TlacitkoHodnotitSmenu den={denSmeny} clovek={ukol.completedBy ?? ukol.assignedTo ?? null} variant="ghost" size="md" />}
            {onSmazat && <Button variant="ghost" icon="trash" className="!text-[var(--bad-ink)]" onClick={onSmazat}>{t('Smazat')}</Button>}
          </Rada>
        )}
      </div>
      {/* Okno „navíc" nad detailem: název úkolu jako text, den splnění (nebo dnešek), vazba na úkol. */}
      <ZapsatNavic open={navic} onClose={() => setNavic(false)}
        predvolby={{ text: ukol.title, taskId: ukol.id, day: (hotovo && ukol.completedAt && pragueDaySafe(ukol.completedAt)) || dnes }} />
    </Modal>
  );
}
