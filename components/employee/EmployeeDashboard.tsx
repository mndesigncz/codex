'use client';

import { useState, useEffect, Fragment } from 'react';
import { Icon } from '../Icons';
import ClockWidget from '../employer/ClockWidget';
import AnnouncementBanner from '../AnnouncementBanner';
import { readLayout, EMPLOYEE_WIDGETS } from '@/lib/dashboardWidgets';
import { LinkTile } from '../DashboardEditor';

interface Props {
  user: { id?: string; name?: string | null; avatar?: string };
  onNavigate: (view: string, arg?: string) => void;
}

interface ShiftReview {
  work_date: string; rating: number; note: string | null; points: number;
  flagged?: boolean; scope?: string; seen_at?: string | null;
}

function nextMonthStr() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function EmployeeDashboard({ user, onNavigate }: Props) {
  const meId = parseInt(user.id ?? '0');
  const [shifts, setShifts] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [availabilitySubmitted, setAvailabilitySubmitted] = useState<boolean | null>(null);
  const [unreadChats, setUnreadChats] = useState(0);
  const [closingsDue, setClosingsDue] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [reviews, setReviews] = useState<ShiftReview[]>([]);
  const [pinnedShare, setPinnedShare] = useState<{ token: string; title: string | null; kind: string } | null>(null);
  const [myEntries, setMyEntries] = useState<any[]>([]);
  const [handover, setHandover] = useState<any | null>(null);
  const [nextEvent, setNextEvent] = useState<any | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [unseenFlagged, setUnseenFlagged] = useState(0);
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const layout = readLayout(cfg, EMPLOYEE_WIDGETS);

  useEffect(() => {
    (async () => {
      try {
        const [sh, tk, inv, av, conv, cl, att, tm, rw] = await Promise.all([
          fetch('/api/shifts').then(r => r.json()).catch(() => ({})),
          fetch(`/api/tasks?assignedTo=${meId}`).then(r => r.json()).catch(() => []),
          fetch('/api/inventory').then(r => r.json()).catch(() => []),
          fetch(`/api/availability?month=${nextMonthStr()}`).then(r => r.json()).catch(() => null),
          fetch('/api/conversations').then(r => r.json()).catch(() => []),
          fetch('/api/closings').then(r => r.json()).catch(() => ({})),
          fetch('/api/attendance').then(r => r.json()).catch(() => ({})),
          fetch('/api/teams').then(r => r.json()).catch(() => ({})),
          fetch('/api/rewards').then(r => r.json()).catch(() => ({})),
        ]);
        setCfg(tm?.team?.dashboard_config?.employee ?? {});
        setPinnedShare(tm?.pinnedShare ?? null);
        fetch('/api/events').then(r => r.json()).then(d => {
          const today0 = new Date().toISOString().slice(0, 10);
          const up = (Array.isArray(d.events) ? d.events : [])
            .filter((e: any) => e.date >= today0 && e.status !== 'cancelled')
            .sort((a: any, b: any) => a.date.localeCompare(b.date));
          setNextEvent(up[0] ?? null);
        }).catch(() => {});
        setMyId(typeof user?.id === 'string' ? parseInt(user.id) : (user?.id ?? null));
        setMyEntries(Array.isArray(att?.entries) ? att.entries : []);
        fetch('/api/closings/handover').then(r => r.json())
          .then(d => setHandover(d?.handover ? d : null)).catch(() => {});
        const allShifts = Array.isArray(sh?.shifts) ? sh.shifts : Array.isArray(sh) ? sh : [];
        setShifts(allShifts.filter((s: any) => s.employeeId === meId || s.employee_id === meId));
        setTasks(Array.isArray(tk) ? tk : []);
        setInventory(Array.isArray(inv) ? inv : []);
        setAvailabilitySubmitted(av && !av.error ? !!av : false);
        const convs = Array.isArray(conv) ? conv : conv?.conversations ?? [];
        setUnreadChats(convs.reduce((s: number, c: any) => s + (c.unreadCount || 0), 0));
        setClosingsDue(Array.isArray(cl?.eligibleShifts) ? cl.eligibleShifts : []);
        setTimeEntries(Array.isArray(att?.entries) ? att.entries : []);
        setReviews(Array.isArray(rw?.reviews) ? rw.reviews : []);
        setUnseenFlagged(Number(rw?.unseenFlagged) || 0);
      } catch {}
      setLoading(false);
    })();
  }, [meId]);

  const today = new Date().toISOString().split('T')[0];
  const upcoming = shifts
    .filter(s => (s.date ?? '') >= today)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const nextShift = upcoming[0];
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const lowStock = inventory.filter(i => i.quantity <= i.minQuantity);

  // Feedback the employee hasn't acknowledged yet. Capped to the last week so a
  // database without the seen_at column can't keep the card open forever.
  const feedbackSince = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const freshReviews = reviews
    .filter(r => !r.seen_at && String(r.work_date ?? '').slice(0, 10) >= feedbackSince)
    .sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)));
  const latestReview = freshReviews[0] ?? null;
  const feedbackAlert = unseenFlagged > 0 || freshReviews.some(r => r.flagged === true);
  const reviewDay = latestReview ? new Date(String(latestReview.work_date).slice(0, 10) + 'T00:00:00') : null;
  const feedbackDetail = latestReview
    ? [
      reviewDay && !isNaN(reviewDay.getTime()) ? reviewDay.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' }) : '',
      latestReview.rating > 0 ? `${latestReview.rating}★` : '',
      latestReview.points ? `${latestReview.points > 0 ? '+' : ''}${latestReview.points} bodů` : '',
    ].filter(Boolean).join(' · ')
    : '';

  // Hours worked this calendar month (open shift counts up to now).
  const monthKey = today.slice(0, 7);
  const workedMs = timeEntries.reduce((sum, e) => {
    const inT = new Date(e.clockIn).getTime();
    if (Number.isNaN(inT) || String(e.clockIn).slice(0, 7) !== monthKey) return sum;
    const outT = e.clockOut ? new Date(e.clockOut).getTime() : Date.now();
    return sum + Math.max(0, outT - inT);
  }, 0);
  const workedH = Math.floor(workedMs / 3600000);
  const workedM = Math.floor((workedMs % 3600000) / 60000);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 10) return 'Dobré ráno';
    if (h < 18) return 'Dobrý den';
    return 'Dobrý večer';
  })();

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="h-7 w-56 rounded-full bg-black/[0.05] animate-pulse" />
        <div className="glass-card h-32 animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card h-28 animate-pulse" />
          <div className="glass-card h-28 animate-pulse" />
        </div>
        <div className="glass-card h-20 animate-pulse" />
      </div>
    );
  }

  // Named blocks; the employer-approved layout decides order and presence.
  // This month in numbers, for the person themselves.
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthHours = myEntries.reduce((sum: number, e: any) => {
    if (!e.clockOut || String(e.clockIn).slice(0, 7) !== monthPrefix) return sum;
    const h = (new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 3600000;
    return h > 0 && h < 24 ? sum + h : sum;
  }, 0);
  const monthRatings = reviews.filter(r => String(r.work_date ?? '').slice(0, 7) === monthPrefix && Number(r.rating) > 0);
  const monthAvg = monthRatings.length
    ? monthRatings.reduce((s2, r) => s2 + Number(r.rating), 0) / monthRatings.length
    : null;
  const fmtH = (h: number) => {
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return mm ? `${hh} h ${mm} m` : `${hh} h`;
  };

  const blocks: Record<string, React.ReactNode> = {
    nextEvent: nextEvent ? (
      <div className="rounded-3xl bg-[#0A84FF]/[0.07] border border-[#0A84FF]/25 p-5">
        <p className="font-bold text-[#16181A] truncate">📅 {nextEvent.title}</p>
        <p className="text-sm text-black/50 mt-0.5 capitalize truncate">
          {new Date(nextEvent.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          {nextEvent.startTime ? ` · ${nextEvent.startTime}` : ''}{nextEvent.location ? ` · 📍 ${nextEvent.location}` : ''}
        </p>
        {myId != null && nextEvent.crew?.includes(myId) && (
          <p className="mt-2 inline-block rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-3 py-1 text-xs font-semibold">Jsi na akci — směna je v rozvrhu ✓</p>
        )}
      </div>
    ) : null,
    handover: handover ? (
      <div className="rounded-3xl bg-[#0A84FF]/[0.07] border border-[#0A84FF]/25 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">
          🤝 Předávka od {handover.authorName ?? 'předchozí směny'}
          <span className="normal-case font-normal text-black/35"> · {new Date(handover.date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}</span>
        </p>
        <div className="space-y-1.5 text-sm text-[#16181A]">
          {handover.handover.todo && <p>🔧 <span className="text-black/70">{handover.handover.todo}</span></p>}
          {handover.handover.runningOut && <p>📦 <span className="text-black/70">{handover.handover.runningOut}</span></p>}
          {handover.handover.message && <p>💬 <span className="text-black/70">{handover.handover.message}</span></p>}
        </div>
      </div>
    ) : null,
    monthly: (monthHours > 0 || monthRatings.length > 0) ? (
      <div className="glass-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-3">📆 Tenhle měsíc</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-black/40 truncate">Odpracováno</p>
            <p className="text-base sm:text-xl font-bold tabular-nums text-[#16181A] mt-0.5 whitespace-nowrap">{fmtH(monthHours)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-black/40 truncate">Hodnocených směn</p>
            <p className="text-base sm:text-xl font-bold tabular-nums text-[#16181A] mt-0.5">{monthRatings.length}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-black/40 truncate">Průměr hodnocení</p>
            <p className="text-base sm:text-xl font-bold tabular-nums text-[#16181A] mt-0.5 whitespace-nowrap">{monthAvg != null ? `★ ${monthAvg.toFixed(1)}` : '—'}</p>
          </div>
        </div>
      </div>
    ) : null,
    sharedLink: pinnedShare ? (
      <a href={`/s/${pinnedShare.token}`} target="_blank" rel="noreferrer"
        className="block rounded-3xl bg-[#C8F542]/[0.10] border border-[#C8F542]/30 p-5 hover:bg-[#C8F542]/[0.16] transition-all">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-[#16181A] truncate">📌 {pinnedShare.title || (pinnedShare.kind === 'guides' ? 'Naše nabídka' : 'Co máme skladem')}</p>
            <p className="text-sm text-black/50 mt-0.5 truncate">Sdílená stránka pro zákazníky — otevři nebo ukaž QR z prohlížeče.</p>
          </div>
          <span className="shrink-0 rounded-full bg-[#16181A] text-white px-4 py-2 text-sm font-semibold whitespace-nowrap">Otevřít →</span>
        </div>
      </a>
    ) : null,
    clock: user.id ? <ClockWidget userId={parseInt(String(user.id))} /> : null,
    nextShift: (
            <button onClick={() => onNavigate('my-shifts')} className="w-full text-left glass-card p-6 hover:bg-black/[0.05] transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wider text-black/45">Nejbližší směna</p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#C8F542]/12 text-[#5B7A08]"><Icon name="calendar" size={17} /></span>
              </div>
              {nextShift ? (
                <div>
                  <p className="text-3xl font-bold tracking-tight text-[#16181A]">
                    {new Date((nextShift.date) + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-black/55 mt-1">{(nextShift.startTime ?? nextShift.start_time)} – {(nextShift.endTime ?? nextShift.end_time)} · {nextShift.typeLabel ?? (nextShift.type === 'morning' ? 'Ranní' : nextShift.type === 'afternoon' ? 'Odpolední' : 'Směna')}</p>
                </div>
              ) : (
                <p className="text-black/45">Žádná nadcházející směna.</p>
              )}
            </button>
    ),
    feedback: (latestReview || unseenFlagged > 0) ? (
              <button onClick={() => onNavigate('rewards')}
                className={`w-full text-left rounded-3xl border p-5 transition-all ${feedbackAlert ? 'bg-red-500/[0.07] border-red-500/30 hover:bg-red-500/[0.11]' : 'bg-[#C8F542]/15 border-[#C8F542]/30 hover:bg-[#C8F542]/20'}`}>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${feedbackAlert ? 'bg-red-500/15 text-red-600' : 'bg-[#16181A] text-[#C8F542]'}`}>
                    <Icon name={feedbackAlert ? 'warning' : 'award'} size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#16181A]">
                      {feedbackAlert ? 'U tvé směny je něco k nápravě' : 'Vedení ohodnotilo tvou směnu'}
                    </p>
                    <p className={`text-sm ${feedbackAlert ? 'text-red-600' : 'text-[#5B7A08]'}`}>
                      {feedbackAlert
                        ? 'Podívej se, co je potřeba probrat, a potvrď, že to víš.'
                        : feedbackDetail ? `${feedbackDetail} — přečti si zpětnou vazbu.` : 'Přečti si zpětnou vazbu k poslední směně.'}
                    </p>
                  </div>
                  <Icon name="chevron" size={16} className={`-rotate-90 shrink-0 ${feedbackAlert ? 'text-red-600' : 'text-[#5B7A08]'}`} />
                </div>
              </button>
    ) : null,
    stats: (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <button onClick={() => onNavigate('tasks')} className="text-left glass-card p-5 hover:bg-black/[0.05] transition-all duration-300">
                <p className="text-xs uppercase tracking-wider text-black/45">Moje úkoly</p>
                <p className="text-3xl font-bold tracking-tight text-[#16181A] mt-2">{activeTasks.length}</p>
                <p className="text-xs text-black/45 mt-1">aktivních</p>
              </button>
              <button onClick={() => onNavigate('chat')} className="text-left glass-card p-5 hover:bg-black/[0.05] transition-all duration-300">
                <p className="text-xs uppercase tracking-wider text-black/45">Nepřečtené zprávy</p>
                <p className="text-3xl font-bold tracking-tight text-[#16181A] mt-2">{unreadChats}</p>
                <p className="text-xs text-black/45 mt-1">v chatu</p>
              </button>
              <div className="text-left glass-card p-5 col-span-2 sm:col-span-1">
                <p className="text-xs uppercase tracking-wider text-black/45">Odpracováno</p>
                <p className="text-3xl font-bold tracking-tight text-[#16181A] mt-2 tabular-nums">
                  {workedH}<span className="text-lg font-semibold text-black/45"> h </span>{workedM > 0 && <>{workedM}<span className="text-lg font-semibold text-black/45"> min</span></>}
                </p>
                <p className="text-xs text-black/45 mt-1">tento měsíc (píchačky)</p>
              </div>
            </div>
    ),
    announcements: <AnnouncementBanner />,
    closing: closingsDue.length > 0 ? (
              <button onClick={() => onNavigate('closing')} className="w-full text-left rounded-3xl bg-[#C8F542]/15 border border-[#C8F542]/30 p-5 hover:bg-[#C8F542]/20 transition-all">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#16181A] text-[#C8F542] shrink-0"><Icon name="trend" size={18} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#16181A]">
                      {closingsDue.length === 1 ? 'Vyplň uzávěrku ze své směny' : `Máš ${closingsDue.length} neuzavřené směny`}
                    </p>
                    <p className="text-sm text-[#5B7A08]">Spočítej kasu a odešli uzávěrku — vedení ji uvidí hned.</p>
                  </div>
                  <Icon name="chevron" size={16} className="text-[#5B7A08] -rotate-90 shrink-0" />
                </div>
              </button>
            ) : (
              <button onClick={() => onNavigate('closing')} className="w-full text-left glass-card p-5 hover:bg-black/[0.05] transition-all duration-300">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#16181A] text-[#C8F542] shrink-0"><Icon name="trend" size={18} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#16181A]">Uzávěrka směny</p>
                    <p className="text-sm text-black/55">Na konci směny spočítej kasu a odešli uzávěrku.</p>
                  </div>
                  <Icon name="chevron" size={16} className="text-black/35 -rotate-90 shrink-0" />
                </div>
              </button>
    ),
    availability: availabilitySubmitted === false ? (
              <button onClick={() => onNavigate('availability')} className="w-full text-left rounded-3xl bg-[#C8F542]/10 border border-[#C8F542]/25 p-5 hover:bg-[#C8F542]/15 transition-all">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#C8F542]/20 text-[#5B7A08]"><Icon name="calendar" size={18} /></span>
                  <div>
                    <p className="font-semibold text-[#16181A]">Zadejte dostupnost na příští měsíc</p>
                    <p className="text-sm text-black/55">Dejte vedení vědět, kdy nemůžete — sestaví podle toho rozvrh.</p>
                  </div>
                </div>
              </button>
    ) : null,
    lowStock: lowStock.length > 0 ? (
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold tracking-tight text-[#16181A]">Zásoby, které docházejí</h3>
                  <button onClick={() => onNavigate('inventory')} className="text-sm text-[#5B7A08] hover:brightness-110">Sklad →</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lowStock.slice(0, 8).map(i => (
                    <span key={i.id} className="rounded-full px-3 py-1 text-xs font-medium bg-orange-500/15 text-orange-600">{i.name} · {i.quantity} {i.unit}</span>
                  ))}
                </div>
              </div>
    ) : null,
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <span className="text-3xl flex h-14 w-14 items-center justify-center rounded-full ring-1 ring-black/10 bg-black/[0.05]">{user.avatar ?? '👤'}</span>
        <div>
          <p className="text-black/45 text-sm">{greeting},</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#16181A]">{user.name}</h1>
        </div>
      </div>

      {layout.map((e, i) =>
        e.type === 'link'
          ? <LinkTile key={`l-${e.target}-${i}`} entry={e} onNavigate={onNavigate} />
          : <Fragment key={`w-${e.id}-${i}`}>{blocks[e.id] ?? null}</Fragment>,
      )}
    </div>
  );
}
