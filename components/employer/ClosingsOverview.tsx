'use client';

import { useState, useEffect } from 'react';
import { Icon } from '../Icons';
import { Closing, expectedCash, cashDifference, czk } from '@/lib/closing';

export default function ClosingsOverview() {
  const [closings, setClosings] = useState<Closing[]>([]);
  const [payDailyCash, setPayDailyCash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    try {
      const d = await fetch('/api/closings').then(r => r.json());
      setClosings(Array.isArray(d.closings) ? d.closings : []);
      setPayDailyCash(!!d.payDailyCash);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async (c: Closing) => {
    if (!confirm(`Smazat uzávěrku z ${new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ')}?`)) return;
    setDeleting(c.id);
    const prev = closings;
    setClosings(cs => cs.filter(x => x.id !== c.id));
    try {
      const res = await fetch(`/api/closings/${c.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch { setClosings(prev); }
    setDeleting(null);
  };

  // Totals across all closings.
  const totals = closings.reduce((a, c) => ({
    cash: a.cash + c.cash_revenue,
    card: a.card + c.card_revenue,
    tips: a.tips + c.tips,
    payout: a.payout + c.self_payout,
    removed: a.removed + c.cash_removed,
    diff: a.diff + cashDifference(c),
  }), { cash: 0, card: 0, tips: 0, payout: 0, removed: 0, diff: 0 });
  const totalRevenue = totals.cash + totals.card;

  return (
    <div className="p-6 space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 min-w-0">
          <p className="text-xs uppercase tracking-wider text-black/45 truncate">Tržba celkem</p>
          <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{czk(totalRevenue)}</p>
          <p className="text-[11px] text-black/40 mt-1 truncate">Hotově {czk(totals.cash)} · Kartou {czk(totals.card)}</p>
        </div>
        <div className="glass-card p-5 min-w-0">
          <p className="text-xs uppercase tracking-wider text-black/45 truncate">Odvedeno / odloženo</p>
          <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{czk(totals.removed)}</p>
        </div>
        {payDailyCash ? (
          <div className="glass-card p-5 min-w-0">
            <p className="text-xs uppercase tracking-wider text-black/45 truncate">Vyplaceno v hotovosti</p>
            <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{czk(totals.payout)}</p>
          </div>
        ) : (
          <div className="glass-card p-5 min-w-0">
            <p className="text-xs uppercase tracking-wider text-black/45 truncate">Spropitné celkem</p>
            <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-[#16181A] mt-1.5 truncate">{czk(totals.tips)}</p>
          </div>
        )}
        <div className="glass-card p-5 min-w-0">
          <p className="text-xs uppercase tracking-wider text-black/45 truncate">Rozdíl kasy</p>
          <p className={`text-xl sm:text-2xl font-bold tracking-tight tabular-nums mt-1.5 truncate ${totals.diff === 0 ? 'text-[#16181A]' : totals.diff > 0 ? 'text-[#0A6FE0]' : 'text-red-600'}`}>
            {totals.diff > 0 ? '+' : ''}{czk(totals.diff)}
          </p>
          <p className="text-[11px] text-black/40 mt-1 truncate">Manko/přebytek souhrnně</p>
        </div>
      </div>

      <h3 className="text-lg font-bold tracking-tight text-[#16181A]">Uzávěrky ({closings.length})</h3>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : closings.length === 0 ? (
        <div className="glass-card p-8 text-center"><p className="text-black/45">Zatím žádné uzávěrky od zaměstnanců.</p></div>
      ) : (
        <div className="space-y-3">
          {closings.map(c => {
            const d = cashDifference(c);
            const expected = expectedCash(c);
            const open = openId === c.id;
            return (
              <div key={c.id} className="glass-card overflow-hidden">
                <button onClick={() => setOpenId(open ? null : c.id)} className="w-full text-left p-5 flex items-center justify-between gap-3 hover:bg-black/[0.02] transition-colors">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="text-lg flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60">{c.author_avatar ?? '👤'}</span>
                    <div className="min-w-0">
                      <p className="font-bold tracking-tight text-[#16181A] truncate">
                        {new Date(c.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })}
                        {c.shift_label && <span className="text-black/40 font-normal"> · {c.shift_label}</span>}
                      </p>
                      <p className="text-xs text-black/45 truncate">{c.author_name ?? 'Neznámý'} · Tržba {czk(c.cash_revenue + c.card_revenue)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <span className={`text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
                      d === 0 ? 'bg-[#C8F542]/15 text-[#5B7A08]' : d > 0 ? 'bg-[#0A84FF]/15 text-[#0A6FE0]' : 'bg-red-500/15 text-red-600'
                    }`}>{d === 0 ? 'Sedí' : d > 0 ? `+${czk(d)}` : czk(d)}</span>
                    <Icon name="chevron" size={16} className={`text-black/35 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {open && (
                  <div className="px-5 pb-5 space-y-4 border-t border-black/[0.06]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 text-sm">
                      {[
                        ['Kasa na začátku', c.opening_cash],
                        ['Tržba hotově', c.cash_revenue],
                        ['Tržba kartou', c.card_revenue],
                        ['Spropitné', c.tips],
                        ['Výdaje z kasy', c.expenses],
                        ['Odloženo ven', c.cash_removed],
                        ...(payDailyCash ? [['Výplata zaměstnance', c.self_payout] as [string, number]] : []),
                        ['Zákazníků', c.customers],
                      ].map(([label, val]) => (
                        <div key={label as string} className="min-w-0">
                          <span className="block text-black/40 text-xs truncate">{label}</span>
                          <p className="font-semibold text-[#16181A] tabular-nums truncate">{label === 'Zákazníků' ? val : czk(val as number)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-2xl bg-black/[0.03] border border-black/[0.07] p-4 space-y-2 text-sm">
                      <div className="flex justify-between gap-3"><span className="text-black/55 min-w-0">Očekávaný stav kasy</span><span className="font-semibold text-[#16181A] shrink-0 whitespace-nowrap tabular-nums">{czk(expected)}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-black/55 min-w-0">Skutečný stav kasy</span><span className="font-semibold text-[#16181A] shrink-0 whitespace-nowrap tabular-nums">{czk(c.closing_cash)}</span></div>
                      <div className={`flex justify-between gap-3 rounded-xl px-3 py-2 ${d === 0 ? 'bg-[#C8F542]/10 text-[#5B7A08]' : d > 0 ? 'bg-[#0A84FF]/10 text-[#0A6FE0]' : 'bg-red-500/10 text-red-600'}`}>
                        <span className="font-medium min-w-0">{d === 0 ? 'Kasa sedí' : d > 0 ? 'Přebytek' : 'Manko'}</span>
                        <span className="font-bold shrink-0 whitespace-nowrap tabular-nums">{d > 0 ? '+' : ''}{czk(d)}</span>
                      </div>
                    </div>
                    {c.notes && <p className="text-sm text-black/55 bg-black/[0.04] border border-black/[0.06] rounded-2xl p-3">{c.notes}</p>}
                    <button onClick={() => remove(c)} disabled={deleting === c.id}
                      className="text-sm text-red-600 hover:bg-red-500/[0.06] rounded-full px-4 py-2 font-medium transition-colors disabled:opacity-50">
                      {deleting === c.id ? 'Mažu…' : 'Smazat uzávěrku'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
