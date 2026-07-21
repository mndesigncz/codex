'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../Icons';

type Offer = {
  id: number; shiftId: number; offeredBy: number; claimedBy: number | null;
  status: string; note: string | null;
  date: string; startTime: string; endTime: string; type: string;
  offeredByName: string | null; offeredByAvatar: string | null;
  claimedByName: string | null; claimedByAvatar: string | null;
};
type Shift = { id: number; date: string; startTime: string; endTime: string; type: string };

const today = () => new Date().toISOString().split('T')[0];
const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

export default function ShiftSwap({ user }: { user: { id?: string | number } }) {
  const userId = parseInt(String(user.id ?? '0'));
  const [offers, setOffers] = useState<Offer[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([
        fetch('/api/shifts/offers').then(r => r.json()).catch(() => ({ offers: [] })),
        fetch(`/api/shifts?employeeId=${userId}`).then(r => r.json()).catch(() => []),
      ]);
      setOffers(Array.isArray(o.offers) ? o.offers : []);
      setShifts(Array.isArray(s) ? s : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  const act = async (body: object, id: number, ok: string) => {
    setBusy(id);
    try {
      const method = 'shiftId' in body ? 'POST' : 'PATCH';
      const res = await fetch('/api/shifts/offers', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) { flash(ok); await load(); }
      else { const d = await res.json().catch(() => ({})); flash(d.error || 'Něco se nepovedlo.'); }
    } catch { flash('Chyba serveru.'); }
    setBusy(null);
  };

  // Active shift_ids so we don't offer the same shift twice.
  const activeShiftIds = new Set(offers.filter(o => o.status === 'open' || o.status === 'claimed').map(o => o.shiftId));
  const offerable = shifts.filter(s => s.date >= today() && !activeShiftIds.has(s.id));
  const board = offers.filter(o => o.status === 'open' && o.offeredBy !== userId);
  const mine = offers.filter(o => o.offeredBy === userId && (o.status === 'open' || o.status === 'claimed'));
  const claimedByMe = offers.filter(o => o.claimedBy === userId && o.status === 'claimed');

  if (loading) {
    return <div className="flex items-center justify-center h-40"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>;
  }

  return (
    <div className="px-6 pb-8 space-y-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2.5">
        <Icon name="swap" size={22} className="text-[#16181A]" />
        <h2 className="text-xl font-bold tracking-tight text-[#16181A]">Burza směn</h2>
      </div>

      {msg && (
        <div className="p-3 rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/25 text-[#5B7A08] text-sm flex items-center gap-2">
          <Icon name="check" size={16} /> {msg}
        </div>
      )}

      {/* Offer one of my upcoming shifts */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-black/55">Nabídnout mou směnu</h3>
        {offerable.length === 0 ? (
          <p className="text-sm text-black/45">Nemáš žádnou nadcházející směnu k nabídnutí.</p>
        ) : (
          <div className="space-y-2">
            {offerable.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-black/[0.02] border border-black/[0.06] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#16181A] capitalize truncate">{fmtDay(s.date)}</p>
                  <p className="text-xs text-black/45 tabular-nums">{s.startTime}–{s.endTime}</p>
                </div>
                <button onClick={() => act({ shiftId: s.id }, s.id, 'Směna je v burze. ✓')} disabled={busy === s.id}
                  className="shrink-0 rounded-full bg-[#16181A] text-white text-sm font-semibold px-4 py-2 hover:bg-black disabled:opacity-50 transition">
                  Nabídnout
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The board — colleagues' open shifts */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-black/55">Volné směny kolegů</h3>
        {board.length === 0 ? (
          <div className="glass-card p-6 text-center text-sm text-black/45">Právě žádné volné směny.</div>
        ) : (
          board.map(o => (
            <div key={o.id} className="glass-card p-4 flex items-center gap-3">
              <span className="text-lg flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60">{o.offeredByAvatar ?? '👤'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#16181A] capitalize truncate">{fmtDay(o.date)}</p>
                <p className="text-xs text-black/45 tabular-nums">{o.startTime}–{o.endTime} · {o.offeredByName ?? 'Kolega'}</p>
                {o.note && <p className="text-xs text-black/50 mt-1 italic">„{o.note}"</p>}
              </div>
              <button onClick={() => act({ id: o.id, action: 'claim' }, o.id, 'Vzato — čeká na schválení vedení. ✓')} disabled={busy === o.id}
                className="shrink-0 rounded-full bg-[#C8F542] text-black text-sm font-semibold px-4 py-2 hover:brightness-110 disabled:opacity-50 transition">
                Vezmu si to
              </button>
            </div>
          ))
        )}
      </div>

      {/* Things I'm involved in */}
      {(mine.length > 0 || claimedByMe.length > 0) && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-black/55">Moje výměny</h3>
          {mine.map(o => (
            <div key={o.id} className="glass-card p-4 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#16181A] capitalize truncate">{fmtDay(o.date)} <span className="text-black/40 font-normal">· {o.startTime}–{o.endTime}</span></p>
                <p className="text-xs text-black/45">
                  {o.status === 'claimed' ? `${o.claimedByName ?? 'Kolega'} si ji bere — čeká na vedení` : 'Nabídnuto — čeká na zájemce'}
                </p>
              </div>
              <button onClick={() => act({ id: o.id, action: 'cancel' }, o.id, 'Nabídka stažena.')} disabled={busy === o.id}
                className="shrink-0 rounded-full bg-black/[0.05] text-black/60 text-sm px-4 py-2 hover:bg-black/[0.08] disabled:opacity-50 transition">
                Stáhnout
              </button>
            </div>
          ))}
          {claimedByMe.map(o => (
            <div key={o.id} className="glass-card p-4 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#16181A] capitalize truncate">{fmtDay(o.date)} <span className="text-black/40 font-normal">· {o.startTime}–{o.endTime}</span></p>
                <p className="text-xs text-black/45">Bereš si od {o.offeredByName ?? 'kolegy'} — čeká na schválení vedení</p>
              </div>
              <span className="shrink-0 rounded-full bg-orange-500/15 text-orange-600 px-3 py-1 text-xs font-medium whitespace-nowrap">Ke schválení</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
