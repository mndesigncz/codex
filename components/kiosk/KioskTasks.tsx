'use client';

// Úkoly na tabletu za barem (záložka Úkoly v KioskApp).
//
// Kolo 69 (balík B6a): stejný slovník jako Úkoly v aplikaci. Dřív tu byl každý
// úkol vlastní kartou v mřížce (na monitoru jeden úkol a vedle prázdno), vlastní
// checklist se čtverečky mimo rádiusy, plná limetka „Návod: …" u každého úkolu
// (víc limetek na obrazovce), ručně psané pilulky filtru a nadpisy verzálkami,
// „Žádné úkoly. 🎉" s emoji a náhradní 👤 místo avataru (audit zaměstnanec-kiosk).
// Teď: skupina = jedna karta s `.list`, checklist sdílený TaskChecklist, návod
// `secondary` tlačítko, filtr `filter-pill`, prázdno EmptyState, kostra místo
// kolečka. Povrch `.kiosk-surface` sám zvedne písmo na 14 px a cíle na 44 px.
//
// Data přes useDataWidgetu (/api/tasks): widget Úkoly na dnes na ploše tabletu
// čte tutéž adresu, takže odškrtnutí tady srovná i jeho.

import { useMemo, useState } from 'react';
import { useKioskShift } from './KioskShiftGate';
import { pragueToday } from '@/lib/pragueTime';
import { okJson, apiMessage } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Skeleton, Toast } from '../ui';
import { Icon } from '../Icons';
import { TaskChecklist } from '../TaskChecklist';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { vyberUkoly, rozdelPoDnech, type Ukol } from '@/lib/ukolyPrehled';

type Filter = 'all' | 'mine' | 'open' | 'done';

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
const prioDot = (p: string) => p === 'high' ? 'bg-bad' : p === 'medium' ? 'bg-wait' : 'bg-[#C8F542]';
const denKratce = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

export default function KioskTasks({ onOpenGuide }: { onOpenGuide?: (id: number) => void }) {
  const { active, requireActive } = useKioskShift();
  // Když se úkoly nenačtou, nesmí to vypadat jako „žádné úkoly" —
  // na tabletu je tahle obrazovka jediné místo, kde se úkol dá vidět.
  const data = useDataWidgetu<Ukol[]>('/api/tasks', vyberUkoly);
  const tasks = useMemo(() => data.data ?? [], [data.data]);
  const [filter, setFilter] = useState<Filter>('open');
  const [bodyToast, setBodyToast] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  // Kdo splnil úkol, je záznam o práci. Když tablet neví, koho zapsat,
  // musí se zeptat dřív, než se cokoli pošle — `actingAs: undefined` dřív
  // znamenalo, že si úkol připsal tablet sám.
  const setStatus = async (t: Ukol, status: string) => {
    const who = await requireActive();
    if (!who) return;
    setChyba(null);
    data.set(prev => (prev ?? []).map(x => (x.id === t.id ? { ...x, status } : x)));
    try {
      const d = await fetch('/api/tasks', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: t.id, status, actingAs: who.id }) }).then(okJson);
      // Body patří tomu, kdo u tabletu stojí — a má je vidět hned, jinak
      // odškrtnutí „vyrob limonádu" nic neznamená.
      const pts = Number(d?.pointsEarned);
      if (status === 'done' && Number.isFinite(pts) && pts > 0) setBodyToast(`${who.name}: +${czCount(pts, BOD)} za splněný úkol`);
      data.reload();
    } catch (e) {
      data.set(prev => (prev ?? []).map(x => (x.id === t.id ? { ...x, status: t.status } : x)));
      setChyba(apiMessage(e, 'Úkol se nepodařilo uložit.'));
    }
  };

  const toggleChecklistItem = async (t: Ukol, index: number) => {
    const who = await requireActive();
    if (!who) return;
    setChyba(null);
    const next = t.checklist.map((it, i) => (i === index ? { ...it, done: !it.done } : it));
    data.set(prev => (prev ?? []).map(x => (x.id === t.id ? { ...x, checklist: next } : x)));
    try {
      await fetch('/api/tasks', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: t.id, checklist: next, actingAs: who.id }) }).then(okJson);
    } catch (e) {
      data.set(prev => (prev ?? []).map(x => (x.id === t.id ? { ...x, checklist: t.checklist } : x)));
      setChyba(apiMessage(e, 'Krok se nepodařilo uložit.'));
    }
  };

  const today = pragueToday();
  const weekAhead = pragueToday(7);

  const filtered = useMemo(() => tasks.filter(t => {
    if (filter === 'mine') return active != null && (t.assignedTo === active.id || t.assignedTo == null);
    if (filter === 'open') return t.status !== 'done';
    if (filter === 'done') return t.status === 'done';
    return true;
  }), [tasks, filter, active]);
  const sk = rozdelPoDnech(filtered, today, weekAhead, 30);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'open', label: 'Nesplněné' },
    { id: 'mine', label: active ? `Moje (${active.name.split(' ')[0]})` : 'Moje' },
    { id: 'all', label: 'Vše' },
    { id: 'done', label: 'Hotové' },
  ];

  const row = (t: Ukol) => {
    const isDone = t.status === 'done';
    const overdueTask = !isDone && !!t.dueDate && t.dueDate < today;
    return (
      <li key={t.id} className="list-row items-start">
        <button type="button" role="checkbox" aria-checked={isDone} aria-label={t.title}
          onClick={() => setStatus(t, isDone ? 'pending' : 'done')}
          // fokus-kontrast: obrys fokusu musí být vidět i kolem limetkového (splněného) kolečka.
          className={`tap-target fokus-kontrast mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${
            isDone ? 'bg-[#C8F542] on-accent' : 'border-2 border-black/15 hover:bg-black/[0.05]'}`}>
          {isDone && <Icon name="check" size={16} strokeWidth={2.6} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-start gap-2">
            <span className={`mt-2 w-2 h-2 rounded-full shrink-0 ${prioDot(t.priority)}`} aria-hidden />
            <span className={`font-medium leading-snug ${isDone ? 'text-black/45' : 'text-[#16181A]'}`}>{t.title}</span>
          </p>
          {t.source === 'production' && !isDone && <Chip tone="info" size="sm" icon="leaf" className="mt-1">Výroba · odškrtnutí naskladní dávku</Chip>}
          {t.description && !isDone && <p className="text-sm text-black/55 mt-1 whitespace-pre-wrap text-pretty">{t.description}</p>}
          <p className="text-sm text-black/55 mt-1.5 flex items-center gap-1.5 min-w-0">
            {t.assignedTo == null ? <span>Kdokoli</span> : (
              <><Avatar emoji={t.assigneeAvatar} size="xs" ring={false} /><span className="truncate">{t.assigneeName ?? ''}</span></>
            )}
            {t.dueDate && (
              <span className={`whitespace-nowrap ${overdueTask ? 'text-bad-ink font-medium' : ''}`}>
                {' · '}{denKratce(t.dueDate)}{overdueTask && ' · po termínu'}
              </span>
            )}
            {isDone && t.completedByName && <span className="truncate"> · splnil {t.completedByName}</span>}
          </p>
          {/* Postup je v návodu, ne v popisu úkolu. U baru je rozdíl mezi
              „přepni na Návody a najdi si to" a jedním ťuknutím zásadní.
              Vedlejší akce, ne limetka — ta by svítila u každého úkolu. */}
          {!isDone && t.sourceMeta?.guideId && onOpenGuide && (
            <Button variant="secondary" size="lg" icon="book" className="mt-2" onClick={() => onOpenGuide(Number(t.sourceMeta!.guideId))}>
              {t.sourceMeta.guideTitle ? `Návod: ${t.sourceMeta.guideTitle}` : 'Otevřít návod'}
            </Button>
          )}
          {!isDone && t.checklist.length > 0 && (
            <TaskChecklist velky items={t.checklist} onToggle={i => void toggleChecklistItem(t, i)} />
          )}
        </div>
      </li>
    );
  };

  const section = (title: string, list: Ukol[], tone = '') =>
    list.length > 0 && (
      <section className="space-y-2" aria-label={title}>
        <h2 className={`t-label ${tone}`}>{title} ({list.length.toLocaleString('cs-CZ')})</h2>
        <Card pad="none" className="px-5"><ul className="list">{list.map(row)}</ul></Card>
      </section>
    );

  const nesplnenych = sk.poTerminu.length + sk.dnes.length + sk.tentoTyden.length + sk.pozdeji.length;
  return (
    <div className="space-y-6">
      <Toast message={bodyToast} onClose={() => setBodyToast(null)} />
      <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-none scroll-fade-x -mx-1 px-1" role="group" aria-label="Filtr úkolů">
        {FILTERS.map(f => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
            className={`filter-pill tap-target ${filter === f.id ? 'seg-on' : 'seg-off glass'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {chyba && <p className="note note-danger" role="alert">{chyba}</p>}

      {data.error && !data.data ? (
        <Card><ErrorState title="Úkoly se nenačetly" hint={data.error} onRetry={data.reload} /></Card>
      ) : data.loading ? (
        <Card aria-busy className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14 w-2/3" /></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState compact illustration="ukoly" title={filter === 'done' ? 'Zatím nic hotového' : 'Žádné úkoly'}
            hint={filter === 'done' ? 'Splněné úkoly se objeví tady.' : 'Až vedení něco zadá, objeví se to tady.'} />
        </Card>
      ) : (
        <>
          {filter !== 'done' && nesplnenych === 0 && (
            <Card><EmptyState compact illustration="ukoly" title="Na dnešek je hotovo" hint="Všechny úkoly jsou splněné." /></Card>
          )}
          {section('Po termínu', sk.poTerminu, 'text-bad-ink')}
          {section('Dnes', sk.dnes)}
          {section('Tento týden', sk.tentoTyden)}
          {section('Později', sk.pozdeji)}
          {(filter === 'done' || filter === 'all') && section('Hotové — posledních 30', sk.hotove)}
        </>
      )}
    </div>
  );
}
