'use client';

// Active team polls: pinned above the chat. One tap = one vote (changeable).

import { useCallback, useEffect, useState } from 'react';

export default function PollsStrip({ canCreate = true, isEmployer = false, meId }: {
  canCreate?: boolean; isEmployer?: boolean; meId?: number;
}) {
  const [polls, setPolls] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [err, setErr] = useState('');

  const load = useCallback(() =>
    fetch('/api/polls').then(r => r.json())
      .then(d => setPolls(Array.isArray(d.polls) ? d.polls : []))
      .catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const vote = async (pollId: number, idx: number) => {
    const res = await fetch('/api/polls', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pollId, vote: idx }),
    }).catch(() => null);
    if (res?.ok) await load();
  };

  const create = async () => {
    setErr('');
    const res = await fetch('/api/polls', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, options: opts }),
    }).catch(() => null);
    if (res?.ok) { setQuestion(''); setOpts(['', '']); setCreating(false); await load(); }
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Anketu se nepodařilo založit.'); }
  };

  if (polls.length === 0 && !canCreate) return null;

  return (
    <div className="space-y-2 px-3 pt-2">
      {polls.map(p => (
        <div key={p.id} className="rounded-2xl bg-[#C8F542]/[0.08] border border-[#C8F542]/25 p-3.5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-sm font-semibold text-[#16181A] min-w-0">📊 {p.question}
              <span className="font-normal text-black/40"> · {p.authorName}</span>
            </p>
            {(isEmployer || p.createdBy === meId) && (
              <button onClick={async () => {
                if (!confirm('Uzavřít anketu?')) return;
                await fetch('/api/polls', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, close: true }) }).catch(() => null);
                await load();
              }} className="shrink-0 text-[11px] text-black/35 hover:text-black">uzavřít</button>
            )}
          </div>
          <div className="space-y-1.5">
            {p.options.map((o: string, i: number) => {
              const pct = p.total > 0 ? Math.round((p.counts[i] / p.total) * 100) : 0;
              const mine = p.myVote === i;
              return (
                <button key={i} onClick={() => vote(p.id, i)}
                  className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition ${
                    mine ? 'border-[#5B9E00]/50 bg-white/70' : 'border-black/[0.07] bg-white/50 hover:bg-white/80'
                  }`}>
                  <span className="absolute inset-y-0 left-0 bg-[#C8F542]/30 transition-all" style={{ width: `${pct}%` }} />
                  <span className="relative flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[#16181A]">{mine ? '● ' : ''}{o}</span>
                    <span className="shrink-0 text-xs text-black/45 tabular-nums">{p.counts[i]} ({pct} %)</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-black/35 mt-1.5">{p.total} {p.total === 1 ? 'hlas' : p.total <= 4 ? 'hlasy' : 'hlasů'} · kliknutím hlasuješ (jde změnit)</p>
        </div>
      ))}

      {canCreate && (
        creating ? (
          <div className="rounded-2xl bg-black/[0.03] border border-black/[0.07] p-3.5 space-y-2">
            {err && <p className="text-xs text-red-600">{err}</p>}
            <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Otázka ankety…" maxLength={200}
              className="w-full rounded-xl bg-white/70 border border-black/[0.08] px-3 py-2 text-sm text-[#16181A] placeholder-black/30 focus:outline-none focus:border-[#C8F542]/50" />
            {opts.map((o, i) => (
              <input key={i} value={o} onChange={e => setOpts(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                placeholder={`Možnost ${i + 1}`} maxLength={80}
                className="w-full rounded-xl bg-white/70 border border-black/[0.08] px-3 py-2 text-sm text-[#16181A] placeholder-black/30 focus:outline-none focus:border-[#C8F542]/50" />
            ))}
            <div className="flex flex-wrap gap-2">
              {opts.length < 8 && (
                <button onClick={() => setOpts(prev => [...prev, ''])} className="rounded-full glass px-3 py-1.5 text-xs text-black/55 hover:text-black">+ možnost</button>
              )}
              <span className="flex-1" />
              <button onClick={() => setCreating(false)} className="rounded-full glass px-3.5 py-1.5 text-xs font-semibold text-black/55 hover:text-black">Zrušit</button>
              <button onClick={create} disabled={!question.trim() || opts.filter(o => o.trim()).length < 2}
                className="rounded-full bg-[#16181A] text-white px-4 py-1.5 text-xs font-bold disabled:opacity-40 hover:bg-black transition">
                Založit anketu
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)}
            className="w-full rounded-2xl border border-dashed border-black/15 px-3 py-2 text-xs text-black/40 hover:text-black hover:border-black/30 transition">
            📊 Založit anketu
          </button>
        )
      )}
    </div>
  );
}
