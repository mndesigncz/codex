'use client';

import { useState, useEffect, useMemo } from 'react';
import { TaskChecklist, recurrenceLabel, ChecklistItem } from '../TaskChecklist';
import { useCurrency } from '../CurrencyProvider';
import TaskWeekBoard from '../TaskWeekBoard';
import { pragueToday } from '@/lib/pragueTime';

import { EmptyState, PageHeader, Segmented } from '../ui';
import { Icon } from '../Icons';
import { okJson } from '@/lib/api';
interface Task {
  id: number;
  title: string;
  description?: string;
  priority: string;
  status: string;
  dueDate?: string;
  recurrence?: string | null;
  teamTask?: boolean;
  completedByName?: string | null;
  checklist?: ChecklistItem[];
  source?: string | null;
  sourceMeta?: { guideId?: number | null; guideTitle?: string | null } | null;
}

interface Props {
  user: { id?: string };
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Čeká', color: 'bg-black/[0.05] text-black/60' },
  { value: 'in_progress', label: 'Probíhá', color: 'bg-[#0A84FF]/15 text-[#0A5CC0]' },
  { value: 'done', label: 'Hotovo', color: 'bg-[#C8F542]/15 text-[#5B7A08]' },
];

export default function Tasks({ user }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'week'>('list');
  const [showLater, setShowLater] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const { weekStart } = useCurrency();

  const userId = parseInt(user.id ?? '0');

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/tasks?assignedTo=${userId}`)
      .then(okJson)
      .then(data => { if (Array.isArray(data)) setTasks(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  const today = pragueToday();
  const weekAhead = pragueToday(7);

  const updateStatus = async (task: Task, newStatus: string) => {
    // Completing a task on a day that isn't its due day → warn first.
    if (newStatus === 'done' && task.dueDate && task.dueDate !== today) {
      const d = new Date(task.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
      if (!confirm(`Tohle není dnešní úkol (termín: ${d}). Opravdu ho chceš splnit teď?`)) return;
    }
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: newStatus }),
      });
      if (res.ok) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
      else { setSaveErr('Změnu stavu se nepodařilo uložit.'); setTimeout(() => setSaveErr(''), 4000); }
    } catch (e) {
      console.error(e);
      setSaveErr('Změnu stavu se nepodařilo uložit.'); setTimeout(() => setSaveErr(''), 4000);
    }
  };

  const saveChecklist = async (task: Task, next: { text: string; done: boolean }[]) => {
    const prev = tasks;
    setTasks(ts => ts.map(x => x.id === task.id ? { ...x, checklist: next } : x));
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, checklist: next }),
      });
      if (!res.ok) throw new Error();
    } catch { setTasks(prev); }
  };

  const toggleChecklistItem = (task: Task, index: number) =>
    saveChecklist(task, (task.checklist ?? []).map((it, i) => i === index ? { ...it, done: !it.done } : it));

  /** Odškrtnout nebo odškrtnutí zrušit u celého seznamu jedním požadavkem. */
  const toggleChecklistAll = (task: Task, done: boolean) =>
    saveChecklist(task, (task.checklist ?? []).map(it => ({ ...it, done })));

  const priorityColor = (p: string) => p === 'high' ? 'bg-bad' : p === 'medium' ? 'bg-wait' : 'bg-[#C8F542]';
  const getStatusOption = (status: string) => STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0];

  // Rozdělení podle dne. Šest filtrů a tři řazení se přepočítávají jen když se
  // změní úkoly (ne při každém překreslení kvůli jinému stavu komponenty).
  const { overdue, todayTasks, upcomingSoon, upcomingLater, done } = useMemo(() => {
    const byDate = (a: Task, b: Task) => String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? ''));
    const undone = tasks.filter(t => t.status !== 'done');
    const upcoming = undone.filter(t => t.dueDate && t.dueDate > today).sort(byDate);
    return {
      overdue: undone.filter(t => t.dueDate && t.dueDate < today).sort(byDate),
      todayTasks: undone.filter(t => !t.dueDate || t.dueDate === today).sort(byDate),
      upcomingSoon: upcoming.filter(t => t.dueDate! <= weekAhead),
      upcomingLater: upcoming.filter(t => t.dueDate! > weekAhead),
      done: tasks.filter(t => t.status === 'done').sort((a, b) => byDate(b, a)).slice(0, 20),
    };
  }, [tasks, today, weekAhead]);

  const card = (task: Task) => {
    const statusOpt = getStatusOption(task.status);
    // Future occurrences aren't active yet → show them greyed until their day comes.
    const inactive = task.status !== 'done' && !!task.dueDate && task.dueDate > today;
    return (
      <div key={task.id} className={`glass-card p-5 sm:p-6 transition ${task.status === 'done' ? 'opacity-50' : inactive ? 'opacity-60' : ''}`}>
        <div className="flex items-start gap-3">
          <button
            onClick={() => updateStatus(task, task.status === 'done' ? 'pending' : 'done')}
            aria-pressed={task.status === 'done'}
            aria-label={`${task.status === 'done' ? 'Zrušit splnění' : 'Označit jako hotové'} — ${task.title}`}
            className={`tap-target w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 transition ${
              task.status === 'done' ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/15 hover:border-[#C8F542]/60'
            }`}
          >
            {task.status === 'done' && <span className="text-xs font-bold"><Icon name="check" size={15} /></span>}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <p className={`font-semibold text-[#16181A] tracking-tight ${task.status === 'done' ? 'line-through' : ''}`}>
                <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${priorityColor(task.priority)}`} />{task.title}
              </p>
              <select
                value={task.status}
                aria-label={`Stav úkolu — ${task.title}`}
                onChange={e => updateStatus(task, e.target.value)}
                className={`tap-target-sm text-xs px-3 py-1 min-h-[36px] rounded-full border-0 font-medium cursor-pointer ${statusOpt.color} focus:outline-none`}
              >
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {task.description && <p className="text-sm text-black/55 mt-1.5 whitespace-pre-wrap">{task.description}</p>}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {task.dueDate && (
                <p className={`text-xs ${task.dueDate < today && task.status !== 'done' ? 'text-bad-ink font-medium' : 'text-black/45'}`}>
                  {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                  {task.dueDate < today && task.status !== 'done' && ' · po termínu'}
                </p>
              )}
              {task.source === 'production' && (
                <span className="chip chip-sm chip-info" title="Odškrtnutí naskladní dávku a odepíše suroviny"><Icon name="leaf" size={12} className="inline -mt-0.5 mr-1 shrink-0" /> Výroba</span>
              )}
              {/* Postup bydlí v návodu — odsud se na něj dá dostat jedním
                  ťuknutím místo hledání v seznamu návodů. */}
              {task.sourceMeta?.guideId && (
                <a href={`/employee/shifts?view=guides&guide=${task.sourceMeta.guideId}`}
                  className="chip chip-sm bg-[#C8F542]/25 text-[#5B7A08] hover:bg-[#C8F542]/40 transition"
                  title={task.sourceMeta.guideTitle ?? 'Otevřít návod'}>
                  <Icon name="book" size={12} className="inline -mt-0.5 mr-1 shrink-0" />
                  {task.sourceMeta.guideTitle ?? 'Návod'}
                </a>
              )}
              {task.teamTask && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#0A84FF]/15 text-[#0A5CC0] px-2 py-0.5 text-[11px] font-semibold"><Icon name="calendar" size={15} className="inline -mt-0.5 mr-1.5 shrink-0" /> Pro kohokoliv</span>
              )}
              {recurrenceLabel(task.recurrence) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-2 py-0.5 text-[11px] font-semibold">↻ {recurrenceLabel(task.recurrence)}</span>
              )}
              {task.status === 'done' && task.completedByName && (
                <span className="text-[11px] text-black/40">splnil {task.completedByName}</span>
              )}
            </div>
            {task.checklist && task.checklist.length > 0 && (
              <TaskChecklist items={task.checklist} onToggle={i => toggleChecklistItem(task, i)}
                onToggleAll={d => toggleChecklistAll(task, d)} />
            )}
          </div>
        </div>
      </div>
    );
  };

  const section = (title: string, list: Task[], tone = 'text-black/45') =>
    list.length > 0 && (
      <div className="space-y-2.5">
        <h3 className={`text-xs font-bold uppercase tracking-[0.13em] ${tone}`}>{title} ({list.length})</h3>
        {list.map(card)}
      </div>
    );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto w-full">
      <PageHeader hintId="tasks" title="Úkoly" subtitle="Co je dnes na tobě — a co je pro kohokoli."
        primary={<Segmented size="sm" ariaLabel="Zobrazení" value={view} onChange={setView}
          options={[{ id: 'list', label: 'Seznam' }, { id: 'week', label: 'Týden' }]} />} />

      {saveErr && <div className="note note-danger px-4 py-2.5 text-sm">{saveErr}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="spinner" /></div>
      ) : view === 'week' ? (
        <TaskWeekBoard tasks={tasks} weekStart={weekStart}
          onComplete={(t, done) => updateStatus(t as Task, done ? 'done' : 'pending')}
          labelFor={(t) => (t.teamTask ? 'Pro kohokoliv' : '')} />
      ) : tasks.length === 0 ? (
        <div className="glass-card"><EmptyState illustration="ukoly" title="Žádné úkoly" hint="Až ti vedení něco zadá, objeví se to tady i v přehledu." compact /></div>
      ) : (
        <>
          {section('Po termínu', overdue, 'text-bad-ink')}
          {section('Dnes', todayTasks, 'text-[#5B7A08]')}
          {section('Tento týden', upcomingSoon)}
          {upcomingLater.length > 0 && (
            showLater ? (
              section('Později', upcomingLater)
            ) : (
              <button
                onClick={() => setShowLater(true)}
                className="w-full rounded-2xl border border-dashed border-black/15 py-2.5 text-xs font-semibold text-black/45 hover:text-[#5B7A08] hover:border-[#C8F542]/60 transition"
              >
                Zobrazit další úkoly ({upcomingLater.length}) →
              </button>
            )
          )}
          {section('Hotové — posledních 20', done)}
          {overdue.length + todayTasks.length + upcomingSoon.length + upcomingLater.length === 0 && (
            <div className="glass-card p-8 text-center"><p className="text-black/45">Vše hotovo. 🎉</p></div>
          )}
        </>
      )}
    </div>
  );
}
