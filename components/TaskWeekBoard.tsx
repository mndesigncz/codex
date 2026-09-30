'use client';

// Týdenní tabule úkolů: sloupce jsou dny, karta je úkol. Přetažením karty na
// jiný den se změní termín (jen vedení, přes onMove).
//
// Kolo 69 (balík B6a): tabule se kreslí v nástroji Úkolů i ve widgetu Úkoly na
// týden, a proto mluví jazykem zbytku aplikace. Dřív byly sloupce sklo jako
// karta, úkoly šedé dlaždice, dnešek limetkový prstenec, počty ruční pilulky
// a opakování znak „↻" (audit obsah-kontrola). Teď: sloupec = jamka (Well),
// úkol = bílá karta, dnešek a počet přes Chip, opakování ikonou, šipky týdne
// jako Button. Dnešek se bere z pražského dne, ne z hodin prohlížeče.
//
// Přesun má vedle tažení i tlačítko na kartě, které otevře volbu dne: HTML5 drag
// na dotyku nefunguje a z klávesnice se nedá spustit vůbec, takže tablet a
// klávesnice by přesun, který tabule nabízí, neměly jak udělat (review kola 69,
// DP §5.5). Volba je okno, ne rozbalovací menu — tabule je vodorovně posuvná
// a absolutně umístěný panel by v ní uřízl okraj sloupce.

import { useMemo, useState } from 'react';
import { Icon } from './Icons';
import { Button, Chip, Modal } from './ui';
import { recurrenceLabel } from './TaskChecklist';
import { ChipPredUzaverkou } from './PredUzaverkou';
import { pragueToday } from '@/lib/pragueTime';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { denSCislem, zkratkyDnuOdNedele } from '@/lib/weekJazyk';

export type BoardTask = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  recurrence?: string | null;
  teamTask?: boolean;
  completedByName?: string | null;
  /** Zamyká uzávěrku dne, dokud není hotový — karta nese štítek se zámkem. */
  requireBeforeClosing?: boolean;
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const prioDot = (p: string) => p === 'high' ? 'bg-bad' : p === 'medium' ? 'bg-wait' : 'bg-[#C8F542]';

export default function TaskWeekBoard({ tasks, weekStart, onComplete, labelFor, onOpen, onMove, onAddForDay, canComplete, canMove }: {
  tasks: BoardTask[];
  weekStart: number;
  onComplete: (t: BoardTask, done: boolean) => void;
  labelFor?: (t: BoardTask) => string;
  onOpen?: (t: BoardTask) => void;
  onMove?: (t: BoardTask, date: string) => void;
  onAddForDay?: (date: string) => void;
  /** Smí divák úkol odškrtnout (cizí úkol bez ukoly.plnit ne) — bez toho platí „každý". */
  canComplete?: (t: BoardTask) => boolean;
  /** Smí divák kartu přetáhnout na jiný den (cizí úkol bez ukoly.upravit ne) — bez toho každou. */
  canMove?: (t: BoardTask) => boolean;
}) {
  const t = useT('rozvrh');
  const { jazyk } = useJazyk();
  const WD = zkratkyDnuOdNedele(jazyk);
  const [offset, setOffset] = useState(0);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const today = pragueToday();

  const days = useMemo(() => {
    const base = new Date(`${today}T12:00:00`);
    const toStart = (base.getDay() - weekStart + 7) % 7;
    const start = new Date(base);
    start.setDate(base.getDate() - toStart + offset * 7);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [weekStart, offset, today]);

  const byDay = useMemo(() => {
    const m = new Map<string, BoardTask[]>();
    for (const uk of tasks) if (uk.dueDate) (m.get(uk.dueDate) ?? m.set(uk.dueDate, []).get(uk.dueDate)!).push(uk);
    return m;
  }, [tasks]);

  const drop = (key: string) => {
    setDragOver(null);
    if (dragId == null) return;
    const uk = tasks.find(x => x.id === dragId);
    setDragId(null);
    if (uk && uk.dueDate !== key) onMove?.(uk, key);
  };

  // Cíle přesunu: dny zobrazeného týdne a tentýž den o týden dál (karta je vidět
  // jen ve svém týdnu, takže to pokryje každý rozumný posun).
  const [presouvany, setPresouvany] = useState<BoardTask | null>(null);
  const presun = (uk: BoardTask, den: string) => {
    setPresouvany(null);
    if (uk.dueDate !== den) onMove?.(uk, den);
  };
  const tydenPoz = (d: string) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + 7); return ymd(x); };

  const card = (uk: BoardTask) => {
    const done = uk.status === 'done';
    const label = labelFor?.(uk);
    const muze = canComplete ? canComplete(uk) : true;
    const tah = !!onMove && (canMove ? canMove(uk) : true);
    const opakovani = recurrenceLabel(uk.recurrence, t);
    return (
      <div
        key={uk.id}
        draggable={tah}
        onDragStart={tah ? () => setDragId(uk.id) : undefined}
        onDragEnd={() => { setDragId(null); setDragOver(null); }}
        className={`card p-3 transition-shadow ${tah ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === uk.id ? 'opacity-40' : 'hover:shadow-[shadow:var(--shadow-float)]'}`}
      >
        <div className="flex items-start gap-2">
          <button type="button" role="checkbox" aria-checked={done} aria-label={uk.title}
            disabled={!muze} onClick={() => onComplete(uk, !done)}
            // fokus-kontrast: obrys fokusu musí být vidět i kolem limetkového (splněného) kolečka.
            className={`tap-target fokus-kontrast mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              done ? 'bg-[#C8F542] on-accent' : 'border-2 border-black/15 hover:bg-black/[0.05]'}`}>
            {done && <Icon name="check" size={12} strokeWidth={2.6} />}
          </button>
          {onOpen ? (
            <button type="button" onClick={() => onOpen(uk)} className="min-w-0 flex-1 text-left">
              <Obsah uk={uk} done={done} label={label} opakovani={opakovani} />
            </button>
          ) : (
            <div className="min-w-0 flex-1"><Obsah uk={uk} done={done} label={label} opakovani={opakovani} /></div>
          )}
          {tah && <Button variant="ghost" size="sm" iconOnly icon="calendar" className="-my-1 -mr-1 shrink-0" aria-label={t('Přesunout úkol {nazev} na jiný den', { nazev: uk.title })} onClick={() => setPresouvany(uk)} />}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" iconOnly icon="chevron" className="[&_svg]:rotate-90" aria-label={t('Předchozí týden')} onClick={() => setOffset(o => o - 1)} />
        <p className="text-sm font-semibold text-[#16181A] text-center tabular-nums">
          {fmtDatum(ymd(days[0]), { jazyk, styl: 'kratce' })} – {fmtDatum(ymd(days[6]), { jazyk, styl: 'kratce' })}
          {offset === 0 && <span className="text-black/45 font-normal"> · {t('tento týden')}</span>}
        </p>
        <Button variant="secondary" size="sm" iconOnly icon="chevronRight" aria-label={t('Další týden')} onClick={() => setOffset(o => o + 1)} />
      </div>

      {/* Sloupce dnů — vodorovně posuvná tabule (na telefonu po jednom dni se scroll-snap). */}
      <div className="flex gap-3 overflow-x-auto scrollbar-thin pb-2 -mx-1 px-1 snap-x">
        {days.map(d => {
          const key = ymd(d);
          // Hotové dolů; z nehotových nahoru ty, bez kterých nepůjde uzávěrka dne.
          const list = (byDay.get(key) ?? []).slice().sort((a, b) =>
            (Number(a.status === 'done') - Number(b.status === 'done'))
            || (Number(!!b.requireBeforeClosing) - Number(!!a.requireBeforeClosing)));
          const isToday = key === today;
          return (
            <section
              key={key}
              aria-label={denSCislem(d, jazyk)}
              onDragOver={onMove ? (e => { e.preventDefault(); setDragOver(key); }) : undefined}
              onDragLeave={onMove ? (() => setDragOver(c => (c === key ? null : c))) : undefined}
              onDrop={onMove ? (() => drop(key)) : undefined}
              className={`well shrink-0 w-[15rem] snap-start p-3 flex flex-col gap-3 transition-shadow ${dragOver === key ? 'ring-2 ring-black/15' : ''}`}
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <h3 className="t-card truncate">
                  {WD[d.getDay()]} <span className="text-black/45 font-normal tabular-nums">{d.getDate()}.&nbsp;{d.getMonth() + 1}.</span>
                </h3>
                <span className="flex items-center gap-1.5 shrink-0">
                  {isToday && <Chip tone="ink" size="sm">{t('dnes')}</Chip>}
                  {list.length > 0 && <Chip tone="muted" size="sm">{list.length}</Chip>}
                </span>
              </div>

              <div className="space-y-2 min-h-[3rem]">
                {list.map(card)}
                {list.length === 0 && <p className="t-meta text-center py-4">{t('Žádný úkol')}</p>}
              </div>

              {onAddForDay && (
                <button type="button" onClick={() => onAddForDay(key)}
                  className="tap-target-sm w-full py-2 rounded-2xl border border-dashed border-black/15 text-sm text-black/45 inline-flex items-center justify-center gap-1.5 hover:text-[#16181A] hover:bg-black/[0.03] transition-colors">
                  <Icon name="plus" size={15} /> {t('Přidat úkol')}
                </button>
              )}
            </section>
          );
        })}
      </div>

      <Modal open={presouvany != null} onClose={() => setPresouvany(null)} size="sm" title={t('Přesunout úkol')} subtitle={presouvany?.title}
        footer={<Button variant="secondary" onClick={() => setPresouvany(null)}>{t('Zrušit')}</Button>}>
        {presouvany && (
          <div className="grid gap-2" role="group" aria-label={t('Den, na který úkol přesunout')}>
            {days.map(d => {
              const key = ymd(d);
              const ted = key === presouvany.dueDate;
              return (
                <Button key={key} variant="secondary" className="w-full justify-between" disabled={ted} aria-current={ted ? 'date' : undefined}
                  onClick={() => presun(presouvany, key)}>
                  <span className="capitalize">{denSCislem(d, jazyk)}</span>
                  {ted && <span className="t-meta">{t('teď')}</span>}
                  {!ted && key === today && <span className="t-meta">{t('dnes')}</span>}
                </Button>
              );
            })}
            {presouvany.dueDate && (
              <Button variant="ghost" icon="chevronRight" className="w-full" onClick={() => presun(presouvany, tydenPoz(presouvany.dueDate!))}>
                {t('O týden později')}
              </Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Obsah({ uk, done, label, opakovani }: { uk: BoardTask; done: boolean; label?: string; opakovani: string | null }) {
  const t = useT('rozvrh');
  const PRIORITA: Record<string, string> = { high: t('vysoká'), medium: t('střední'), low: t('nízká') };
  return (
    <>
      <p className={`font-medium text-sm break-words ${done ? 'text-black/45' : 'text-[#16181A]'}`}>{uk.title}</p>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className={`w-2 h-2 rounded-full shrink-0 ${prioDot(uk.priority)}`} aria-hidden />
        <span className="sr-only">{t('Priorita {uroven}.', { uroven: PRIORITA[uk.priority] ?? t('střední') })}</span>
        {label && <span className="text-xs text-black/55 truncate max-w-[9rem]">{label}</span>}
        {opakovani && <><Icon name="refresh" size={13} className="shrink-0 text-black/45" title={t('Opakuje se: {opakovani}', { opakovani })} /><span className="sr-only">{t('Opakuje se: {opakovani}', { opakovani })}.</span></>}
        {uk.requireBeforeClosing && !done && <ChipPredUzaverkou />}
      </div>
      {done && uk.completedByName && <p className="text-xs text-black/45 mt-1">{t('splnil {jmeno}', { jmeno: uk.completedByName })}</p>}
    </>
  );
}
