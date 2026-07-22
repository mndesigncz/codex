'use client';

import { useState, useEffect, useMemo } from 'react';
import { Icon } from '../Icons';
import { useCurrency } from '../CurrencyProvider';
import { TaskChecklist, recurrenceLabel, RECURRENCE_OPTIONS, ChecklistItem } from '../TaskChecklist';
import TaskWeekBoard from '../TaskWeekBoard';

interface Task {
  id: number;
  title: string;
  description?: string | null;
  assignedTo: number | null;
  teamTask?: boolean;
  createdBy: number;
  priority: string;
  status: string;
  dueDate?: string | null;
  recurrence?: string | null;
  seriesId?: string | null;
  checklist?: ChecklistItem[];
  completedBy?: number | null;
  completedByName?: string | null;
  completedByAvatar?: string | null;
}
interface Member { id: number; name: string; role: string; avatar?: string }

const inputClass =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

const PRIORITIES = [
  { value: 'low', label: 'Nízká', dot: 'bg-[#C8F542]' },
  { value: 'medium', label: 'Střední', dot: 'bg-orange-400' },
  { value: 'high', label: 'Vysoká', dot: 'bg-red-500' },
];
const statusLabel = (s: string) => s === 'done' ? 'Hotovo' : s === 'in_progress' ? 'Probíhá' : 'Čeká';
const statusChip = (s: string) => s === 'done' ? 'bg-[#C8F542]/15 text-[#5B7A08]' : s === 'in_progress' ? 'bg-[#0A84FF]/15 text-[#0A6FE0]' : 'bg-black/[0.05] text-black/55';

const emptyForm = () => ({ title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '', recurrence: '', checklist: [] as ChecklistItem[] });

export default function TaskManager({ user }: { user: { id?: string | number } }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSeries, setEditingSeries] = useState(false);
  const [view, setView] = useState<'list' | 'week'>('list');
  const { weekStart } = useCurrency();
  const today = new Date().toISOString().split('T')[0];

  const load = async () => {
    try {
      const [tk, tm] = await Promise.all([
        fetch('/api/tasks').then(r => r.json()).catch(() => []),
        fetch('/api/teams').then(r => r.json()).catch(() => ({})),
      ]);
      setTasks(Array.isArray(tk) ? tk : []);
      setMembers((tm?.members ?? []).filter((m: Member) => m.role === 'employee' || m.role === 'employer'));
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const memberById = useMemo(() => {
    const m = new Map<number, Member>();
    members.forEach(x => m.set(x.id, x));
    return m;
  }, [members]);

  const closeForm = () => { setShowForm(false); setEditingId(null); setEditingSeries(false); setForm(emptyForm()); setError(''); };

  // Open the form pre-filled to edit an existing task.
  const openEdit = (t: Task) => {
    setEditingId(t.id);
    setEditingSeries(!!t.seriesId);
    setForm({
      title: t.title, description: t.description ?? '',
      assignedTo: t.assignedTo == null ? '' : String(t.assignedTo),
      priority: t.priority, dueDate: t.dueDate ?? '',
      recurrence: t.recurrence ?? '', checklist: t.checklist ?? [],
    });
    setShowForm(true); setError('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('Zadejte název úkolu.'); return; }
    if (!editingId && form.assignedTo === '' && !form.dueDate) { setError('U úkolu pro kohokoliv vyber den (termín).'); return; }
    setSaving(true);
    try {
      if (editingId) {
        // Edit — shared fields for a series; also date/assignee for a single task.
        const res = await fetch('/api/tasks', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId, edit: true,
            title: form.title.trim(), description: form.description.trim() || null, priority: form.priority,
            ...(editingSeries ? {} : { assignedTo: form.assignedTo === '' ? null : parseInt(form.assignedTo), dueDate: form.dueDate || null }),
          }),
        });
        const d = await res.json();
        if (res.ok) { closeForm(); load(); }
        else setError(d.error || 'Úkol se nepodařilo upravit.');
      } else {
        const res = await fetch('/api/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title.trim(), description: form.description.trim() || null,
            assignedTo: form.assignedTo === '' ? null : parseInt(form.assignedTo),
            priority: form.priority, dueDate: form.dueDate || null,
            recurrence: form.recurrence || null,
            checklist: form.checklist.filter(i => i.text.trim()).map(i => ({ text: i.text.trim(), done: false })),
          }),
        });
        const d = await res.json();
        if (res.ok) { closeForm(); load(); } // reload to include generated upcoming occurrences
        else setError(d.error || 'Úkol se nepodařilo vytvořit.');
      }
    } catch { setError('Chyba serveru.'); }
    setSaving(false);
  };

  // Toggle done, warning first if it isn't the task's day.
  const completeTask = async (t: Task, done: boolean) => {
    if (done && t.dueDate && t.dueDate !== today) {
      const d = new Date(t.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
      if (!confirm(`Tohle není dnešní úkol (termín: ${d}). Opravdu ho označit jako hotový?`)) return;
    }
    const status = done ? 'done' : 'pending';
    const prev = tasks;
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, status } : x));
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, status }),
      });
      if (!res.ok) throw new Error();
    } catch { setTasks(prev); }
  };

  const remove = async (t: Task) => {
    const isSeries = !!t.seriesId;
    if (!confirm(isSeries ? `Smazat celý opakovaný úkol „${t.title}" (i nadcházející)?` : `Smazat úkol „${t.title}"?`)) return;
    const prev = tasks;
    // A series delete removes every occurrence of it.
    setTasks(ts => ts.filter(x => isSeries ? x.seriesId !== t.seriesId : x.id !== t.id));
    try {
      const res = await fetch(`/api/tasks?id=${t.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch { setTasks(prev); }
  };

  const toggleChecklistItem = async (t: Task, index: number) => {
    const next = (t.checklist ?? []).map((it, i) => i === index ? { ...it, done: !it.done } : it);
    const prev = tasks;
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, checklist: next } : x));
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, checklist: next }),
      });
      if (!res.ok) throw new Error();
    } catch { setTasks(prev); }
  };

  // Create-form checklist editing helpers.
  const addChecklistLine = () => setForm(f => ({ ...f, checklist: [...f.checklist, { text: '', done: false }] }));
  const setChecklistLine = (i: number, text: string) => setForm(f => ({ ...f, checklist: f.checklist.map((it, idx) => idx === i ? { ...it, text } : it) }));
  const removeChecklistLine = (i: number) => setForm(f => ({ ...f, checklist: f.checklist.filter((_, idx) => idx !== i) }));

  // Day-based grouping for the list view.
  const byDate = (a: Task, b: Task) => String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? ''));
  const undone = tasks.filter(t => t.status !== 'done');
  const overdue = undone.filter(t => t.dueDate && t.dueDate < today).sort(byDate);
  const todayTasks = undone.filter(t => !t.dueDate || t.dueDate === today).sort(byDate);
  const upcoming = undone.filter(t => t.dueDate && t.dueDate > today).sort(byDate);
  const doneTasks = tasks.filter(t => t.status === 'done').sort((a, b) => byDate(b, a)).slice(0, 30);

  const labelFor = (t: Task) => t.teamTask ? 'Kdokoliv' : (t.assignedTo != null ? (memberById.get(t.assignedTo)?.name ?? '') : '');

  const renderCard = (t: Task, compact = false) => {
    const m = t.assignedTo != null ? memberById.get(t.assignedTo) : undefined;
    const who = t.teamTask ? '🗓️ Kdokoliv' : (m ? `${m.avatar ?? '👤'} ${m.name}` : 'Neznámý');
    const prio = PRIORITIES.find(p => p.value === t.priority) ?? PRIORITIES[1];
    const done = t.status === 'done';
    return (
      <div key={t.id} className={`glass-card ${compact ? 'p-3' : 'p-4'}`}>
        <div className="flex items-start gap-2.5">
          <button onClick={() => completeTask(t, !done)} title={done ? 'Označit jako nehotové' : 'Označit jako hotové'}
            className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition ${done ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/20 hover:border-[#C8F542]/60'}`}>
            {done && <span className="text-[11px] font-bold">✓</span>}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1.5">
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${prio.dot}`} title={`Priorita: ${prio.label}`} />
              <p className={`font-semibold text-sm text-[#16181A] ${compact ? '' : 'truncate'} ${done ? 'line-through text-black/40' : ''}`}>{t.title}</p>
            </div>
            <p className={`text-xs text-black/45 mt-0.5 flex items-center gap-1.5 ${compact ? 'flex-wrap' : 'truncate'}`}>
              <span className={compact ? '' : 'truncate'}>
                {who}
                {!compact && t.dueDate ? ` · ${new Date(t.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })}` : ''}
                {done && t.completedByName ? ` · splnil ${t.completedByName}` : ''}
              </span>
              {recurrenceLabel(t.recurrence) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-2 py-0.5 text-[10px] font-semibold shrink-0">↻ {recurrenceLabel(t.recurrence)}</span>
              )}
            </p>
            {!compact && t.checklist && t.checklist.length > 0 && (
              <TaskChecklist items={t.checklist} onToggle={i => toggleChecklistItem(t, i)} />
            )}
          </div>
          {!compact && (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => openEdit(t)} title="Upravit" className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/45 hover:text-[#16181A]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
              <button onClick={() => remove(t)} title="Smazat" className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/45 hover:text-red-600">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const section = (title: string, list: Task[], tone = 'text-black/45') =>
    list.length > 0 && (
      <div className="space-y-2.5">
        <h3 className={`text-xs font-bold uppercase tracking-[0.13em] ${tone}`}>{title} ({list.length})</h3>
        <div className="space-y-2.5">{list.map(t => renderCard(t))}</div>
      </div>
    );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto w-full">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#16181A]">Úkoly</h1>
          <p className="text-black/50 text-sm mt-1">Úkoly na den nebo pro konkrétní lidi — a jejich plnění.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex gap-1 rounded-full glass border border-black/[0.07] p-1">
            {([['list', 'Seznam'], ['week', 'Týden']] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${view === v ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'}`}>
                {lbl}
              </button>
            ))}
          </div>
          <button onClick={() => { if (showForm) closeForm(); else { setForm(emptyForm()); setEditingId(null); setShowForm(true); setError(''); } }}
            className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition inline-flex items-center gap-1.5 whitespace-nowrap">
            <Icon name="plus" size={18} /> Nový úkol
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={save} className="glass-card p-5 sm:p-6 space-y-4">
          <h3 className="font-bold tracking-tight text-[#16181A]">{editingId ? 'Upravit úkol' : 'Nový úkol'}</h3>
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Název úkolu</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Např. Umýt okna" className={inputClass} autoFocus />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Popis (nepovinné)</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className={`${inputClass} resize-none`} />
          </div>
          {editingSeries ? (
            <p className="text-xs text-black/50 bg-black/[0.03] border border-black/[0.06] rounded-xl px-3 py-2.5">
              U opakovaného úkolu se úprava názvu, popisu a priority projeví u všech výskytů. Termín a přiřazení se u opakovaného úkolu nemění zde — případně ho smaž a založ znovu.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Kdo úkol udělá</label>
                <select value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} className={inputClass}>
                  <option value="">🗓️ Kdokoliv (podle dne)</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.avatar} {m.name}</option>)}
                </select>
                <p className="text-[11px] text-black/40 mt-1.5">
                  {form.assignedTo === ''
                    ? 'Úkol na daný den — splní ho kdokoliv z týmu.'
                    : 'Úkol pro konkrétního člověka.'}
                </p>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">
                  Termín {form.assignedTo === '' ? '(povinné)' : '(nepovinné)'}
                </label>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className={`${inputClass} appearance-none`} style={{ WebkitAppearance: 'none' }} />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Priorita</label>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map(p => (
                <button key={p.value} type="button" onClick={() => setForm(f => ({ ...f, priority: p.value }))}
                  className={`rounded-full px-4 py-2 text-sm font-medium border transition inline-flex items-center gap-2 whitespace-nowrap ${form.priority === p.value ? 'bg-[#16181A] text-white border-[#16181A]' : 'bg-black/[0.04] border-black/[0.08] text-black/60 hover:text-black'}`}>
                  <span className={`w-2 h-2 rounded-full ${p.dot}`} /> {p.label}
                </button>
              ))}
            </div>
          </div>
          {/* Recurrence + checklist definition only when creating a new task. */}
          {!editingId && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Opakování</label>
                  <select value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}
                    className={`${inputClass} appearance-none`} style={{ WebkitAppearance: 'none' }}>
                    {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {form.recurrence && <p className="text-[11px] text-black/40 mt-1.5">Dopředu se připraví nejbližší výskyty; po splnění se neobnoví hned.</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Kontrolní seznam (nepovinné)</label>
                <div className="space-y-2">
                  {form.checklist.map((it, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={it.text} onChange={e => setChecklistLine(i, e.target.value)}
                        placeholder={`Bod ${i + 1}`} className={`${inputClass} !py-2.5`} />
                      <button type="button" onClick={() => removeChecklistLine(i)}
                        className="rounded-full glass w-9 h-9 flex items-center justify-center text-black/45 hover:text-red-600 shrink-0">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addChecklistLine}
                    className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] text-black/60 px-4 py-2 text-sm font-medium hover:bg-black/[0.07] transition">
                    <Icon name="plus" size={15} /> Přidat bod
                  </button>
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 disabled:opacity-50 transition whitespace-nowrap">
              {saving ? 'Ukládám…' : editingId ? 'Uložit změny' : 'Vytvořit úkol'}
            </button>
            <button type="button" onClick={closeForm} className="rounded-full glass border border-black/10 text-[#16181A] px-5 py-2.5 text-sm font-medium hover:bg-black/[0.05] transition whitespace-nowrap">
              Zrušit
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : view === 'week' ? (
        <TaskWeekBoard tasks={tasks} weekStart={weekStart}
          onComplete={(t, done) => completeTask(t as Task, done)}
          labelFor={(t) => labelFor(t as Task)}
          onOpen={(t) => openEdit(t as Task)} />
      ) : tasks.length === 0 ? (
        <div className="glass-card p-8 text-center text-black/45">Zatím žádné úkoly. Vytvoř první tlačítkem „Nový úkol".</div>
      ) : (
        <div className="space-y-6">
          {section('Po termínu', overdue, 'text-red-600')}
          {section('Dnes', todayTasks, 'text-[#5B7A08]')}
          {section('Budoucí úkoly', upcoming)}
          {section('Hotové', doneTasks)}
        </div>
      )}
    </div>
  );
}
