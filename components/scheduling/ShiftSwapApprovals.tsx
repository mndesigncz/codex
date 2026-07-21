'use client';

import { useState, useEffect } from 'react';
import { Icon } from '../Icons';

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
  const [busy, setBusy] = useState<number | null>(null);

  const load = async () => {
    try {
      const d = await fetch('/api/shifts/offers').then(r => r.json());
      setOffers(Array.isArray(d.offers) ? d.offers : []);
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const decide = async (id: number, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      const res = await fetch('/api/shifts/offers', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) setOffers(prev => prev.filter(o => o.id !== id));
    } catch { /* ignore */ }
    setBusy(null);
  };

  const pending = offers.filter(o => o.status === 'claimed');
  if (pending.length === 0) return null;

  return (
    <div className="rounded-3xl bg-[#0A84FF]/[0.06] border border-[#0A84FF]/20 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="swap" size={18} className="text-[#0A6FE0]" />
        <h3 className="font-bold text-[#16181A]">Výměny směn ke schválení</h3>
        <span className="rounded-full bg-[#0A84FF]/15 text-[#0A6FE0] px-2.5 py-0.5 text-xs font-semibold">{pending.length}</span>
      </div>
      {pending.map(o => (
        <div key={o.id} className="rounded-2xl bg-white/60 border border-black/[0.06] p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-[#16181A]">{o.offeredByName ?? 'Kolega'}</span>
            <Icon name="swap" size={15} className="text-black/35" />
            <span className="font-semibold text-[#16181A]">{o.claimedByName ?? 'Kolega'}</span>
          </div>
          <p className="text-xs text-black/50 capitalize">{fmtDay(o.date)} · <span className="tabular-nums">{o.startTime}–{o.endTime}</span></p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => decide(o.id, 'approve')} disabled={busy === o.id}
              className="rounded-full bg-[#C8F542] text-black text-sm font-semibold px-4 py-2 disabled:opacity-50">
              {busy === o.id ? '…' : 'Schválit výměnu'}
            </button>
            <button onClick={() => decide(o.id, 'reject')} disabled={busy === o.id}
              className="rounded-full bg-black/[0.05] border border-black/10 text-red-600 text-sm px-4 py-2 disabled:opacity-50">
              Zamítnout
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
