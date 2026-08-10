'use client';

import { useState, useEffect, Fragment } from 'react';
import { Icon } from '../Icons';
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
  const blocks: Record<string, React.ReactNode> = {
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
