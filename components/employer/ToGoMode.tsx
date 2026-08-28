'use client';

// TO GO — the employer's pocket view, styled like the rest of the app's
// iOS-27 liquid glass: one dark hero card with today's number and a weekly
// sparkline, layered translucent tiles for everything the owner checks daily,
// and the receipt scanner one thumb-reach away.

import { useEffect, useMemo, useState } from 'react';
import { Icon, LogoMark } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import ReceiptsPanel from './ReceiptsPanel';

function pragueToday(offset = 0): string {
  return new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
}
const DAY_LETTERS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

export default function ToGoMode({ user, onExit, onOpenView }: {
  user: { name?: string };
  onExit: () => void;
  /** Jump straight to a view in the full administration. */
  onOpenView: (view: string) => void;
}) {
  const money = useMoney();
  const [pos, setPos] = useState<any | null>(null);
  const [closings, setClosings] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [lowItems, setLowItems] = useState<any[]>([]);
  const [pendingClosings, setPendingClosings] = useState(0);

  useEffect(() => {
    const today = pragueToday();
    fetch(`/api/pos/summary?date=${today}`).then(r => r.json())
      .then(d => setPos(d?.connected && d.bills != null ? d : null)).catch(() => {});
    fetch('/api/closings').then(r => r.json()).then(d => {
      const list = Array.isArray(d.closings) ? d.closings : [];
      setClosings(list);
      setPendingClosings(list.filter((c: any) => c.approved === false).length);
    }).catch(() => {});
    fetch('/api/attendance?days=1').then(r => r.json()).then(d => {
      setRoster(Array.isArray(d.roster) ? d.roster : []);
    }).catch(() => {});
    fetch('/api/inventory').then(r => r.json()).then(d => {
      const items = Array.isArray(d.items) ? d.items : [];
      setLowItems(items.filter((i: any) => i.status === 'low' || i.status === 'critical'));
    }).catch(() => {});
  }, []);

  // ---- Week of revenue: one bar per day, today included live from the POS. ----
  const week = useMemo(() => {
    const days: { date: string; label: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = pragueToday(-i);
      days.push({ date, label: DAY_LETTERS[new Date(date + 'T12:00:00').getDay()], total: 0 });
    }
    const byDate = new Map(days.map(d => [d.date, d]));
    for (const c of closings) {
      if (c.covered_by) continue;
      const d = byDate.get(String(c.shift_date ?? c.date));
      if (d) d.total += (Number(c.cash_revenue) || 0) + (Number(c.card_revenue) || 0);
    }
    const today = byDate.get(pragueToday());
    if (today && pos && Number(pos.total) > today.total) today.total = Number(pos.total);
    const max = Math.max(...days.map(d => d.total), 1);
    const sum = days.reduce((s, d) => s + d.total, 0);
    return { days, max, sum };
  }, [closings, pos]);

  const today = pragueToday();
  const todayTotal = week.days[6]?.total ?? 0;
  const yesterdayTotal = week.days[5]?.total ?? 0;
  const trendPct = yesterdayTotal > 0 ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100) : null;

  const onShift = roster.filter((r: any) => r.openSince);
  const plannedToday = roster.filter((r: any) => r.shiftStart);
  const hour = new Date().getHours();
  const greeting = hour < 10 ? 'Dobré ráno' : hour < 18 ? 'Hezký den' : 'Dobrý večer';
  const firstName = (user?.name ?? '').split(' ')[0];

  const tiles = [
    { view: 'reports', icon: 'trend', label: 'Přehledy', badge: pendingClosings || null, badgeTone: 'bg-[#0A84FF] text-white' },
    { view: 'inventory', icon: 'box', label: 'Sklad', badge: lowItems.length || null, badgeTone: 'bg-amber-500 text-white' },
    { view: 'shifts', icon: 'calendar', label: 'Rozvrh', badge: null, badgeTone: '' },
    { view: 'attendance', icon: 'clock', label: 'Docházka', badge: onShift.length || null, badgeTone: 'bg-[#8FB811] text-white' },
    { view: 'rewards', icon: 'award', label: 'Hodnocení', badge: null, badgeTone: '' },
    { view: 'chat', icon: 'chat', label: 'Chat', badge: null, badgeTone: '' },
  ];

  return (
    <div className="min-h-screen bg-[#F1F4EC] pb-16"
      style={{ backgroundImage: 'radial-gradient(1100px 500px at 85% -10%, rgba(200,245,66,0.22), transparent 60%), radial-gradient(900px 500px at -15% 25%, rgba(143,184,17,0.10), transparent 55%)' }}>

      {/* Floating glass header */}
      <div className="sticky top-0 z-20 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <div className="max-w-lg mx-auto glass-strong rounded-[24px] px-4 py-3 flex items-center gap-3 shadow-[0_12px_36px_rgba(25,35,15,0.14)]">
          <LogoMark size={34} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#5B7A08] font-bold leading-none">TO GO</p>
            <h1 className="text-[15px] font-bold tracking-tight text-[#16181A] truncate mt-0.5">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
          </div>
          <button onClick={onExit}
            className="shrink-0 rounded-full bg-[#C8F542] text-black px-3.5 py-2 text-[11px] font-extrabold tracking-wide hover:brightness-105 transition active:scale-95 shadow-[0_4px_14px_rgba(143,184,17,0.35)]">
            ADMINISTRACE →
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-3 space-y-4">

        {/* Dark hero — today's number, big and calm */}
        <div className="relative overflow-hidden rounded-[30px] bg-[#16181A] text-white p-5 shadow-[0_18px_50px_rgba(15,20,8,0.35)]">
          <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#C8F542]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-10 h-48 w-48 rounded-full bg-[#8FB811]/15 blur-3xl" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/45 font-bold">Dnešní tržba</p>
                <p className="mt-1.5 text-[40px] leading-none font-bold tabular-nums tracking-tight">
                  {money(todayTotal)}
                </p>
              </div>
              {trendPct != null && (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold tabular-nums backdrop-blur-md ${
                  trendPct >= 0 ? 'bg-[#C8F542]/20 text-[#D8FF6B]' : 'bg-red-400/15 text-red-300'
                }`}>
                  {trendPct >= 0 ? '↗' : '↘'} {Math.abs(trendPct)} %
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/40 mt-1">
              {pos ? `${pos.bills} účtenek z pokladny · živě` : 'z uzávěrek'}
              {trendPct != null ? ' · vs. včera' : ''}
            </p>

            {/* Week bars */}
            <div className="mt-4 flex items-end justify-between gap-1.5 h-20">
              {week.days.map((d, i) => {
                const h = Math.max(6, Math.round((d.total / week.max) * 72));
                const isToday = d.date === today;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full rounded-full transition-all"
                      style={{
                        height: `${h}px`,
                        background: isToday
                          ? 'linear-gradient(180deg,#D8FF6B,#C8F542)'
                          : d.total > 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                        boxShadow: isToday ? '0 0 18px rgba(200,245,66,0.45)' : undefined,
                      }} />
                    <span className={`text-[9px] font-bold ${isToday ? 'text-[#D8FF6B]' : 'text-white/35'}`}>{d.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-white/45">
              <span>Posledních 7 dní</span>
              <span className="font-bold text-white/70 tabular-nums">{money(week.sum)}</span>
            </div>
          </div>
        </div>

        {/* Crew strip — who is here now / planned today */}
        <div className="glass-card rounded-[26px] p-4">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[11px] uppercase tracking-[0.12em] text-black/45 font-bold">Dnes v podniku</p>
            {onShift.length > 0 && (
              <span className="rounded-full bg-[#C8F542]/25 text-[#5B7A08] px-2 py-0.5 text-[10px] font-extrabold">
                {onShift.length} na směně
              </span>
            )}
          </div>
          {plannedToday.length === 0 && onShift.length === 0 ? (
            <p className="text-sm text-black/40">Dnes nikdo nemá plánovanou směnu.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1">
              {(plannedToday.length ? plannedToday : onShift).map((p: any) => {
                const live = !!p.openSince;
                return (
                  <div key={p.id}
                    className={`shrink-0 flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border backdrop-blur-md ${
                      live ? 'bg-[#C8F542]/15 border-[#C8F542]/40' : 'bg-white/55 border-black/[0.06]'
                    }`}>
                    <span className="relative text-base h-8 w-8 flex items-center justify-center rounded-full ring-1 ring-black/10 bg-white/80">
                      {p.avatar || '👤'}
                      {live && <span className="absolute -bottom-0 -right-0 h-2.5 w-2.5 rounded-full bg-[#8FB811] ring-2 ring-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-[#16181A] leading-tight">{String(p.name).split(' ')[0]}</span>
                      <span className="block text-[10px] text-black/40 leading-tight tabular-nums">
                        {live ? 'právě tady' : p.shiftStart ? `${String(p.shiftStart).slice(0, 5)}–${String(p.shiftEnd ?? '').slice(0, 5)}` : ''}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick functions — frosted tiles with badges */}
        <div className="grid grid-cols-3 gap-2.5">
          {tiles.map(t => (
            <button key={t.view} onClick={() => onOpenView(t.view)}
              className="relative glass-card rounded-[22px] px-2 py-3.5 flex flex-col items-center gap-1.5 active:scale-95 transition hover:bg-white/70">
              {t.badge != null && (
                <span className={`absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center ${t.badgeTone}`}>
                  {t.badge}
                </span>
              )}
              <Icon name={t.icon as any} size={22} className="text-[#16181A]" strokeWidth={1.8} />
              <span className="text-[11px] font-bold text-black/60">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Low stock — the three most urgent, actionable */}
        {lowItems.length > 0 && (
          <button onClick={() => onOpenView('inventory')}
            className="w-full glass-card rounded-[26px] p-4 text-left active:scale-[0.99] transition">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase tracking-[0.12em] text-amber-700 font-bold flex items-center gap-1.5">
                <Icon name="box" size={14} strokeWidth={2} /> Dochází ve skladu
              </p>
              <span className="text-[11px] font-bold text-black/35">{lowItems.length} celkem →</span>
            </div>
            <div className="space-y-1.5">
              {lowItems.slice(0, 3).map((i: any) => (
                <div key={i.id} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${i.status === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <span className="text-sm font-semibold text-[#16181A] truncate flex-1">{i.name}</span>
                  <span className="text-xs text-black/45 tabular-nums shrink-0">{i.quantity} {i.unit}</span>
                </div>
              ))}
            </div>
          </button>
        )}

        {/* Receipts — the TO GO superpower */}
        <ReceiptsPanel compact />

        <p className="text-center text-[10px] text-black/25 pb-2">Managero · TO GO režim</p>
      </div>
    </div>
  );
}
