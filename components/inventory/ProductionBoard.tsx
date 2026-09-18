'use client';

// „K výrobě" — co si směna má uvařit, upéct nebo namíchat, s recepturou
// a stavem surovin. Jedna karta pro dashboard směny, TO GO i Sklad vedení;
// data z /api/production, které úkoly zároveň srovná se skladem.
//
// Tlačítko „Vyrobeno" naskladní dávku a odepíše suroviny (server), stejně
// jako odškrtnutí úkolu v Úkolech — dvě cesty, jeden výsledek.

import { useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { useModal } from '@/lib/useModal';
import { okJson } from '@/lib/api';
import { DiscardGuard } from '../ui/DiscardGuard';

export interface ToMake {
  taskId: number; title: string; priority: string; status: string;
  item: { id: number; name: string; unit: string; status: string; quantity: number; available: number; recipeUnit: string };
  batches: number; yieldTotal: number; batchYield: number | null; steps: string | null;
  lines: { ingredientId: number; name: string; amount: number; unit: string; available: number; need: number; missing: number }[];
  missing: number[]; ready: boolean;
}

const fmt = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 3 });

export function useProduction() {
  const [list, setList] = useState<ToMake[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = async () => {
    try {
      const d = await fetch('/api/production').then(okJson);
      setList(Array.isArray(d?.toMake) ? d.toMake : []);
    } catch { /* offline */ }
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);
  return { list, loaded, reload: load };
}

export function ProduceModal({ entry, onClose, onDone }: { entry: ToMake; onClose: () => void; onDone: (msg: string) => void }) {
  const m = useModal(true, onClose, `Vyrobeno: ${entry.item.name}`);
  const [batches, setBatches] = useState(entry.batches);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const per = (need: number, amount: number) => amount * batches;
  const shortages = entry.lines.filter(l => per(l.need, l.amount) > l.available);

  const confirm = async () => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/inventory/${entry.item.id}/produce`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batches, taskId: entry.taskId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Nepodařilo se zapsat.'); setBusy(false); return; }
      onDone(`${entry.item.name}: +${d.added} ${d.unit} naskladněno${d.consumed?.length ? `, suroviny odepsány` : ''}.`);
    } catch { setErr('Nepodařilo se zapsat.'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div ref={m.ref} {...m.dialogProps} onClick={e => e.stopPropagation()}
        className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DiscardGuard guard={m.guard} />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="t-card truncate">Vyrobeno: {entry.item.name}</h3>
            <p className="t-meta">Naskladní se dávka a suroviny se odepíšou.</p>
          </div>
          <button onClick={m.guard.attemptClose} className="shrink-0 btn-icon" aria-label="Zavřít"><Icon name="close" size={15} /></button>
        </div>

        <div className="well p-4 flex items-center justify-between gap-3">
          <div>
            <p className="t-label">Dávek</p>
            <p className="text-sm text-black/55 mt-0.5">
              {entry.batchYield ? `${fmt(entry.batchYield)} ${entry.item.unit} na dávku → +${fmt(entry.batchYield * batches)} ${entry.item.unit}` : `+${batches} ${entry.item.unit}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setBatches(b => Math.max(1, b - 1))} aria-label="Méně dávek" className="tap-target w-10 h-10 rounded-full glass flex items-center justify-center text-lg">−</button>
            <span className="w-8 text-center text-xl font-bold tabular-nums">{batches}</span>
            <button type="button" onClick={() => setBatches(b => Math.min(10, b + 1))} aria-label="Více dávek" className="tap-target w-10 h-10 rounded-full glass flex items-center justify-center text-lg">+</button>
          </div>
        </div>

        {entry.lines.length > 0 && (
          <ul className="list">
            {entry.lines.map(l => {
              const need = per(l.need, l.amount);
              const short = need > l.available;
              return (
                <li key={l.ingredientId} className="list-row">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[#16181A] truncate">{l.name}</span>
                    <span className={`block text-[13px] ${short ? 'text-bad-ink' : 'text-black/55'}`}>
                      odepíše se {fmt(need)} {l.unit} · ve skladu {fmt(l.available)} {l.unit}{short ? ' — nestačí, odepíše se, co je' : ''}
                    </span>
                  </span>
                  <span className={`chip chip-sm ${short ? 'chip-bad' : 'chip-ok'}`}>{short ? 'chybí' : 'je'}</span>
                </li>
              );
            })}
          </ul>
        )}
        {shortages.length > 0 && (
          <p className="note note-wait text-[13px]">Některé suroviny nestačí. Jestli se vyrobilo i tak, sklad se u nich jen vynuluje — přesné množství doplň u položky.</p>
        )}
        {err && <p className="note note-danger">{err}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={confirm} disabled={busy} className="btn btn-accent flex-1">{busy ? 'Zapisuji…' : 'Vyrobeno, naskladnit'}</button>
          <button type="button" onClick={onClose} className="btn btn-secondary">Zrušit</button>
        </div>
      </div>
    </div>
  );
}

export default function ProductionBoard({ compact = false, onOpenTasks, onChanged, className = '' }: {
  compact?: boolean;
  onOpenTasks?: () => void;
  onChanged?: (msg: string) => void;
  className?: string;
}) {
  const { list, loaded, reload } = useProduction();
  const [open, setOpen] = useState<ToMake | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  if (!loaded || list.length === 0) return null;

  return (
    <div className={`card card-info p-5 space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="t-label text-[#0A5CC0] flex items-center gap-1.5">
          <Icon name="leaf" size={13} /> K výrobě ({list.length})
        </p>
        {onOpenTasks && (
          <button type="button" onClick={onOpenTasks} className="text-[11px] font-bold text-black/40 hover:text-black transition">v úkolech →</button>
        )}
      </div>
      <ul className="list">
        {list.map(e => {
          const isOpen = expanded === e.taskId;
          return (
            <li key={e.taskId} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full shrink-0 ${e.item.status === 'critical' ? 'bg-bad' : 'bg-wait'}`} />
                <button type="button" onClick={() => setExpanded(isOpen ? null : e.taskId)} className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-semibold text-[#16181A] truncate">{e.title}</span>
                  <span className="block text-[13px] text-black/55 truncate">
                    {e.batches}× dávka · zbývá {fmt(e.item.available)} {e.item.recipeUnit}
                    {e.lines.length > 0 && (e.ready ? ' · suroviny jsou' : ` · chybí ${e.missing.length} ${e.missing.length === 1 ? 'surovina' : e.missing.length < 5 ? 'suroviny' : 'surovin'}`)}
                  </span>
                </button>
                {!compact && (
                  <span className={`chip chip-sm shrink-0 ${e.ready ? 'chip-ok' : 'chip-wait'}`}>{e.ready ? 'lze vyrobit' : 'do nákupu'}</span>
                )}
                <button type="button" onClick={() => setOpen(e)} className="btn btn-primary btn-sm shrink-0">Vyrobeno</button>
              </div>
              {isOpen && (
                <div className="mt-2 ml-5 well p-3 space-y-2">
                  {e.lines.length > 0 && (
                    <div className="space-y-1">
                      {e.lines.map(l => (
                        <p key={l.ingredientId} className="text-[13px] flex items-center gap-2">
                          <span className={`shrink-0 ${l.missing > 0 ? 'text-bad-ink' : 'text-[#5B7A08]'}`}><Icon name={l.missing > 0 ? 'close' : 'check'} size={14} /></span>
                          <span className="min-w-0 flex-1 truncate text-[#16181A]">{l.name} {fmt(l.need)} {l.unit}</span>
                          <span className="shrink-0 text-black/45 tabular-nums">ve skladu {fmt(l.available)} {l.unit}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {e.steps && <p className="text-[13px] text-black/60 whitespace-pre-wrap">{e.steps}</p>}
                  {e.lines.length === 0 && !e.steps && <p className="text-[13px] text-black/45">Bez receptury — vedení ji nastaví u položky ve skladu.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {open && (
        <ProduceModal entry={open} onClose={() => setOpen(null)}
          onDone={msg => { setOpen(null); reload(); onChanged?.(msg); }} />
      )}
    </div>
  );
}
