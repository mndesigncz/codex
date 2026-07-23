'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { useProcedures, type ProcedureLite } from './ProcedureProvider';
import StepTimeline from './StepTimeline';
import { parseSteps, totalMinutes, fmtMinutes, timeRange, type Step } from '@/lib/steps';

interface Props {
  user: { id?: string | number; name?: string | null; role?: string; avatar?: string };
}

interface Procedure extends ProcedureLite {
  description?: string | null;
  icon: string;
  color: string;
  remindAt?: string | null;
  remindDays?: number[] | null;
}

const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

interface RunRow {
  id: number;
  procedure_name: string;
  procedure_icon: string;
  user_name: string;
  user_avatar: string;
  status: string;
  total_items: number;
  checked_items: number[];
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
}

const ICON_CHOICES = ['check', 'clock', 'box', 'book', 'leaf', 'users', 'calendar', 'chat', 'trend', 'warning', 'settings', 'search'];

const SEEDS = [
  {
    name: 'Otevírání',
    description: 'Ranní příprava provozovny před otevřením.',
    icon: 'clock',
    items: [
      { text: 'Odemknout provozovnu', emoji: '🔑', minutes: 1 },
      { text: 'Zapnout světla a hudbu', emoji: '💡', minutes: 1 },
      { text: 'Spustit kávovar a ohřev vody', emoji: '☕', minutes: 10, note: 'Nechat nahřát před prvním kafem.' },
      { text: 'Zkontrolovat pokladnu', emoji: '💰', minutes: 3, note: 'Ověřit počáteční hotovost.' },
      { text: 'Doplnit vitrínu', emoji: '🧁', minutes: 8 },
      { text: 'Otočit ceduli OTEVŘENO', emoji: '🚪', minutes: 1 },
    ],
  },
  {
    name: 'Zavírání',
    description: 'Večerní uzavření provozovny.',
    icon: 'check',
    items: [
      { text: 'Otočit ceduli ZAVŘENO', emoji: '🚪', minutes: 1 },
      { text: 'Uklidit a vytřít', emoji: '🧹', minutes: 15 },
      { text: 'Vypnout spotřebiče', emoji: '🔌', minutes: 3 },
      { text: 'Spočítat pokladnu', emoji: '💰', minutes: 8, note: 'Provést uzávěrku.' },
      { text: 'Vynést odpadky', emoji: '🗑️', minutes: 3 },
      { text: 'Zamknout a zapnout alarm', emoji: '🔒', minutes: 2 },
    ],
  },
];

function fmtDuration(sec: number | null) {
  if (sec == null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtWhen(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `dnes ${time}`;
  return `${d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })} ${time}`;
}

function stepsWord(n: number) {
  if (n === 1) return 'krok';
  if (n >= 2 && n <= 4) return 'kroky';
  return 'kroků';
}

const playGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
);

export default function Procedures({ user }: Props) {
  const isEmployer = user.role === 'employer';
  const { active, startRun, starting } = useProcedures();

  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Procedure | null>(null);
  const [detail, setDetail] = useState<Procedure | null>(null);
  const [confirmDel, setConfirmDel] = useState<Procedure | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pRes, rRes] = await Promise.all([
        fetch('/api/procedures'),
        fetch('/api/procedures/runs'),
      ]);
      const pData = await pRes.json();
      const rData = await rRes.json();
      setProcedures(pData.procedures ?? []);
      setRuns(rData.runs ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh the runs feed when a run finishes (active clears).
  const activeId = active?.id ?? null;
  useEffect(() => {
    if (activeId === null) {
      const t = setTimeout(() => { load(); }, 500);
      return () => clearTimeout(t);
    }
  }, [activeId, load]);

  const seedExamples = async () => {
    setSeeding(true);
    try {
      for (const s of SEEDS) {
        await fetch('/api/procedures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(s),
        });
      }
      await load();
    } finally {
      setSeeding(false);
    }
  };

  const removeProcedure = async (id: number) => {
    setProcedures(prev => prev.filter(p => p.id !== id));
    await fetch(`/api/procedures/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  const doConfirmDelete = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      await removeProcedure(confirmDel.id);
    } finally {
      setDeleting(false);
      setConfirmDel(null);
    }
  };

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (p: Procedure) => { setEditing(p); setEditorOpen(true); };

  return (
    <div className="px-4 md:px-6 pb-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pt-1 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A]">Postupy</h1>
          <p className="mt-1 text-sm text-black/50">Krok za krokem — otevírání, zavírání a další rutiny.</p>
        </div>
        {isEmployer && procedures.length > 0 && (
          <button onClick={openNew} className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 hover:brightness-110 transition inline-flex items-center gap-1.5 flex-shrink-0">
            <Icon name="plus" size={18} /> <span className="hidden sm:inline">Nový postup</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="glass-card rounded-3xl h-40 animate-pulse" />
          ))}
        </div>
      ) : procedures.length === 0 ? (
        <EmptyState isEmployer={isEmployer} seeding={seeding} onSeed={seedExamples} onNew={openNew} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {procedures.map(p => {
            const running = active?.procedureId === p.id;
            const mins = totalMinutes(parseSteps(p.items));
            const lastRun = runs.find(r => r.status === 'completed' && r.procedure_name === p.name);
            return (
              <div
                key={p.id}
                onClick={() => setDetail(p)}
                className="glass-card rounded-3xl p-5 flex flex-col group cursor-pointer hover:border-black/15 transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C8F542]/25 text-[#5B7A08]">
                    <Icon name={p.icon || 'check'} size={24} />
                  </div>
                  {isEmployer && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} title="Upravit" className="flex h-8 w-8 items-center justify-center rounded-full text-black/40 hover:bg-black/[0.06] hover:text-black transition">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17.2V20Z" /><path d="M13.5 6.5l4 4" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDel(p); }} title="Smazat" className="flex h-8 w-8 items-center justify-center rounded-full text-black/40 hover:bg-red-500/10 hover:text-red-600 transition">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
                      </button>
                    </div>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-bold tracking-tight text-[#16181A]">{p.name}</h3>
                {p.description && <p className="mt-1 text-sm text-black/50 line-clamp-2">{p.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-black/45">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="check" size={14} /> {p.items.length} {stepsWord(p.items.length)}
                  </span>
                  {mins > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="clock" size={13} /> {fmtMinutes(mins)}
                    </span>
                  )}
                  {(p.remindAt || p.remindAnchor === 'open' || p.remindAnchor === 'close') && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#C8F542]/25 px-2 py-0.5 font-medium text-[#5B7A08]">
                      <Icon name="clock" size={12} /> {p.remindAnchor === 'open' ? 'Při otevření' : p.remindAnchor === 'close' ? 'Při zavření' : p.remindAt}
                    </span>
                  )}
                </div>
                {lastRun && (
                  <p className="mt-2 text-[11px] text-black/40 truncate">
                    Naposledy {fmtWhen(lastRun.completed_at || lastRun.started_at)}
                    {lastRun.duration_seconds != null && ` · ${fmtDuration(lastRun.duration_seconds)}`}
                    {lastRun.user_name && ` · ${lastRun.user_name}`}
                  </p>
                )}
                <div className="mt-4 pt-1 flex-1 flex items-end">
                  <button
                    onClick={(e) => { e.stopPropagation(); running ? setDetail(p) : startRun(p); }}
                    disabled={starting}
                    className={`w-full rounded-full px-5 py-2.5 font-semibold transition inline-flex items-center justify-center gap-2 ${
                      running
                        ? 'bg-[#C8F542]/25 text-[#5B7A08]'
                        : 'bg-[#16181A] text-white hover:brightness-110'
                    }`}
                  >
                    {running ? 'Probíhá…' : <>{playGlyph} Spustit</>}
                  </button>
                </div>
              </div>
            );
          })}

          {isEmployer && (
            <button
              onClick={openNew}
              className="glass rounded-3xl p-5 min-h-[176px] flex flex-col items-center justify-center gap-2 border border-dashed border-black/15 text-black/45 hover:text-black hover:border-black/30 transition"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/[0.04]">
                <Icon name="plus" size={24} />
              </div>
              <span className="text-sm font-medium">Nový postup</span>
            </button>
          )}
        </div>
      )}

      {/* Recent runs */}
      {(isEmployer || runs.length > 0) && !loading && (
        <div className="mt-10">
          <h2 className="text-lg font-bold tracking-tight text-[#16181A]">
            {isEmployer ? 'Poslední průběhy' : 'Moje průběhy'}
          </h2>
          {runs.length === 0 ? (
            <p className="mt-3 text-sm text-black/45">Zatím žádné dokončené průběhy.</p>
          ) : (
            <div className="mt-3 glass-card rounded-3xl divide-y divide-black/[0.06] overflow-hidden">
              {runs.map(r => {
                const done = r.status === 'completed';
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xl flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60">{r.user_avatar || '👤'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#16181A] truncate">
                        {r.procedure_name}
                      </p>
                      <p className="text-xs text-black/50 truncate">
                        {r.user_name} · {done ? fmtWhen(r.completed_at || r.started_at) : 'probíhá'}
                      </p>
                    </div>
                    {done ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#C8F542]/25 px-2.5 py-1 text-xs font-medium text-[#5B7A08] tabular-nums flex-shrink-0">
                        <Icon name="clock" size={13} /> {fmtDuration(r.duration_seconds)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.05] px-2.5 py-1 text-xs font-medium text-black/55 flex-shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#C8F542] motion-safe:animate-pulse" />
                        {Array.isArray(r.checked_items) ? r.checked_items.length : 0}/{r.total_items}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4" onClick={() => !deleting && setConfirmDel(null)}>
          <div className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/15 text-red-600">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
              </div>
              <div className="min-w-0">
                <h3 className="font-bold tracking-tight text-[#16181A]">Smazat postup?</h3>
                <p className="text-sm text-black/55 truncate">„{confirmDel.name}"</p>
              </div>
            </div>
            <p className="text-sm text-black/55">Tento postup se odstraní. Akci nelze vzít zpět.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)} disabled={deleting} className="flex-1 rounded-full glass border border-black/10 text-[#16181A] px-4 py-2.5 text-sm font-medium hover:bg-black/[0.05] transition disabled:opacity-50">
                Zrušit
              </button>
              <button onClick={doConfirmDelete} disabled={deleting} className="flex-1 rounded-full bg-red-500 text-white px-4 py-2.5 text-sm font-semibold hover:brightness-110 transition disabled:opacity-50">
                {deleting ? 'Mažu…' : 'Smazat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <ProcedureDetail
          procedure={detail}
          isEmployer={isEmployer}
          running={active?.procedureId === detail.id}
          starting={starting}
          onRun={() => { startRun(detail); setDetail(null); }}
          onEdit={() => { const p = detail; setDetail(null); openEdit(p); }}
          onClose={() => setDetail(null)}
        />
      )}

      {editorOpen && (
        <ProcedureEditor
          key={editing?.id ?? 'new'}
          initial={editing}
          onClose={() => setEditorOpen(false)}
          onSaved={(saved) => {
            setProcedures(prev => {
              const exists = prev.some(p => p.id === saved.id);
              return exists ? prev.map(p => (p.id === saved.id ? saved : p)) : [...prev, saved];
            });
            setEditorOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ProcedureDetail({
  procedure, isEmployer, running, starting, onRun, onEdit, onClose,
}: {
  procedure: Procedure;
  isEmployer: boolean;
  running: boolean;
  starting: boolean;
  onRun: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const steps = parseSteps(procedure.items);
  const mins = totalMinutes(steps);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4" onClick={onClose}>
      <div className="modal-sheet w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#C8F542]/25 text-[#5B7A08]">
                <Icon name={procedure.icon || 'check'} size={24} />
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight text-[#16181A] truncate">{procedure.name}</h2>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-black/50">
                  <span>{steps.length} {stepsWord(steps.length)}</span>
                  {mins > 0 && <><span className="text-black/25">•</span><span className="inline-flex items-center gap-1"><Icon name="clock" size={12} /> {fmtMinutes(mins)}</span></>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isEmployer && (
                <button onClick={onEdit} title="Upravit" className="flex h-9 w-9 items-center justify-center rounded-full text-black/45 hover:bg-black/[0.06] hover:text-black transition">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17.2V20Z" /><path d="M13.5 6.5l4 4" /></svg>
                </button>
              )}
              <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-black/45 hover:bg-black/[0.06] hover:text-black transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          </div>
          {procedure.description && <p className="mt-3 text-sm leading-relaxed text-black/60">{procedure.description}</p>}
        </div>

        {/* Timeline preview */}
        <div className="overflow-y-auto scrollbar-thin px-5 pb-2">
          <StepTimeline steps={steps} />
        </div>

        {/* Play */}
        <div className="px-5 py-4 border-t border-black/[0.07]">
          <button
            onClick={onRun}
            disabled={starting}
            className={`w-full rounded-full px-5 py-3 font-semibold transition inline-flex items-center justify-center gap-2 ${
              running ? 'bg-[#C8F542]/25 text-[#5B7A08]' : 'bg-[#16181A] text-white hover:brightness-110'
            } disabled:opacity-60`}
          >
            {playGlyph} {running ? 'Pokračovat v průběhu' : 'Spustit postup'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ isEmployer, seeding, onSeed, onNew }: { isEmployer: boolean; seeding: boolean; onSeed: () => void; onNew: () => void }) {
  return (
    <div className="glass-card rounded-3xl px-6 py-14 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#C8F542]/25 text-[#5B7A08]">
        <Icon name="check" size={30} />
      </div>
      <h3 className="mt-4 text-xl font-bold tracking-tight text-[#16181A]">Zatím žádné postupy</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-black/50">
        {isEmployer
          ? 'Vytvořte první — třeba Otevírání nebo Zavírání. Zaměstnanci je pak projdou krok po kroku.'
          : 'Zaměstnavatel zatím nevytvořil žádné postupy. Až přibudou, najdete je tady.'}
      </p>
      {isEmployer && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button onClick={onSeed} disabled={seeding} className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 hover:brightness-110 transition disabled:opacity-60 inline-flex items-center gap-1.5">
            {seeding ? 'Vytvářím…' : <><Icon name="leaf" size={17} /> Vytvořit ukázkové postupy</>}
          </button>
          <button onClick={onNew} className="rounded-full glass border border-black/10 text-[#16181A] px-5 py-2.5 font-medium hover:bg-black/[0.05] transition inline-flex items-center gap-1.5">
            <Icon name="plus" size={17} /> Vlastní postup
          </button>
        </div>
      )}
    </div>
  );
}

function ProcedureEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Procedure | null;
  onClose: () => void;
  onSaved: (p: Procedure) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'check');
  const [remindAt, setRemindAt] = useState(initial?.remindAt ?? '');
  const [remindAnchor, setRemindAnchor] = useState<'time' | 'open' | 'close'>(
    (initial?.remindAnchor as 'time' | 'open' | 'close') ?? 'time'
  );
  const [remindDays, setRemindDays] = useState<number[]>(
    Array.isArray(initial?.remindDays) ? [...(initial!.remindDays as number[])] : []
  );
  const blankStep = (): Step => ({ text: '', minutes: null, note: null, emoji: null });
  const [steps, setSteps] = useState<Step[]>(() => {
    const parsed = parseSteps(initial?.items);
    return parsed.length ? parsed : [blankStep()];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const patchStep = (i: number, patch: Partial<Step>) => setSteps(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStep = () => setSteps(prev => [...prev, blankStep()]);
  const insertStep = (i: number) => setSteps(prev => { const n = [...prev]; n.splice(i + 1, 0, blankStep()); return n; });
  const removeStep = (i: number) => setSteps(prev => (prev.length === 1 ? [blankStep()] : prev.filter((_, idx) => idx !== i)));
  const toggleDay = (d: number) =>
    setRemindDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b)));
  const move = (i: number, dir: -1 | 1) => setSteps(prev => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const save = async () => {
    setError('');
    const cleanName = name.trim();
    const items = steps
      .map(s => ({ text: s.text.trim(), minutes: s.minutes, note: s.note?.trim() || null, emoji: s.emoji?.trim() || null }))
      .filter(s => s.text.length > 0);
    if (!cleanName) { setError('Zadejte název postupu.'); return; }
    if (items.length === 0) { setError('Přidejte alespoň jeden krok.'); return; }
    setSaving(true);
    try {
      const reminderOn = remindAnchor !== 'time' || !!remindAt;
      const payload = {
        name: cleanName,
        description: description.trim(),
        icon,
        items,
        remindAnchor,
        remindAt: remindAnchor === 'time' ? (remindAt || null) : null,
        remindDays: reminderOn ? remindDays : [],
      };
      const res = await fetch(initial ? `/api/procedures/${initial.id}` : '/api/procedures', {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Uložení se nezdařilo.'); return; }
      onSaved(data.procedure as Procedure);
    } catch {
      setError('Uložení se nezdařilo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4" onClick={onClose}>
      <div
        className="modal-sheet w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-xl font-bold tracking-tight text-[#16181A]">{initial ? 'Upravit postup' : 'Nový postup'}</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-black/45 hover:bg-black/[0.06] hover:text-black transition">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto scrollbar-thin px-5 pb-2 space-y-4">
          <div>
            <label className="block text-xs font-medium text-black/50 mb-1.5">Název</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Např. Otevírání"
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-black/50 mb-1.5">Popis (nepovinné)</label>
            <input
              value={description ?? ''}
              onChange={e => setDescription(e.target.value)}
              placeholder="Krátký popis postupu"
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-black/50 mb-1.5">Ikona</label>
            <div className="flex flex-wrap gap-2">
              {ICON_CHOICES.map(name => (
                <button
                  key={name}
                  onClick={() => setIcon(name)}
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition ${
                    icon === name
                      ? 'bg-[#C8F542] border-[#C8F542] text-black'
                      : 'bg-black/[0.04] border-black/[0.08] text-black/50 hover:text-black hover:bg-black/[0.06]'
                  }`}
                >
                  <Icon name={name} size={20} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-black/50 mb-1.5">Kroky</label>
            <p className="mb-2 text-xs text-black/40">Emoji a čas jsou nepovinné. Poznámka se zobrazí pod krokem.</p>
            <div className="space-y-2.5">
              {steps.map((s, i) => (
                <div key={i} className="space-y-2.5">
                <div className="rounded-2xl bg-black/[0.03] border border-black/[0.07] p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={s.emoji ?? ''}
                      onChange={e => patchStep(i, { emoji: e.target.value })}
                      placeholder="🙂"
                      maxLength={4}
                      className="w-11 flex-shrink-0 text-center rounded-xl bg-white/70 border border-black/[0.08] px-1 py-2.5 text-lg focus:border-[#C8F542]/50 focus:outline-none"
                    />
                    <input
                      value={s.text}
                      onChange={e => patchStep(i, { text: e.target.value })}
                      placeholder={`Krok ${i + 1}`}
                      className="flex-1 min-w-0 rounded-xl bg-white/70 border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
                    />
                    <div className="relative flex-shrink-0">
                      <input
                        type="number" min={0} inputMode="numeric"
                        value={s.minutes ?? ''}
                        onChange={e => patchStep(i, { minutes: e.target.value ? Math.max(0, parseInt(e.target.value)) : null })}
                        placeholder="min"
                        className="w-[68px] rounded-xl bg-white/70 border border-black/[0.08] pl-3 pr-7 py-2.5 text-sm tabular-nums text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-black/35">m</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={s.note ?? ''}
                      onChange={e => patchStep(i, { note: e.target.value })}
                      placeholder="Poznámka (nepovinné)"
                      className="flex-1 min-w-0 rounded-xl bg-white/50 border border-black/[0.06] px-3.5 py-2 text-xs text-black/70 placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none"
                    />
                    <div className="flex flex-shrink-0 items-center">
                      <button onClick={() => move(i, -1)} disabled={i === 0} title="Nahoru" className="flex h-8 w-7 items-center justify-center rounded-lg text-black/35 hover:text-black hover:bg-black/[0.06] disabled:opacity-25 transition">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg>
                      </button>
                      <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} title="Dolů" className="flex h-8 w-7 items-center justify-center rounded-lg text-black/35 hover:text-black hover:bg-black/[0.06] disabled:opacity-25 transition">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                      <button onClick={() => removeStep(i)} title="Odebrat" className="flex h-8 w-7 items-center justify-center rounded-lg text-black/35 hover:text-red-600 hover:bg-red-500/10 transition">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div className="flex justify-center">
                    <button type="button" onClick={() => insertStep(i)} title="Přidat krok sem"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-white border border-black/10 text-black/40 hover:text-[#5B7A08] hover:border-[#C8F542]/60 shadow-sm transition">
                      <Icon name="plus" size={13} />
                    </button>
                  </div>
                )}
                </div>
              ))}
            </div>
            <button onClick={addStep} className="mt-2.5 inline-flex items-center gap-1.5 rounded-full glass border border-black/10 px-4 py-2 text-sm font-medium text-[#16181A] hover:bg-black/[0.05] transition">
              <Icon name="plus" size={16} /> Přidat krok
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-black/50 mb-1.5">Připomínka (nepovinné)</label>
            <p className="mb-2 text-xs text-black/40">Postup se v daný čas sám otevře a lidem na směně přijde upozornění.</p>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {([['time', 'V určený čas'], ['open', 'Při otevření'], ['close', 'Při zavření']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRemindAnchor(val)}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium border transition ${
                    remindAnchor === val ? 'bg-[#16181A] text-white border-transparent' : 'bg-black/[0.04] border-black/[0.08] text-black/60 hover:text-black'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {remindAnchor === 'time' ? (
              <div className="flex items-center gap-2">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-black/[0.04] border border-black/[0.08] text-[#5B7A08]">
                  <Icon name="clock" size={20} />
                </span>
                <input
                  type="time"
                  value={remindAt ?? ''}
                  onChange={e => setRemindAt(e.target.value)}
                  className="flex-1 min-w-0 rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] tabular-nums focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
                />
                {remindAt && (
                  <button
                    onClick={() => { setRemindAt(''); setRemindDays([]); }}
                    title="Zrušit připomínku"
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-black/40 hover:bg-black/[0.06] hover:text-black transition"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#5B7A08] bg-[#C8F542]/10 border border-[#C8F542]/20 rounded-xl px-3 py-2.5">
                Připomene se podle otevírací doby daného dne{remindAnchor === 'open' ? ' (při otevření)' : ' (při zavření)'} — pokud je zavřeno, ten den se nepřipomene.
              </p>
            )}
            {(remindAnchor !== 'time' || remindAt) && (
              <div className="mt-2.5">
                <p className="mb-1.5 text-xs text-black/40">Ve dnech (nevybráno = každý den)</p>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((label, d) => {
                    const on = remindDays.includes(d);
                    return (
                      <button
                        key={d}
                        onClick={() => toggleDay(d)}
                        className={`h-9 min-w-[2.5rem] px-1 rounded-full text-sm font-medium border transition ${
                          on
                            ? 'bg-[#C8F542] border-[#C8F542] text-black'
                            : 'bg-black/[0.04] border-black/[0.08] text-black/50 hover:text-black hover:bg-black/[0.06]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-black/[0.07]">
          <button onClick={onClose} className="rounded-full glass border border-black/10 text-[#16181A] px-5 py-2.5 font-medium hover:bg-black/[0.05] transition">
            Zrušit
          </button>
          <button onClick={save} disabled={saving} className="flex-1 rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 hover:brightness-110 transition disabled:opacity-60">
            {saving ? 'Ukládám…' : initial ? 'Uložit změny' : 'Vytvořit postup'}
          </button>
        </div>
      </div>
    </div>
  );
}
