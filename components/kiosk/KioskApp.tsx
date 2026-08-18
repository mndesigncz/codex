'use client';

import { useState } from 'react';
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
