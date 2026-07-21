'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icons';

type Suggestion = {
  id: number;
  title: string;
  content: string | null;
  status: string;
  authorId: number;
  authorName: string | null;
  authorAvatar: string | null;
  createdAt: string;
  votes: number;
  hasVoted: boolean;
};

const inputClass =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

// Pipeline stages, in the order the employer moves an idea through.
const STATUS_META: Record<string, { label: string; chip: string }> = {
  new:      { label: 'Nový',        chip: 'bg-orange-500/15 text-orange-600' },
  planned:  { label: 'Naplánováno', chip: 'bg-[#0A84FF]/15 text-[#0A6FE0]' },
  done:     { label: 'Hotovo',      chip: 'bg-[#C8F542]/20 text-[#5B7A08]' },
  declined: { label: 'Zamítnuto',   chip: 'bg-black/[0.06] text-black/45' },
};
const STATUS_FLOW: { id: string; label: string }[] = [
  { id: 'new', label: 'Nový' },
  { id: 'planned', label: 'Naplánovat' },
  { id: 'done', label: 'Hotovo' },
  { id: 'declined', label: 'Zamítnout' },
];

const FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Vše' },
  { id: 'new', label: 'Nové' },
  { id: 'planned', label: 'Naplánované' },
  { id: 'done', label: 'Hotové' },
  { id: 'declined', label: 'Zamítnuté' },
];

const relDate = (iso: string) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = 86400000;
  if (diff < day && d.getDate() === new Date().getDate()) return 'dnes';
  if (diff < 2 * day) return 'včera';
  if (diff < 7 * day) return `před ${Math.floor(diff / day)} dny`;
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });
};

export default function SuggestionsBoard() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [isEmployer, setIsEmployer] = useState(false);
  const [meId, setMeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const d = await fetch('/api/suggestions').then(r => r.json());
      setItems(Array.isArray(d.suggestions) ? d.suggestions : []);
      setIsEmployer(!!d.isEmployer);
      setMeId(typeof d.meId === 'number' ? d.meId : null);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setErr('');
    if (!title.trim()) { setErr('Napiš krátký název podnětu.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      if (res.ok) {
        setTitle(''); setContent(''); setComposing(false);
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || 'Nepodařilo se odeslat.');
      }
    } catch { setErr('Chyba serveru.'); }
    setSubmitting(false);
  };

  const toggleVote = async (s: Suggestion) => {
    // Optimistic flip.
    setItems(list => list.map(x => x.id === s.id
      ? { ...x, hasVoted: !x.hasVoted, votes: x.votes + (x.hasVoted ? -1 : 1) }
      : x));
    try {
      const res = await fetch(`/api/suggestions/${s.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggleVote: true }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setItems(list => list.map(x => x.id === s.id ? { ...x, votes: d.votes, hasVoted: d.hasVoted } : x));
    } catch { load(); }
  };

  const setStatus = async (s: Suggestion, status: string) => {
    const prev = items;
    setItems(list => list.map(x => x.id === s.id ? { ...x, status } : x));
    try {
      const res = await fetch(`/api/suggestions/${s.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch { setItems(prev); }
  };

  const remove = async (s: Suggestion) => {
    if (!confirm('Smazat tento podnět?')) return;
    const prev = items;
    setItems(list => list.filter(x => x.id !== s.id));
    try {
      const res = await fetch(`/api/suggestions/${s.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch { setItems(prev); }
  };

  const counts = items.reduce((a, s) => { a[s.status] = (a[s.status] ?? 0) + 1; return a; }, {} as Record<string, number>);
  const shown = filter === 'all' ? items : items.filter(s => s.status === filter);

  return (
    <div className="p-6 max-w-3xl mx-auto w-full space-y-6">
      {/* Intro */}
      <div className="glass-card p-5 sm:p-6 flex items-start gap-4">
        <div className="grid place-items-center h-12 w-12 shrink-0 rounded-2xl bg-[#C8F542]/20 text-[#5B7A08]">
          <Icon name="bulb" size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold tracking-tight text-[#16181A]">Nápady na vylepšení</h3>
          <p className="text-black/50 text-sm mt-0.5">
            {isEmployer
              ? 'Podněty od týmu — co by lidem usnadnilo práci. Přidej se hlasem nebo posuň nápad dál.'
              : 'Máš nápad, co by šlo zlepšit? Přidej podnět a vedení ho uvidí. Palcem podpoříš nápady ostatních.'}
          </p>
        </div>
      </div>

      {/* Add button */}
      <button onClick={() => { setComposing(true); setErr(''); }}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#16181A] text-white font-semibold px-6 py-3 text-sm hover:bg-black transition">
        <Icon name="plus" size={18} /> Přidat podnět
      </button>

      {/* Filters */}
      {items.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
          {FILTERS.map(f => {
            const cnt = f.id === 'all' ? items.length : (counts[f.id] ?? 0);
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
                  filter === f.id ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
                }`}>
                {f.label} {cnt > 0 && <span className={filter === f.id ? 'text-white/60' : 'text-black/35'}>· {cnt}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <div className="mx-auto grid place-items-center h-14 w-14 rounded-2xl bg-black/[0.04] text-black/30 mb-3">
            <Icon name="bulb" size={26} />
          </div>
          <p className="text-black/50 text-sm">{items.length === 0 ? 'Zatím žádné podněty. Buď první!' : 'V této kategorii nic není.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(s => {
            const meta = STATUS_META[s.status] ?? STATUS_META.new;
            const mine = meId != null && s.authorId === meId;
            return (
              <div key={s.id} className="glass-card p-5">
                <div className="flex items-start gap-3">
                  {/* Vote pill */}
                  <button onClick={() => toggleVote(s)}
                    className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-12 rounded-2xl border py-2 transition ${
                      s.hasVoted ? 'bg-[#C8F542]/20 border-[#C8F542]/50 text-[#5B7A08]' : 'bg-white border-black/[0.08] text-black/45 hover:border-black/20'
                    }`} title={s.hasVoted ? 'Zrušit podporu' : 'Podpořit'}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg>
                    <span className="text-sm font-bold tabular-nums">{s.votes}</span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold tracking-tight text-[#16181A] leading-snug min-w-0">{s.title}</h4>
                      <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${meta.chip}`}>{meta.label}</span>
                    </div>
                    {s.content && <p className="text-sm text-black/60 mt-1.5 whitespace-pre-wrap break-words">{s.content}</p>}
                    <div className="flex items-center gap-2 mt-2.5 text-xs text-black/45">
                      <span className="text-base leading-none">{s.authorAvatar ?? '👤'}</span>
                      <span className="font-medium text-black/55 truncate">{s.authorName ?? 'Neznámý'}{mine ? ' (ty)' : ''}</span>
                      <span className="text-black/25">·</span>
                      <span className="whitespace-nowrap">{relDate(s.createdAt)}</span>
                    </div>

                    {/* Employer pipeline controls */}
                    {isEmployer && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-black/[0.06]">
                        {STATUS_FLOW.map(st => (
                          <button key={st.id} onClick={() => setStatus(s, st.id)} disabled={s.status === st.id}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                              s.status === st.id
                                ? 'bg-[#16181A] text-white cursor-default'
                                : 'bg-black/[0.04] text-black/55 hover:bg-black/[0.08]'
                            }`}>
                            {st.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {(isEmployer || mine) && (
                  <div className="flex justify-end mt-1">
                    <button onClick={() => remove(s)}
                      className="text-xs text-black/35 hover:text-red-600 rounded-full px-2 py-1 transition">
                      Smazat
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compose modal */}
      {composing && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-4" onClick={() => setComposing(false)}>
          <div className="modal-sheet rounded-3xl p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="grid place-items-center h-10 w-10 rounded-2xl bg-[#C8F542]/20 text-[#5B7A08]"><Icon name="bulb" size={20} /></div>
              <h3 className="text-lg font-bold tracking-tight text-[#16181A]">Nový podnět</h3>
            </div>
            {err && (
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm flex items-center gap-2 mb-3">
                <Icon name="warning" size={16} /> {err}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Co navrhuješ?</label>
                <input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} autoFocus
                  placeholder="Např. Přidat druhý mlýnek na kávu" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Vysvětli to blíž (nepovinné)</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} maxLength={2000}
                  placeholder="Proč to pomůže, jak by to mělo fungovat…" className={`${inputClass} resize-none`} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setComposing(false)}
                className="flex-1 rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-5 py-3 text-sm hover:bg-black/[0.08] transition">
                Zrušit
              </button>
              <button onClick={submit} disabled={submitting}
                className="flex-1 rounded-full bg-[#16181A] text-white font-semibold px-5 py-3 text-sm hover:bg-black disabled:opacity-50 transition inline-flex items-center justify-center gap-2">
                {submitting ? 'Odesílám…' : <>Odeslat podnět <Icon name="send" size={16} /></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
