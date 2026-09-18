'use client';

import { useState, useEffect } from 'react';
import { Icon } from '../Icons';
import { BulkBar, SelectBox, useSelection, runBulk } from '../ui';
import { okJson } from '@/lib/api';

type Offer = {
  id: number; status: string;
  date: string; startTime: string; endTime: string;
  offeredByName: string | null; offeredByAvatar: string | null;
  claimedByName: string | null; claimedByAvatar: string | null;
};

const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

// Employer panel: shift swaps that a colleague has claimed and that now need a
// yes/no. Approving actually reassigns the shift.
export default function ShiftSwapApprovals() {
  const [offers, setOffers] = useState<Offer[]>([]);
  // Dřív tu byl jeden `busy: number | null`, který na dobu jednoho
  // požadavku zamkl tlačítka u všech výměn — odbavit deset znamenalo deset
  // čekání za sebou. Množina drží jen ty řádky, které se právě ukládají.
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const sel = useSelection<number>();
  const [bulkNote, setBulkNote] = useState('');

  const load = async () => {
    try {
      const d = await fetch('/api/shifts/offers').then(okJson);
      setOffers(Array.isArray(d.offers) ? d.offers : []);
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const patch = async (id: number, action: 'approve' | 'reject') => {
    const res = await fetch('/api/shifts/offers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    if (!res.ok) throw new Error('nepovedlo se');
    setOffers(prev => prev.filter(o => o.id !== id));
  };

  const decide = async (id: number, action: 'approve' | 'reject') => {
    setBusy(prev => new Set(prev).add(id));
    try { await patch(id, action); } catch { /* ignore */ }
    setBusy(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const decideMany = async (action: 'approve' | 'reject') => {
    const ids = Array.from(sel.selected);
    if (ids.length === 0) return;
    setBulkNote('');
    setBusy(new Set(ids));
    const { failed } = await runBulk(ids, id => patch(id, action));
    setBusy(new Set());
    if (failed.length) {
      setBulkNote(failed.length === ids.length
        ? 'Nepodařilo se to uložit. Zkuste to znovu.'
        : `${failed.length} z ${ids.length} se neuložilo — zkuste to znovu.`);
      return;
    }
    sel.exit();
  };

  const pending = offers.filter(o => o.status === 'claimed');
  if (pending.length === 0) return null;

  return (
    <div className="rounded-3xl bg-[#0A84FF]/[0.06] border border-[#0A84FF]/20 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="swap" size={18} className="text-[#0A6FE0]" />
        <h3 className="t-card">Výměny směn ke schválení</h3>
        <span className="rounded-full bg-[#0A84FF]/15 text-[#0A6FE0] px-2.5 py-0.5 text-xs font-semibold">{pending.length}</span>
        {pending.length > 1 && !sel.selecting && (
          <button type="button" onClick={sel.start}
            className="ml-auto tap-target-sm rounded-full glass border border-black/10 px-3 py-1.5 text-xs font-semibold text-black/60 hover:text-[#16181A] transition whitespace-nowrap">
            <Icon name="check" size={14} className="inline -mt-0.5 mr-1" />Vybrat víc
          </button>
        )}
      </div>
      {pending.map(o => (
        <div key={o.id} className="well bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            {sel.selecting && (
              <SelectBox checked={sel.has(o.id)} onChange={() => sel.toggle(o.id)}
                label={`Vybrat výměnu — ${o.offeredByName ?? 'kolega'}`} />
            )}
            <span className="font-semibold text-[#16181A]">{o.offeredByName ?? 'Kolega'}</span>
            <Icon name="swap" size={15} className="text-black/35" />
            <span className="font-semibold text-[#16181A]">{o.claimedByName ?? 'Kolega'}</span>
          </div>
          <p className="text-xs text-black/50 cz-sentence">{fmtDay(o.date)} · <span className="tabular-nums">{o.startTime}–{o.endTime}</span></p>
          {!sel.selecting && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => decide(o.id, 'approve')} disabled={busy.has(o.id)}
                className="rounded-full bg-[#C8F542] text-black text-sm font-semibold px-4 py-2 disabled:opacity-50">
                {busy.has(o.id) ? '…' : 'Schválit výměnu'}
              </button>
              <button type="button" onClick={() => decide(o.id, 'reject')} disabled={busy.has(o.id)}
                className="rounded-full bg-black/[0.05] border border-black/10 text-red-600 text-sm px-4 py-2 disabled:opacity-50">
                Zamítnout
              </button>
            </div>
          )}
        </div>
      ))}

      {sel.selecting && (
        <BulkBar
          count={sel.count}
          totalLabel={`Vybrat vše (${pending.length})`}
          onSelectAll={() => sel.selectAll(pending.map(o => o.id))}
          onExit={() => { sel.exit(); setBulkNote(''); }}
          note={bulkNote}
          actions={[
            { label: 'Schválit výměny', primary: true, disabled: busy.size > 0, onClick: () => decideMany('approve') },
            { label: 'Zamítnout', danger: true, disabled: busy.size > 0, onClick: () => decideMany('reject') },
          ]}
        />
      )}
    </div>
  );
}
