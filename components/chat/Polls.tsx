'use client';

// Active team polls: pinned above the chat. One tap = one vote (changeable).

import { useCallback, useEffect, useState } from 'react';

import { Icon } from '../Icons';
import { Button, Input, Modal, Well } from '../ui';
import { okJson } from '@/lib/api';
import { czCount } from '@/lib/czech';

const HLAS = { one: 'hlas', few: 'hlasy', many: 'hlasů' };
export default function PollsStrip({ canCreate = true, isEmployer = false, meId }: {
  canCreate?: boolean; isEmployer?: boolean; meId?: number;
}) {
  const [polls, setPolls] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [err, setErr] = useState('');
  // Uzavření ankety se ptá oknem, ne nativním confirm() (DP §3.10): na
  // tabletu v režimu kiosku prohlížeč systémové dialogy potlačuje.
  const [uzavrit, setUzavrit] = useState<{ id: number; question: string } | null>(null);
  const [uzaviram, setUzaviram] = useState(false);

  const load = useCallback(() =>
    fetch('/api/polls').then(okJson)
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

  const potvrdUzavreni = async () => {
    if (!uzavrit) return;
    setUzaviram(true);
    await fetch('/api/polls', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: uzavrit.id, close: true }) }).catch(() => null);
    setUzaviram(false);
    setUzavrit(null);
    await load();
  };
  const lzeZalozit = question.trim() !== '' && opts.filter(o => o.trim()).length >= 2;

  return (
    <div className="space-y-2 px-3 pt-2">
      {/* Anketa je neutrální jamka ve vlákně (DP §3.9): limetkový tón by
          ve vlákně soupeřil s tlačítkem Odeslat o jedinou limetku. */}
      {polls.map(p => (
        <Well key={p.id} pad="sm" as="div">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="t-card min-w-0 flex items-start gap-1.5">
              <Icon name="chart" size={15} className="shrink-0 mt-0.5 text-black/40" />
              <span className="min-w-0">{p.question}<span className="font-normal text-black/55"> · {p.authorName}</span></span>
            </h3>
            {(isEmployer || p.createdBy === meId) && (
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setUzavrit({ id: p.id, question: p.question })}>
                Uzavřít
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            {p.options.map((o: string, i: number) => {
              const pct = p.total > 0 ? Math.round((p.counts[i] / p.total) * 100) : 0;
              const mine = p.myVote === i;
              return (
                <button key={i} type="button" onClick={() => vote(p.id, i)} aria-pressed={mine}
                  className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition ${
                    mine ? 'border-[#16181A]/40 bg-[var(--surface)]' : 'border-black/[0.07] bg-[var(--surface)] hover:bg-black/[0.03]'
                  }`}>
                  <span className="absolute inset-y-0 left-0 bg-[var(--ok-bg)] transition-[width]" style={{ width: `${pct}%` }} />
                  <span className="relative flex items-center justify-between gap-2">
                    <span className="min-w-0 flex items-center gap-1.5 text-[#16181A]">
                      {mine && <Icon name="check" size={13} className="shrink-0" />}
                      <span className="truncate">{o}</span>
                      {mine && <span className="sr-only">(tvůj hlas)</span>}
                    </span>
                    <span className="shrink-0 text-xs text-black/55 tabular-nums">{p.counts[i]} ({pct} %)</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="t-meta mt-1.5">{czCount(p.total, HLAS)} · ťuknutím hlasuješ (jde změnit)</p>
        </Well>
      ))}

      {canCreate && (
        creating ? (
          <form onSubmit={e => { e.preventDefault(); if (lzeZalozit) create(); }}
            className="well p-3.5 space-y-2">
            {err && <p role="alert" className="text-xs text-bad-ink">{err}</p>}
            <Input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Otázka ankety…" maxLength={200}
              aria-label="Otázka ankety" />
            {opts.map((o, i) => (
              <Input key={i} value={o} onChange={e => setOpts(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                placeholder={`Možnost ${i + 1}`} maxLength={80} aria-label={`Možnost ${i + 1}`} />
            ))}
            <div className="flex flex-wrap gap-2">
              {opts.length < 8 && (
                <Button variant="secondary" size="sm" icon="plus" onClick={() => setOpts(prev => [...prev, ''])}>Možnost</Button>
              )}
              <span className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>Zrušit</Button>
              <Button type="submit" variant="primary" size="sm" disabled={!lzeZalozit}>Založit anketu</Button>
            </div>
          </form>
        ) : (
          <Button variant="ghost" size="sm" icon="chart" onClick={() => setCreating(true)}>Založit anketu</Button>
        )
      )}

      <Modal open={!!uzavrit} onClose={() => setUzavrit(null)} size="sm" title="Uzavřít anketu?"
        subtitle={uzavrit ? `„${uzavrit.question}" zmizí z chatu a hlasovat už nepůjde.` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setUzavrit(null)}>Zrušit</Button>
          <Button variant="primary" loading={uzaviram} onClick={potvrdUzavreni}>Uzavřít anketu</Button>
        </>}>
        <p className="t-meta">Uzavřenou anketu nejde znovu otevřít.</p>
      </Modal>
    </div>
  );
}
