'use client';

// TO GO — the employer's pocket view, styled like the rest of the app's
// iOS-27 liquid glass: one dark hero card with today's number and a weekly
// sparkline, layered translucent tiles for everything the owner checks daily,
// and the receipt scanner one thumb-reach away.

import { useEffect, useMemo, useState } from 'react';
import { Icon, LogoMark } from '../Icons';
import PodnikSwitcher from '../PodnikSwitcher';
import { Avatar } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { useTheme } from '../ThemeProvider';
import ReceiptsPanel from './ReceiptsPanel';
import ProductionBoard from '../inventory/ProductionBoard';
import { useConversations } from '../chat/useChat';
import { okJson } from '@/lib/api';
import { useOpravneni } from '../role/useOpravneni';

function pragueToday(offset = 0): string {
  return new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
}
const DAY_LETTERS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

export default function ToGoMode({ user, onExit, onOpenView, smiPohled = () => true }: {
  user: { name?: string };
  onExit: () => void;
  /** Jump straight to a view in the full administration; `arg` upřesní cíl (id konverzace…). */
  onOpenView: (view: string, arg?: string) => void;
  /** Smí role otevřít pohled? Klíče drží EmployerLayout (KLICE_POHLEDU), ať jsou na jednom místě. */
  smiPohled?: (view: string) => boolean;
}) {
  // Oprávnění (kolo 67). TO GO je na telefonu výchozí režim, takže tu platí
  // totéž co v navigaci: dlaždice a karty, na které role nemá, se nekreslí
  // a jejich dotazy se neposílají. Jinak by Skladník viděl „Dnešní tržba
  // 0 Kč" a prázdnou směnu (server mu vrátí 403 nebo jen jeho vlastní
  // záznamy) a dlaždice by vedly do „nemáš oprávnění". Vedení má celý
  // katalog — nic se mu neschová.
  const { ma } = useOpravneni();
  const smiTrzby = ma(['finance.trzby', 'uzaverky.zobrazit_vse']);
  const smiUzaverky = smiPohled('reports');
  const smiSmenu = ma(['dochazka.zobrazit', 'dochazka.tablet']);
  const smiSklad = smiPohled('inventory');
  const smiVyrobu = ma('vyroba.vyrabet');
  const smiUctenky = ma(['finance.uctenky_zobrazit', 'finance.uctenky_pridat']);
  const money = useMoney();
  // TO GO je nakreslené natvrdo ve světlých barvách (bg-[#F1F4EC], text-[#16181A]).
  // Tmavý motiv ale přebarvuje text globálním pravidlem
  // `:root[data-theme="dark"] .text-[#16181A] { color:#EDF2E4 }` — a pozadí,
  // které svůj tmavý protějšek nemá, zůstalo světlé. Výsledek: světlý text na
  // světlém panelu, prakticky nečitelná obrazovka. A protože se na telefonu
  // TO GO spouští jako výchozí režim, potkal to každý, kdo má zapnutý tmavý
  // motiv. Drží se tu tedy světlý motiv, stejně jako v Managero client.
  const { setForcedLight } = useTheme();
  useEffect(() => { setForcedLight(true); return () => setForcedLight(false); }, [setForcedLight]);
  const [pos, setPos] = useState<any | null>(null);
  const [closings, setClosings] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [lowItems, setLowItems] = useState<any[]>([]);
  const [pendingClosings, setPendingClosings] = useState(0);

  // Do načtení oprávnění `ma()` vrací ANO (viz useOpravneni), takže se
  // ptá hned — vedení se nezdrží. Když pak oprávnění některou kartu vezmou,
  // efekt proběhne znovu, kartu vyprázdní a pozdě dorazivší odpověď z prvního
  // průchodu zahodí. Vedení se nic nemění, takže se ani neptá dvakrát.
  useEffect(() => {
    let zruseno = false;
    const today = pragueToday();
    if (smiTrzby) {
      fetch(`/api/pos/summary?date=${today}`).then(okJson)
        .then(d => { if (!zruseno) setPos(d?.connected && d.bills != null ? d : null); }).catch(() => {});
    } else setPos(null);
    if (smiTrzby || smiUzaverky) {
      fetch('/api/closings').then(okJson).then(d => {
        if (zruseno) return;
        const list = Array.isArray(d.closings) ? d.closings : [];
        setClosings(list);
        setPendingClosings(list.filter((c: any) => c.approved === false).length);
      }).catch(() => {});
    } else { setClosings([]); setPendingClosings(0); }
    if (smiSmenu) {
      fetch('/api/attendance?days=1').then(okJson).then(d => {
        if (!zruseno) setRoster(Array.isArray(d.roster) ? d.roster : []);
      }).catch(() => {});
    } else setRoster([]);
    if (smiSklad) {
      fetch('/api/inventory').then(okJson).then(d => {
        if (zruseno) return;
        // Endpoint vrací holé pole; dřív se četlo d.items a dlaždice byla vždy prázdná.
        const items = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
        setLowItems(items.filter((i: any) => !i.madeInHouse && (i.status === 'low' || i.status === 'critical')));
      }).catch(() => {});
    } else setLowItems([]);
    return () => { zruseno = true; };
  }, [smiTrzby, smiUzaverky, smiSmenu, smiSklad]);

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

  // Chat v režimu TO GO úplně chyběl — a přitom je to ten režim, který se
  // otevírá na telefonu. Šest dlaždic hlásilo, co potřebuje pozornost,
  // jen zprávy ne.
  const { conversations: chatConvs } = useConversations();
  const unreadChat = chatConvs.reduce((n, c) => n + (c.unreadCount || 0), 0);
  const newestUnread = chatConvs.filter(c => (c.unreadCount || 0) > 0)
    .sort((a, b) => String(b.lastTime ?? '').localeCompare(String(a.lastTime ?? '')))[0] ?? null;

  // Zprávy jdou první a Finance poslední (kouká se na ně jednou za měsíc).
  // Devět dlaždic = tři plné řádky. Dřív jich bylo sedm a Finance zůstávala
  // samotná na posledním řádku — mřížka nemá nechávat osiřelou buňku,
  // a Úkoly s Postupy na telefonu „za pochodu" chybět nemají: otevírací
  // checklist a denní úkoly jsou přesně to, co se řeší cestou do podniku.
  const tiles = [
    { view: 'chat', icon: 'chat', label: 'Zprávy', badge: unreadChat || null, badgeTone: 'seg-on' },
    { view: 'reports', icon: 'trend', label: 'Přehledy', badge: pendingClosings || null, badgeTone: 'seg-on' },
    { view: 'inventory', icon: 'box', label: 'Sklad', badge: lowItems.length || null, badgeTone: 'bg-wait text-white' }, // zásoby jsou varování, ne počet
    { view: 'shifts', icon: 'calendar', label: 'Rozvrh', badge: null, badgeTone: '' },
    { view: 'attendance', icon: 'clock', label: 'Docházka', badge: onShift.length || null, badgeTone: 'seg-on' },
    { view: 'tasks', icon: 'check', label: 'Úkoly', badge: null, badgeTone: '' },
    { view: 'procedures', icon: 'clipboard', label: 'Postupy', badge: null, badgeTone: '' },
    { view: 'rewards', icon: 'award', label: 'Hodnocení', badge: null, badgeTone: '' },
    { view: 'finance', icon: 'coins', label: 'Finance', badge: null, badgeTone: '' },
  ].filter(t => smiPohled(t.view));

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)] pb-16"
      style={{ backgroundImage: 'radial-gradient(1100px 500px at 85% -10%, rgba(200,245,66,0.22), transparent 60%), radial-gradient(900px 500px at -15% 25%, rgba(143,184,17,0.10), transparent 55%)' }}>

      {/* Floating glass header */}
      <div className="sticky top-0 z-20 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <div className="max-w-lg mx-auto glass-strong rounded-3xl px-4 py-3 flex items-center gap-3 shadow-[0_12px_36px_rgba(25,35,15,0.14)]">
          <LogoMark size={34} />
          <div className="min-w-0 flex-1">
            <p className="t-label text-[#5B7A08] leading-none">TO GO</p>
            <h1 className="text-[15px] font-bold tracking-tight text-[#16181A] truncate mt-0.5">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
          </div>
          {/* Majitel víc podniků se na telefonu přepíná tady — boční pás tu není.
              S jedním podnikem se nic nekreslí. */}
          <PodnikSwitcher compact jenPrepinani onOverview={() => onOpenView('org')} />
          <button onClick={onExit}
            className="btn btn-accent btn-sm shrink-0">
            Administrace →
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-3 space-y-4">

        {/* Dark hero — today's number, big and calm */}
        {smiTrzby && (
        <div className="relative overflow-hidden rounded-3xl bg-[#16181A] text-white p-5 shadow-[0_18px_50px_rgba(15,20,8,0.35)]">
          <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#C8F542]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-10 h-48 w-48 rounded-full bg-[#8FB811]/15 blur-3xl" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="t-label text-white/45">Dnešní tržba</p>
                <p className="mt-1.5 text-[40px] leading-none font-bold tabular-nums tracking-tight">
                  {money(todayTotal)}
                </p>
              </div>
              {trendPct != null && (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold tabular-nums backdrop-blur-md ${
                  trendPct >= 0 ? 'bg-[#C8F542]/20 text-[#D8FF6B]' : 'bg-bad/15 text-bad-lift'
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
                    <div className="w-full rounded-full transition"
                      style={{
                        height: `${h}px`,
                        background: isToday
                          ? 'linear-gradient(180deg,#D8FF6B,#C8F542)'
                          : d.total > 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                        boxShadow: isToday ? '0 0 18px rgba(200,245,66,0.45)' : undefined,
                      }} />
                    <span className={`text-[11px] font-bold ${isToday ? 'text-[#D8FF6B]' : 'text-white/35'}`}>{d.label}</span>
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
        )}

        {/* Crew strip — who is here now / planned today */}
        {smiSmenu && (
        <div className="glass-card rounded-3xl p-4">
          <div className="flex items-center justify-between mb-2.5">
            <p className="t-label text-black/45">Dnes v podniku</p>
            {onShift.length > 0 && (
              <span className="rounded-full bg-[#C8F542]/25 text-[#5B7A08] px-2 py-0.5 text-[11px] font-extrabold">
                {onShift.length} na směně
              </span>
            )}
          </div>
          {plannedToday.length === 0 && onShift.length === 0 ? (
            <p className="text-sm text-black/40">Dnes nikdo nemá plánovanou směnu.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto scrollbar-thin scroll-fade-x snap-x snap-mandatory -mx-1 px-1 pb-1">
              {(plannedToday.length ? plannedToday : onShift).map((p: any) => {
                const live = !!p.openSince;
                return (
                  <div key={p.id}
                    className={`shrink-0 snap-start flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border backdrop-blur-md ${
                      live ? 'bg-[#C8F542]/15 border-[#C8F542]/40' : 'bg-white/55 border-black/[0.06]'
                    }`}>
                    <span className="relative h-8 w-8 flex items-center justify-center">
                      <Avatar emoji={p.avatar} size="sm" />
                      {live && <span className="absolute -bottom-0 -right-0 h-2.5 w-2.5 rounded-full bg-[#8FB811] ring-2 ring-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-[#16181A] leading-tight">{String(p.name).split(' ')[0]}</span>
                      <span className="block text-[11px] text-black/40 leading-tight tabular-nums">
                        {live ? 'právě tady' : p.shiftStart ? `${String(p.shiftStart).slice(0, 5)}–${String(p.shiftEnd ?? '').slice(0, 5)}` : ''}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* Quick functions — frosted tiles with badges */}
        <div className="grid grid-cols-3 gap-2.5 stagger">
          {tiles.map(t => (
            <button key={t.view} onClick={() => onOpenView(t.view)}
              className="relative glass-card rounded-3xl px-2 py-3.5 flex flex-col items-center gap-1.5 active:scale-95 transition hover:bg-white/70">
              {t.badge != null && (
                <span className={`absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-extrabold flex items-center justify-center ${t.badgeTone}`}>
                  {t.badge}
                </span>
              )}
              <Icon name={t.icon as any} size={22} className="text-[#16181A] i-lead" strokeWidth={1.8} />
              <span className="text-[11px] font-bold text-black/60">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Poslední nepřečtená — dlaždice řekne „3", tohle řekne od koho a co.
            Na telefonu je to jediné místo, kde se člověk dozví obsah zprávy,
            aniž by musel chat otevřít a vlákno v něm hledat. */}
        {newestUnread && smiPohled('chat') && (
          <button onClick={() => onOpenView('chat', String(newestUnread.id))}
            className="w-full glass-card rounded-3xl p-4 text-left active:scale-[0.99] transition">
            <div className="flex items-center justify-between mb-2">
              <p className="t-label text-[#5B7A08] flex items-center gap-1.5">
                <Icon name="chat" size={14} strokeWidth={2} /> Nepřečtená zpráva
              </p>
              <span className="text-[11px] font-bold text-black/35">
                {unreadChat > 1 ? `${unreadChat} celkem →` : 'Otevřít →'}
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              {newestUnread.type === 'team' ? (
                <span className="h-9 w-9 shrink-0 rounded-full bg-[#C8F542]/25 text-[#5B7A08] flex items-center justify-center">
                  <Icon name="users" size={18} />
                </span>
              ) : (
                <Avatar emoji={newestUnread.avatar} size="sm" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[#16181A] truncate">{newestUnread.name}</span>
                <span className="block text-[13px] text-black/50 line-clamp-2">
                  {newestUnread.lastMessage ?? 'Nová zpráva'}
                </span>
              </span>
              <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#C8F542] text-black text-[11px] font-extrabold flex items-center justify-center tabular-nums">
                {newestUnread.unreadCount}
              </span>
            </div>
          </button>
        )}

        {/* Low stock — the three most urgent, actionable */}
        {smiSklad && lowItems.length > 0 && (
          <button onClick={() => onOpenView('inventory')}
            className="w-full glass-card rounded-3xl p-4 text-left active:scale-[0.99] transition">
            <div className="flex items-center justify-between mb-2">
              <p className="t-label text-wait-ink flex items-center gap-1.5">
                <Icon name="box" size={14} strokeWidth={2} /> Dochází ve skladu
              </p>
              <span className="text-[11px] font-bold text-black/35">{lowItems.length} celkem →</span>
            </div>
            <div className="space-y-1.5">
              {lowItems.slice(0, 3).map((i: any) => (
                <div key={i.id} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${i.status === 'critical' ? 'bg-bad' : 'bg-wait'}`} />
                  <span className="text-sm font-semibold text-[#16181A] truncate flex-1">{i.name}</span>
                  <span className="text-xs text-black/45 tabular-nums shrink-0">{i.quantity} {i.unit}</span>
                </div>
              ))}
            </div>
          </button>
        )}

        {/* K výrobě — z docházejícího skladu rovnou úkol s recepturou. */}
        {smiVyrobu && <ProductionBoard compact onOpenTasks={() => onOpenView('tasks')} />}

        {/* Receipts — the TO GO superpower */}
        {smiUctenky && <ReceiptsPanel compact />}

        <p className="text-center text-[11px] text-black/25 pb-2">Managero · TO GO režim</p>
      </div>
    </div>
  );
}
