'use client';

// Detail úkolu: celé zadání na jednom místě (popis, kdo, kdy, priorita, opakování, zdroj, kroky, kdo a kdy ho splnil).
// Seznam ukazuje jen řádek; tohle okno je pro „co přesně mám udělat" a pro akce, které se do řádku nevejdou.
// Společné pro Úkoly vedení i zaměstnance — co smí divák udělat, určují předané akce (bez akce se tlačítko nekreslí).

import type { ReactNode } from 'react';
import { Button, Chip, Modal } from '../ui';
import { TaskChecklist, recurrenceLabel, type ChecklistItem } from '../TaskChecklist';
import { ChipPredUzaverkou } from '../PredUzaverkou';
import { useT } from '@/lib/i18n/client';
import { aktualniJazyk } from '@/lib/i18n/stav';
import { jeHotovy, jePoTerminu, type Ukol } from '@/lib/ukolyPrehled';
import { postupChecklistu } from '@/lib/ukolyFiltr';
import { dayPlus } from '@/lib/pragueTime';

const prioTon = (p: string): 'bad' | 'wait' | 'muted' => (p === 'high' ? 'bad' : p === 'medium' ? 'wait' : 'muted');

export function UkolDetail({ ukol, dnes, kdo, navodHref, onClose, onSplnit, onUpravit, onSmazat, onOdlozit, onChecklist, onChecklistVse, zamceno }: {
  ukol: Ukol;
  dnes: string;
  /** Komu úkol patří (jméno nebo odkaz na člověka). */
  kdo: ReactNode;
  navodHref?: string;
  onClose: () => void;
  /** Označit jako hotový / vrátit zpět; chybí, když divák úkol splnit nesmí. */
  onSplnit?: (hotovo: boolean) => void;
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
  const hotovo = jeHotovy(ukol);
  const poTerminu = jePoTerminu(ukol, dnes);
  const den = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const cas = (iso: string) => new Date(iso).toLocaleString(loc, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' });
  const opakovani = recurrenceLabel(ukol.recurrence);
  const postup = postupChecklistu(ukol);
  const priorita = ukol.priority === 'high' ? t('Vysoká priorita') : ukol.priority === 'low' ? t('Nízká priorita') : t('Střední priorita');

  const terminPopis = (() => {
    if (!ukol.dueDate) return t('Bez termínu');
    if (hotovo) return den(ukol.dueDate);
    if (ukol.dueDate === dnes) return `${den(ukol.dueDate)} · ${t('dnes')}`;
    if (ukol.dueDate === dayPlus(dnes, 1)) return `${den(ukol.dueDate)} · ${t('zítra')}`;
    return `${den(ukol.dueDate)}${poTerminu ? ` · ${t('po termínu')}` : ''}`;
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
      footer={<>
        {onSmazat && <Button variant="ghost" icon="trash" className="mr-auto hover:!text-[var(--bad-ink)]" onClick={onSmazat}>{t('Smazat')}</Button>}
        {onUpravit && <Button variant="secondary" icon="pencil" onClick={onUpravit}>{t('Upravit')}</Button>}
        {onOdlozit && !hotovo && <Button variant="secondary" icon="clock" onClick={() => onOdlozit(dayPlus(ukol.dueDate && ukol.dueDate > dnes ? ukol.dueDate : dnes, 1))}>{ukol.dueDate && ukol.dueDate > dnes ? t('Odložit o den') : t('Odložit na zítra')}</Button>}
        {onSplnit && !zamceno && (hotovo
          ? <Button variant="secondary" icon="undo" onClick={() => onSplnit(false)}>{t('Vrátit mezi nehotové')}</Button>
          : <Button variant="primary" icon="check" onClick={() => onSplnit(true)}>{t('Označit jako hotový')}</Button>)}
      </>}>
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
          {radek(t('Termín'), <span className={poTerminu ? 'text-bad-ink font-medium' : undefined}>{terminPopis}</span>)}
          {ukol.createdAt && radek(t('Založeno'), cas(ukol.createdAt))}
          {hotovo && ukol.completedAt && radek(t('Splněno'), <>{cas(ukol.completedAt)}{ukol.completedByName ? ` · ${ukol.completedByName}` : ''}</>)}
          {hotovo && !ukol.completedAt && ukol.completedByName && radek(t('Splnil'), ukol.completedByName)}
          {navodHref && radek(t('Návod'), <a href={navodHref} className="btn btn-ghost btn-sm -my-1"><span className="truncate max-w-[16rem]">{ukol.sourceMeta?.guideTitle ?? t('Otevřít návod')}</span></a>)}
        </dl>

        {postup != null && (
          <div>
            <p className="t-label">{t('Kroky')} · {postup} %</p>
            <TaskChecklist items={ukol.checklist as ChecklistItem[]} velky onToggle={onChecklist} onToggleAll={onChecklistVse} />
          </div>
        )}
      </div>
    </Modal>
  );
}
