'use client';

import { useState, useEffect, useMemo } from 'react';
import { Icon } from '../Icons';

interface Task {
  id: number;
  title: string;
  description?: string | null;
  assignedTo: number;
  createdBy: number;
  priority: string;
  status: string;
  dueDate?: string | null;
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

const emptyForm = () => ({ title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '' });

export default function TaskManager({ user }: { user: { id?: string | number } }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('Zadejte název úkolu.'); return; }
    if (!form.assignedTo) { setError('Vyberte, komu úkol přiřadit.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(), description: form.description.trim() || null,
          assignedTo: parseInt(form.assignedTo), priority: form.priority, dueDate: form.dueDate || null,
        }),
      });
      const d = await res.json();
      if (res.ok) { setTasks(prev => [d, ...prev]); setForm(emptyForm()); setShowForm(false); }
      else setError(d.error || 'Úkol se nepodařilo vytvořit.');
    } catch { setError('Chyba serveru.'); }
    setSaving(false);
  };

  const remove = async (t: Task) => {
    if (!confirm(`Smazat úkol „${t.title}"?`)) return;
    const prev = tasks;
    setTasks(ts => ts.filter(x => x.id !== t.id));
    try {
      const res = await fetch(`/api/tasks?id=${t.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch { setTasks(prev); }
  };

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  const counts = {
    all: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto w-full">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#16181A]">Úkoly</h1>
          <p className="text-black/50 text-sm mt-1">Zadávejte úkoly zaměstnancům a sledujte jejich plnění.</p>
        </div>
        <button onClick={() => { setShowForm(v => !v); setError(''); }}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
          <Icon name="plus" size={18} /> Nový úkol
        </button>
      </div>

      {showForm && (
        <form onSubmit={save} className="glass-card p-5 sm:p-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Název úkolu</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Např. Umýt okna" className={inputClass} autoFocus />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Popis (nepovinné)</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className={`${inputClass} resize-none`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Přiřadit komu</label>
              <select value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} className={inputClass}>
                <option value="">— vyber zaměstnance —</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.avatar} {m.name}</option>)}
              </select>
              {members.length === 0 && <p className="text-[11px] text-black/40 mt-1.5">Zatím nemáš žádné zaměstnance — pozvi je v Nastavení týmu.</p>}
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Termín (nepovinné)</label>
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className={`${inputClass} appearance-none`} style={{ WebkitAppearance: 'none' }} />
            </div>
          </div>
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 disabled:opacity-50 transition whitespace-nowrap">
              {saving ? 'Ukládám…' : 'Vytvořit úkol'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(''); }} className="rounded-full glass border border-black/10 text-[#16181A] px-5 py-2.5 text-sm font-medium hover:bg-black/[0.05] transition whitespace-nowrap">
              Zrušit
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-1 glass rounded-full p-1 w-fit max-w-full overflow-x-auto scrollbar-thin">
        {[['all', 'Vše'], ['pending', 'Čeká'], ['in_progress', 'Probíhá'], ['done', 'Hotovo']].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition ${filter === id ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'}`}>
            {label} ({counts[id as keyof typeof counts]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-black/45">
          {tasks.length === 0 ? 'Zatím žádné úkoly. Vytvoř první tlačítkem „Nový úkol".' : 'Žádné úkoly v této kategorii.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(t => {
            const m = memberById.get(t.assignedTo);
            const prio = PRIORITIES.find(p => p.value === t.priority) ?? PRIORITIES[1];
            return (
              <div key={t.id} className="glass-card p-4 flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${prio.dot}`} title={`Priorita: ${prio.label}`} />
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold text-sm text-[#16181A] truncate ${t.status === 'done' ? 'line-through text-black/40' : ''}`}>{t.title}</p>
                  <p className="text-xs text-black/45 truncate">
                    {m ? `${m.avatar ?? '👤'} ${m.name}` : 'Neznámý'}
                    {t.dueDate ? ` · do ${new Date(t.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}` : ''}
                  </p>
                </div>
                <span className={`text-xs font-medium rounded-full px-2.5 py-1 shrink-0 whitespace-nowrap ${statusChip(t.status)}`}>{statusLabel(t.status)}</span>
                <button onClick={() => remove(t)} title="Smazat" className="rounded-full glass w-8 h-8 flex items-center justify-center text-black/50 hover:text-red-600 shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
