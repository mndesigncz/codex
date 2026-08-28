'use client';

// TO GO — the employer's pocket view. Standing in the doorway with a coffee:
// how is today going, who is on shift, what is running out, snap a receipt.
// One tap switches to the full administration and back; the light glass look
// keeps it calm on a phone.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import ReceiptsPanel from './ReceiptsPanel';

function pragueToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
}

export default function ToGoMode({ user, onExit, onOpenView }: {
  user: { name?: string };
  onExit: () => void;
  /** Jump straight to a view in the full administration. */
  onOpenView: (view: string) => void;
}) {
  const money = useMoney();
  const [pos, setPos] = useState<any | null>(null);
  const [closToday, setClosToday] = useState<{ cash: number; card: number } | null>(null);
  const [onShift, setOnShift] = useState<{ id: number; name: string; avatar: string | null; since: string }[]>([]);
  const [lowStock, setLowStock] = useState<number>(0);
  const [pendingClosings, setPendingClosings] = useState(0);

  useEffect(() => {
    const today = pragueToday();
    fetch(`/api/pos/summary?date=${today}`).then(r => r.json())
      .then(d => setPos(d?.connected && d.bills != null ? d : null)).catch(() => {});
    fetch('/api/closings').then(r => r.json()).then(d => {
      const list = Array.isArray(d.closings) ? d.closings : [];
      const todays = list.filter((c: any) => (c.shift_date ?? c.date) === today && !c.covered_by);
      if (todays.length) {
        setClosToday({
          cash: todays.reduce((s: number, c: any) => s + (Number(c.cash_revenue) || 0), 0),
          card: todays.reduce((s: number, c: any) => s + (Number(c.card_revenue) || 0), 0),
        });
      }
      setPendingClosings(list.filter((c: any) => c.approved === false).length);
    }).catch(() => {});
    fetch('/api/attendance?days=1').then(r => r.json()).then(d => {
      const roster = Array.isArray(d.roster) ? d.roster : [];
      setOnShift(roster.filter((r: any) => r.openSince)
        .map((r: any) => ({ id: r.id, name: r.name, avatar: r.avatar ?? null, since: r.openSince })));
    }).catch(() => {});
    fetch('/api/inventory').then(r => r.json()).then(d => {
      const items = Array.isArray(d.items) ? d.items : [];
      setLowStock(items.filter((i: any) => i.status === 'low' || i.status === 'critical').length);
    }).catch(() => {});
  }, []);

  const revenue = pos ? Number(pos.total) || 0 : closToday ? closToday.cash + closToday.card : null;
  const hour = new Date().getHours();
  const greeting = hour < 10 ? 'Dobré ráno' : hour < 18 ? 'Hezký den' : 'Dobrý večer';
  const firstName = (user?.name ?? '').split(' ')[0];

  const quick = [
    { view: 'reports', icon: 'trend', label: 'Přehledy' },
    { view: 'inventory', icon: 'box', label: 'Sklad' },
    { view: 'shifts', icon: 'calendar', label: 'Rozvrh' },
    { view: 'rewards', icon: 'check', label: 'Hodnocení' },
  ];

  return (
    <div className="min-h-screen bg-[#F1F4EC] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 glass-strong border-b border-black/[0.05]">
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-[#5B7A08] font-bold">☕ TO GO</p>
            <h1 className="text-lg font-bold tracking-tight text-[#16181A] truncate">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
          </div>
          <button onClick={onExit}
            className="shrink-0 rounded-full bg-[#16181A] text-white px-4 py-2.5 text-xs font-bold hover:bg-black transition active:scale-95">
            Kompletní administrace →
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45">Dnešní tržba</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[#16181A]">
              {revenue != null ? money(revenue) : '—'}
            </p>
            <p className="text-[11px] text-black/40 mt-0.5">
              {pos ? `${pos.bills} účtenek z pokladny` : closToday ? 'z uzávěrky' : 'zatím nic'}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45">Na směně</p>
            {onShift.length === 0 ? (
              <p className="mt-1 text-2xl font-bold text-[#16181A]">—</p>
            ) : (
              <div className="mt-1.5 flex items-center gap-1">
                {onShift.slice(0, 4).map(p => (
                  <span key={p.id} title={p.name}
                    className="text-lg h-9 w-9 flex items-center justify-center rounded-full ring-1 ring-black/10 bg-white/70 -ml-1 first:ml-0">
                    {p.avatar || '👤'}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-black/40 mt-0.5 truncate">
              {onShift.length ? onShift.map(p => p.name.split(' ')[0]).join(', ') : 'nikdo není odpíchnutý'}
            </p>
          </div>
        </div>

        {/* Attention */}
        {(lowStock > 0 || pendingClosings > 0) && (
          <div className="space-y-2">
            {lowStock > 0 && (
              <button onClick={() => onOpenView('inventory')}
                className="w-full flex items-center gap-3 rounded-2xl bg-amber-500/[0.09] border border-amber-500/25 px-4 py-3 text-left active:scale-[0.99] transition">
                <span className="text-lg">📦</span>
                <span className="flex-1 text-sm font-semibold text-amber-800">
                  {lowStock} {lowStock === 1 ? 'položka dochází' : lowStock <= 4 ? 'položky docházejí' : 'položek dochází'} ve skladu
                </span>
                <Icon name="chevron" size={15} className="-rotate-90 text-amber-700/60 shrink-0" />
              </button>
            )}
            {pendingClosings > 0 && (
              <button onClick={() => onOpenView('reports')}
                className="w-full flex items-center gap-3 rounded-2xl bg-[#0A84FF]/[0.07] border border-[#0A84FF]/25 px-4 py-3 text-left active:scale-[0.99] transition">
                <span className="text-lg">📊</span>
                <span className="flex-1 text-sm font-semibold text-[#0A6FE0]">
                  {pendingClosings} {pendingClosings === 1 ? 'uzávěrka čeká' : 'uzávěrky čekají'} na schválení
                </span>
                <Icon name="chevron" size={15} className="-rotate-90 text-[#0A6FE0]/60 shrink-0" />
              </button>
            )}
          </div>
        )}

        {/* Quick jumps into the full app */}
        <div className="grid grid-cols-4 gap-2">
          {quick.map(q => (
            <button key={q.view} onClick={() => onOpenView(q.view)}
              className="glass-card p-3 flex flex-col items-center gap-1.5 active:scale-95 transition">
              <Icon name={q.icon as any} size={20} className="text-[#16181A]" />
              <span className="text-[11px] font-semibold text-black/60">{q.label}</span>
            </button>
          ))}
        </div>

        {/* Receipts — the TO GO superpower */}
        <ReceiptsPanel compact />
      </div>
    </div>
  );
}
