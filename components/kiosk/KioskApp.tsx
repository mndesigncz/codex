'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { Icon, LogoMark } from '../Icons';
import KioskInventory from './KioskInventory';
import KioskTasks from './KioskTasks';
import Procedures from '../procedures/Procedures';
import Guides from '../Guides';
import CashClosing from '../employee/CashClosing';
import MessengerDock from '../chat/MessengerDock';
import AnnouncementBanner from '../AnnouncementBanner';
import { usePlan, ProBadge } from '../Pro';
import {
  KioskShiftProvider, KioskShiftGate, WhoIsWorking, ActivePersonChip,
  useKioskShift, useNow,
} from './KioskShiftGate';

const TABS = [
  { id: 'shift',      label: 'Směna',    icon: 'clock' },
  { id: 'tasks',      label: 'Úkoly',    icon: 'check' },
  { id: 'procedures', label: 'Postupy',  icon: 'clipboard' },
  { id: 'inventory',  label: 'Sklad',    icon: 'box' },
  { id: 'closing',    label: 'Uzávěrka', icon: 'trend' },
  { id: 'guides',     label: 'Návody',   icon: 'book' },
] as const;

interface KioskUser { id?: string | number; name: string; role: string; avatar?: string }

export default function KioskApp({ user }: { user: KioskUser }) {
  // The shared tablet is a Pro feature. The gate explains instead of erroring.
  const { pro, loaded } = usePlan();
  if (loaded && !pro) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-card p-10 max-w-md text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#C8F542]/15 text-3xl">📟</div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#16181A]">Kiosk režim</h1>
            <ProBadge />
          </div>
          <p className="text-sm text-black/55">Sdílený tablet na prodejně — docházka, úkoly, sklad a uzávěrky pro celý tým — patří do plánu Pro. Zapíná se v Nastavení → Předplatné v účtu vedení.</p>
        </div>
      </div>
    );
  }

  return (
    <KioskShiftProvider>
      <KioskShell user={user} />
    </KioskShiftProvider>
  );
}

function KioskShell({ user }: { user: KioskUser }) {
  const { active } = useKioskShift();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('shift');
  const now = useNow();
  // The real kiosk session user — used where the surface is shared/read-only.
  const kioskUser = { id: user.id ?? 0, name: user.name, role: 'kiosk', avatar: user.avatar ?? '📟' } as any;
  // Work surfaces run under the person currently selected on the tablet.
  const actingUser = active
    ? ({ id: active.id, name: active.name, role: 'employee', avatar: active.avatar } as any)
    : kioskUser;

  const clock = new Date(now).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date(now).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen flex flex-col p-5 sm:p-8">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <LogoMark size={44} />
          <div className="min-w-0">
            <p className="font-bold text-lg tracking-tight text-[#16181A] truncate">{user.name}</p>
            <p className="text-sm text-black/45 capitalize truncate">{dateStr}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <ActivePersonChip />
          <p className="text-3xl font-bold tracking-tight text-[#16181A] tabular-nums leading-none">{clock}</p>
          <button onClick={() => signOut({ callbackUrl: '/login' })} title="Odhlásit tablet"
            className="rounded-full glass border border-black/10 w-11 h-11 flex items-center justify-center text-black/45 hover:text-black transition shrink-0">
            <Icon name="logout" size={20} />
          </button>
        </div>
      </header>

      {/* Tabs — big touch targets for a shared tablet */}
      <nav className="mt-5 flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 min-h-[48px] transition active:scale-[0.97] ${
              tab === t.id ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
            }`}>
            <Icon name={t.icon} size={17} /> {t.label}
          </button>
        ))}
      </nav>

      {/* The shift tab is always reachable — it's where people clock in. */}
      {tab === 'shift' && (
        <main className="flex-1 mt-6 space-y-5">
          <AnnouncementBanner />
          <WhoIsWorkingOrLock />
          <KioskHomeExtras />
        </main>
      )}

      {/* Everything else unlocks once somebody is on shift and records under
          the active person's account. */}
      {tab !== 'shift' && (
        <KioskShiftGate>
          {tab === 'tasks' && <main className="flex-1 mt-5"><KioskTasks /></main>}
          {tab === 'procedures' && <main className="flex-1 mt-2 -mx-1"><Procedures user={actingUser} /></main>}
          {tab === 'inventory' && <main className="flex-1 mt-5"><KioskInventory /></main>}
          {tab === 'closing' && <main className="flex-1 mt-2 -mx-1"><CashClosing user={kioskUser} /></main>}
          {tab === 'guides' && <main className="flex-1 mt-2 -mx-1"><Guides user={kioskUser} /></main>}
        </KioskShiftGate>
      )}

      <MessengerDock user={kioskUser} />
    </div>
  );
}

// On the shift tab the gate's lock screen doubles as the clock-in flow, so the
// same surface serves both an empty and a running shift.
function WhoIsWorkingOrLock() {
  const { onShift } = useKioskShift();
  if (onShift.length === 0) return <KioskShiftGate>{null}</KioskShiftGate>;
  return <WhoIsWorking />;
}

// Extra context on the tablet's home tab: today's roster, the state of
// mandatory procedures, and the customer-facing pinned page — the things a
// shift actually needs at a glance.
function KioskHomeExtras() {
  const [roster, setRoster] = useState<any[]>([]);
  const [required, setRequired] = useState<{ id: number; name: string; icon?: string; done: boolean }[]>([]);
  const [pinnedShare, setPinnedShare] = useState<{ token: string; title: string | null; kind: string } | null>(null);
  const [handover, setHandover] = useState<any | null>(null);
  const [nextEvent, setNextEvent] = useState<any | null>(null);

  useEffect(() => {
    fetch('/api/attendance').then(r => r.json())
      .then(d => setRoster((d?.roster ?? []).filter((r: any) => r.shiftStart)))
      .catch(() => {});
    fetch('/api/teams').then(r => r.json())
      .then(d => setPinnedShare(d?.pinnedShare ?? null))
      .catch(() => {});
    fetch('/api/closings/handover').then(r => r.json())
      .then(d => setHandover(d?.handover ? d : null))
      .catch(() => {});
    fetch('/api/events').then(r => r.json()).then(d => {
      const today0 = new Date().toISOString().slice(0, 10);
      const up = (Array.isArray(d.events) ? d.events : [])
        .filter((e: any) => e.date >= today0 && e.status !== 'cancelled')
        .sort((a: any, b: any) => a.date.localeCompare(b.date));
      setNextEvent(up[0] ?? null);
    }).catch(() => {});
    Promise.all([
      fetch('/api/procedures').then(r => r.json()).catch(() => ({})),
      fetch('/api/procedures/runs?today=team').then(r => r.json()).catch(() => ({})),
    ]).then(([pd, rd]) => {
      const runs = Array.isArray(rd?.runs) ? rd.runs : [];
      const req = (Array.isArray(pd?.procedures) ? pd.procedures : [])
        .filter((p: any) => p.requireBeforeClosing === true)
        .map((p: any) => ({
          id: p.id, name: p.name, icon: p.icon,
          done: runs.some((r: any) => r.procedure_id === p.id && r.status === 'completed'),
        }));
      setRequired(req);
    }).catch(() => {});
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {nextEvent && (
        <div className="md:col-span-2 rounded-3xl bg-[#0A84FF]/[0.07] border border-[#0A84FF]/25 p-5">
          <p className="font-bold text-[#16181A]">📅 {nextEvent.title}</p>
          <p className="text-sm text-black/50 mt-0.5 capitalize">
            {new Date(nextEvent.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
            {nextEvent.startTime ? ` · ${nextEvent.startTime}` : ''}{nextEvent.location ? ` · 📍 ${nextEvent.location}` : ''}
          </p>
          {nextEvent.crewPeople?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {nextEvent.crewPeople.map((p: any) => (
                <span key={p.id} className="rounded-full bg-white/70 border border-black/[0.06] px-2.5 py-1 text-xs text-[#16181A]">{p.avatar} {p.name}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {handover && (
        <div className="md:col-span-2 rounded-3xl bg-[#0A84FF]/[0.07] border border-[#0A84FF]/25 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">
            🤝 Předávka od {handover.authorName ?? 'předchozí směny'}
          </p>
          <div className="space-y-1.5 text-sm text-[#16181A]">
            {handover.handover.todo && <p>🔧 <span className="text-black/70">{handover.handover.todo}</span></p>}
            {handover.handover.runningOut && <p>📦 <span className="text-black/70">{handover.handover.runningOut}</span></p>}
            {handover.handover.message && <p>💬 <span className="text-black/70">{handover.handover.message}</span></p>}
          </div>
        </div>
      )}
      {roster.length > 0 && (
        <div className="glass-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-3">📅 Dnešní směny</p>
          <div className="space-y-2">
            {roster.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 min-w-0">
                <span className="text-xl shrink-0">{r.avatar ?? '👤'}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#16181A]">{r.name}</span>
                <span className="shrink-0 text-sm text-black/50 tabular-nums">{String(r.shiftStart).slice(0, 5)}–{String(r.shiftEnd ?? '').slice(0, 5)}</span>
                {r.openSince && <span className="shrink-0 h-2 w-2 rounded-full bg-[#5B9E00]" title="Na směně" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {required.length > 0 && (
        <div className="glass-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-3">📋 Povinné postupy dnes</p>
          <div className="flex flex-wrap gap-2">
            {required.map(p => (
              <span key={p.id} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium ${
                p.done ? 'bg-[#C8F542]/15 text-[#5B7A08]' : 'bg-amber-500/12 text-amber-700'
              }`}>
                {p.icon ?? '📋'} {p.name} {p.done ? '✓' : '· čeká'}
              </span>
            ))}
          </div>
          {required.some(p => !p.done) && (
            <p className="text-[12px] text-black/45 mt-2.5">Bez dokončení nepůjde odeslat uzávěrka — najdeš je v záložce Postupy.</p>
          )}
        </div>
      )}

      {pinnedShare && (
        <a href={`/s/${pinnedShare.token}`} target="_blank" rel="noreferrer"
          className="md:col-span-2 block rounded-3xl bg-[#C8F542]/[0.10] border border-[#C8F542]/30 p-5 hover:bg-[#C8F542]/[0.16] transition-all">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-[#16181A] truncate">📌 {pinnedShare.title || (pinnedShare.kind === 'guides' ? 'Naše nabídka' : 'Co máme skladem')}</p>
              <p className="text-sm text-black/50 mt-0.5 truncate">Stránka pro zákazníky — otoč tablet a ukaž, co máme.</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#16181A] text-white px-5 py-2.5 text-sm font-semibold whitespace-nowrap">Otevřít →</span>
          </div>
        </a>
      )}
    </div>
  );
}
