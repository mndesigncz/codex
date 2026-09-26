'use client';

// Úkoly (zaměstnanec): co je dnes na mně a co je pro kohokoli.
//
// Kolo 69 (balík B6a): stránka je plocha s widgety. Hlavička jde do PlochaWidgetu
// (přepínač Seznam/Týden do `aside` — dřív seděl ve slotu pro limetkovou akci
// a na telefonu se roztáhl přes celou šířku), tahle komponenta kreslí nástroj.
// Data čte přes useDataWidgetu z téže adresy jako widgety (Po termínu, Úkoly na
// týden), takže stránka se ptá jednou.
//
// Z auditu: každý úkol byl vlastní karta a vedení mělo tentýž seznam v jedné kartě
// s linkami — teď je skupina jedna karta s `.list` jako u vedení. Stav byl nativní
// <select> převlečený za barevný štítek (s ručními hex barvami): stav nese Chip a mění
// se přes Menu. „Tohle není dnešní úkol" už není confirm(), ale okno; prázdno „Vše
// hotovo. 🎉" je EmptyState bez emoji; štítky (výroba, pro kohokoli, opakování) jsou
// Chip a odkaz na návod ghost tlačítko.

import { useState, useMemo } from 'react';
import { TaskChecklist, recurrenceLabel, type ChecklistItem } from '../TaskChecklist';
import { useCurrency } from '../CurrencyProvider';
import TaskWeekBoard from '../TaskWeekBoard';
import { pragueToday } from '@/lib/pragueTime';
import { Button, Card, Chip, EmptyState, ErrorState, Menu, Modal, Segmented, Skeleton, Toast } from '../ui';
import { Icon } from '../Icons';
import { apiMessage, okJson } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { URL_UKOLY, UKOL, Zaskrtnuti } from '../widgety/oblasti/ukoly';
import { vyberUkoly, vRozsahu, rozdelPoDnech, jeCiziUkol, type Ukol } from '@/lib/ukolyPrehled';

interface Props {
  user: { id?: string };
}

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
const STAVY: Record<string, { label: string; tone: 'muted' | 'info' | 'ok' }> = {
  pending: { label: 'Čeká', tone: 'muted' },
  in_progress: { label: 'Probíhá', tone: 'info' },
  done: { label: 'Hotovo', tone: 'ok' },
};
const denDlouze = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
const denKratce = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

export default function Tasks({ user }: Props) {
  const ja = parseInt(user.id ?? '0') || null;
  const smi = useSmi();
  const data = useDataWidgetu<Ukol[]>(ja ? URL_UKOLY : null, vyberUkoly);
  // Server vrací moje a pro kohokoli; kdo má ukoly.zobrazit_tym, dostane celý tým —
  // tahle stránka je ale „moje úkoly", tak cizí nechává seznamu vedení.
  const tasks = useMemo(() => vRozsahu(data.data ?? [], 'moje_a_volne', ja), [data.data, ja]);
  const [view, setView] = useState<'list' | 'week'>('list');
  const [showLater, setShowLater] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [bodyToast, setBodyToast] = useState<string | null>(null);
  const [mimoDen, setMimoDen] = useState<Ukol | null>(null);
  const { weekStart } = useCurrency();

  const today = pragueToday();
  const weekAhead = pragueToday(7);
  const smiSplnit = (t: Ukol) => !jeCiziUkol(t, ja) || smi('ukoly.plnit');

  const zmenStav = async (task: Ukol, newStatus: string) => {
    setSaveErr(null);
    const puvodni = task.status;
    data.set(prev => (prev ?? []).map(t => (t.id === task.id ? { ...t, status: newStatus } : t)));
    try {
      const d = await fetch(URL_UKOLY, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: task.id, status: newStatus }) }).then(okJson);
      // Body se přičítaly potichu. Když je člověk uvidí hned, ví, že
      // odškrtnutí něco znamená — a „vyrob limonádu" přestane být otrava.
      const pts = Number(d?.pointsEarned);
      if (newStatus === 'done' && Number.isFinite(pts) && pts > 0) setBodyToast(`+${czCount(pts, BOD)} za splněný úkol`);
      data.reload();
    } catch (e) {
      data.set(prev => (prev ?? []).map(t => (t.id === task.id ? { ...t, status: puvodni } : t)));
      setSaveErr(apiMessage(e, 'Změnu stavu se nepodařilo uložit.'));
    }
  };

  /** Splnit úkol, který není na dnešek, se napřed zeptá oknem (dřív confirm()). */
  const updateStatus = (task: Ukol, newStatus: string) => {
    if (!smiSplnit(task)) return;
    if (newStatus === 'done' && task.dueDate && task.dueDate !== today) { setMimoDen(task); return; }
    void zmenStav(task, newStatus);
  };

  const saveChecklist = async (task: Ukol, next: ChecklistItem[]) => {
    setSaveErr(null);
    const puvodni = task.checklist;
    data.set(prev => (prev ?? []).map(x => (x.id === task.id ? { ...x, checklist: next } : x)));
    try {
      await fetch(URL_UKOLY, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: task.id, checklist: next }) }).then(okJson);
    } catch (e) {
      data.set(prev => (prev ?? []).map(x => (x.id === task.id ? { ...x, checklist: puvodni } : x)));
      setSaveErr(apiMessage(e, 'Kontrolní seznam se nepodařilo uložit.'));
    }
  };
  const toggleChecklistItem = (task: Ukol, index: number) =>
    saveChecklist(task, task.checklist.map((it, i) => (i === index ? { ...it, done: !it.done } : it)));
  /** Odškrtnout nebo odškrtnutí zrušit u celého seznamu jedním požadavkem. */
  const toggleChecklistAll = (task: Ukol, done: boolean) => saveChecklist(task, task.checklist.map(it => ({ ...it, done })));

  const skupiny = rozdelPoDnech(tasks, today, weekAhead, 20);

  const row = (task: Ukol) => {
    const hotovo = task.status === 'done';
    // Budoucí výskyty ještě neplatí → tlumeně, dokud nepřijde jejich den.
    const inactive = !hotovo && !!task.dueDate && task.dueDate > today;
    const pozde = !hotovo && !!task.dueDate && task.dueDate < today;
    const opakovani = recurrenceLabel(task.recurrence);
    const stav = STAVY[task.status] ?? STAVY.pending;
    return (
      <li key={task.id} className="list-row items-start">
        <span className="shrink-0 pt-0.5">
          <Zaskrtnuti hotovo={hotovo} nazev={task.title} zamceno={!smiSplnit(task)} ceka={false}
            onClick={() => updateStatus(task, hotovo ? 'pending' : 'done')} />
        </span>
        <div className={`min-w-0 flex-1 ${inactive ? 'opacity-60' : ''}`}>
          <p className={`font-medium text-[15px] leading-snug ${hotovo ? 'text-black/45' : 'text-[#16181A]'}`}>{task.title}</p>
          {task.description && <p className="text-sm text-black/55 mt-1 whitespace-pre-wrap text-pretty">{task.description}</p>}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[13px] text-black/55">
            {task.dueDate && <span className={pozde ? 'text-bad-ink font-medium' : undefined}><span className="cz-sentence">{denKratce(task.dueDate)}</span>{pozde && ' · po termínu'}</span>}
            {task.status === 'in_progress' && <Chip tone={stav.tone} size="sm">{stav.label}</Chip>}
            {task.source === 'production' && <Chip tone="info" size="sm" icon="leaf">Výroba</Chip>}
            {task.teamTask && <Chip tone="info" size="sm" icon="users">Pro kohokoli</Chip>}
            {opakovani && <Chip tone="muted" size="sm" icon="refresh">{opakovani}</Chip>}
            {hotovo && task.completedByName && <span>splnil {task.completedByName}</span>}
            {/* Postup bydlí v návodu — odsud se na něj dá dostat jedním ťuknutím místo hledání v seznamu návodů. */}
            {task.sourceMeta?.guideId && (
              <a href={`/employee/shifts?view=guides&guide=${task.sourceMeta.guideId}`} className="btn btn-ghost btn-sm -my-1"
                title={task.sourceMeta.guideTitle ?? 'Otevřít návod'}>
                <Icon name="book" size={15} className="shrink-0" />
                <span className="truncate max-w-[12rem]">{task.sourceMeta.guideTitle ?? 'Návod'}</span>
              </a>
            )}
          </div>
          {task.checklist.length > 0 && (
            <TaskChecklist items={task.checklist} onToggle={smiSplnit(task) ? i => toggleChecklistItem(task, i) : undefined}
              onToggleAll={smiSplnit(task) ? d => toggleChecklistAll(task, d) : undefined} />
          )}
        </div>
        {!hotovo && smiSplnit(task) && (
          <Menu size="sm" label={`Stav úkolu ${task.title}`} className="shrink-0 -my-1" items={
            task.status === 'in_progress'
              ? [{ label: 'Vrátit na Čeká', icon: 'undo', onClick: () => updateStatus(task, 'pending') }, { label: 'Hotovo', icon: 'check', onClick: () => updateStatus(task, 'done') }]
              : [{ label: 'Začít — probíhá', icon: 'play', onClick: () => updateStatus(task, 'in_progress') }, { label: 'Hotovo', icon: 'check', onClick: () => updateStatus(task, 'done') }]
          } />
        )}
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

  const zbyva = skupiny.poTerminu.length + skupiny.dnes.length;
  const nastroj = (
    <div className="space-y-6">
      {saveErr && <p className="note note-danger text-sm" role="alert">{saveErr}</p>}
      {data.error && !data.data ? (
        <Card><ErrorState title="Úkoly se nenačetly" onRetry={data.reload} detail={data.error} /></Card>
      ) : data.loading ? (
        <Card aria-busy className="space-y-2">
          <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10 w-2/3" />
        </Card>
      ) : view === 'week' ? (
        <TaskWeekBoard tasks={tasks} weekStart={weekStart}
          onComplete={(t, done) => { const u = tasks.find(x => x.id === t.id); if (u) updateStatus(u, done ? 'done' : 'pending'); }}
          canComplete={t => { const u = tasks.find(x => x.id === t.id); return !!u && smiSplnit(u); }}
          labelFor={t => (t.teamTask ? 'Pro kohokoli' : '')} />
      ) : tasks.length === 0 ? (
        <Card><EmptyState illustration="ukoly" title="Žádné úkoly" hint="Až ti vedení něco zadá, objeví se to tady i v přehledu." compact /></Card>
      ) : (
        <>
          {section('Po termínu', skupiny.poTerminu, 'text-bad-ink')}
          {section('Dnes', skupiny.dnes)}
          {zbyva === 0 && (
            <Card><EmptyState compact illustration="ukoly" title="Na dnešek máš hotovo" hint="Nic po termínu ani na dnes — další úkoly jsou níž." /></Card>
          )}
          {section('Tento týden', skupiny.tentoTyden)}
          {skupiny.pozdeji.length > 0 && (
            showLater ? section('Později', skupiny.pozdeji) : (
              <Button variant="ghost" size="sm" iconAfter="chevron" onClick={() => setShowLater(true)}>
                Zobrazit další úkoly ({skupiny.pozdeji.length.toLocaleString('cs-CZ')})
              </Button>
            )
          )}
          {section('Hotové — posledních 20', skupiny.hotove)}
        </>
      )}
    </div>
  );

  return (
    <>
      <PlochaWidgetu
        stranka="zamestnanec.ukoly"
        hlavicka={{
          title: 'Úkoly',
          subtitle: data.data && zbyva > 0 ? `Na dnešek a po termínu: ${czCount(zbyva, UKOL)}.` : 'Co je dnes na tobě — a co je pro kohokoli.',
          hintId: 'tasks',
          aside: <Segmented size="sm" ariaLabel="Zobrazení" value={view} onChange={setView}
            options={[{ id: 'list', label: 'Seznam' }, { id: 'week', label: 'Týden' }]} />,
        }}
        nastroj={nastroj}
      />
      {mimoDen && (
        <Modal open onClose={() => setMimoDen(null)} size="sm" title="Tohle není dnešní úkol"
          footer={<>
            <Button variant="secondary" onClick={() => setMimoDen(null)}>Zrušit</Button>
            <Button variant="primary" icon="check" onClick={() => { const t = mimoDen; setMimoDen(null); void zmenStav(t, 'done'); }}>Splnit teď</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty"><span className="cz-sentence">„{mimoDen.title}" má termín {denDlouze(mimoDen.dueDate!)}.</span> Opravdu ho chceš splnit už teď?</p>
        </Modal>
      )}
      <Toast message={bodyToast} onClose={() => setBodyToast(null)} />
    </>
  );
}
