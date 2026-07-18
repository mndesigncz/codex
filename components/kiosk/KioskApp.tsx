'use client';

import { useState, useEffect, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { Icon, LogoMark } from '../Icons';
import KioskInventory from './KioskInventory';
import KioskTasks from './KioskTasks';
import Procedures from '../procedures/Procedures';
import Guides from '../Guides';

const TABS = [
  { id: 'clock',      label: 'Píchačky', icon: 'clock' },
  { id: 'tasks',      label: 'Úkoly',    icon: 'check' },
  { id: 'inventory',  label: 'Sklad',    icon: 'box' },
  { id: 'procedures', label: 'Postupy',  icon: 'clipboard' },
  { id: 'guides',     label: 'Návody',   icon: 'book' },
] as const;

interface RosterMember {
  id: number;
  name: string;
  avatar?: string;
  hasPin: boolean;
  openSince: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

function elapsed(fromIso: string, now: number) {
  const secs = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export default function KioskApp({ teamName }: { teamName: string }) {
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<RosterMember | null>(null);
  const [flash, setFlash] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('clock');
  const now = useNow();
  // The shared device acts as a pseudo-user for the reused views (read/run only).
  const kioskUser = { id: 0, name: teamName, role: 'kiosk', avatar: '📟' } as any;

  const load = useCallback(async () => {
    try {
      const d = await fetch('/api/attendance').then(r => r.json());
      setRoster(Array.isArray(d.roster) ? d.roster : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Keep the roster fresh so a second tablet / the employer stay in sync.
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const clock = new Date(now).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date(now).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const onCount = roster.filter(m => m.openSince).length;

  return (
    <div className="min-h-screen flex flex-col p-5 sm:p-8">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <LogoMark size={44} />
          <div className="min-w-0">
            <p className="font-bold text-lg tracking-tight text-[#16181A] truncate">Píchačky</p>
            <p className="text-sm text-black/45 capitalize truncate">{dateStr}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-3xl font-bold tracking-tight text-[#16181A] tabular-nums leading-none">{clock}</p>
            <p className="text-xs text-black/45 mt-1">{onCount} na směně</p>
          </div>
          <button onClick={() => signOut({ callbackUrl: '/login' })} title="Odhlásit tablet"
            className="rounded-full glass border border-black/10 w-11 h-11 flex items-center justify-center text-black/45 hover:text-black transition shrink-0">
            <Icon name="logout" size={20} />
          </button>
        </div>
      </header>

      {/* Tabs — everything the shift needs on one shared device */}
      <nav className="mt-5 flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 transition ${
              tab === t.id ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
            }`}>
            <Icon name={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </nav>

      {flash && (
        <div className="mt-4 p-4 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/30 text-[#5B7A08] font-medium text-center">
          {flash}
        </div>
      )}

      {tab === 'inventory' && <main className="flex-1 mt-5"><KioskInventory /></main>}
      {tab === 'tasks' && <main className="flex-1 mt-5"><KioskTasks /></main>}
      {tab === 'procedures' && <main className="flex-1 mt-2 -mx-1"><Procedures user={kioskUser} /></main>}
      {tab === 'guides' && <main className="flex-1 mt-2 -mx-1"><Guides user={kioskUser} /></main>}

      {/* Roster */}
      {tab === 'clock' && (
      <main className="flex-1 mt-6">
        {loading ? (
          <div className="flex items-center justify-center h-64"><div className="h-9 w-9 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
        ) : roster.length === 0 ? (
          <div className="glass-card p-10 text-center text-black/45 max-w-md mx-auto mt-10">
            Zatím žádní zaměstnanci. Přidej je v aplikaci vedení (Nastavení týmu).
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {roster.map(m => {
              const on = !!m.openSince;
              return (
                <button key={m.id} onClick={() => setActive(m)}
                  className={`relative rounded-3xl p-5 text-left transition-all active:scale-[0.98] border ${
                    on ? 'bg-[#C8F542]/[0.14] border-[#C8F542]/40' : 'glass-card hover:bg-black/[0.03]'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-4xl">{m.avatar || '👤'}</span>
                    <span className={`h-3 w-3 rounded-full ${on ? 'bg-[#5B9E00]' : 'bg-black/15'}`} />
                  </div>
                  <p className="font-bold text-[#16181A] mt-3 truncate">{m.name}</p>
                  {on ? (
                    <p className="text-sm font-semibold text-[#5B7A08] tabular-nums mt-0.5">{elapsed(m.openSince!, now)}</p>
                  ) : m.shiftStart ? (
                    <p className="text-sm text-[#0A6FE0] tabular-nums mt-0.5">Dnes {m.shiftStart}–{m.shiftEnd}</p>
                  ) : (
                    <p className="text-sm text-black/40 mt-0.5">Mimo směnu</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </main>
      )}

      {active && (
        <PunchDialog
          member={active}
          now={now}
          onClose={() => setActive(null)}
          onDone={(msg) => {
            setActive(null);
            load();
            if (msg) { setFlash(msg); setTimeout(() => setFlash(''), 8000); }
          }}
        />
      )}
    </div>
  );
}

function PunchDialog({ member, now, onClose, onDone }: {
  member: RosterMember; now: number; onClose: () => void; onDone: (flashMsg?: string) => void;
}) {
  const on = !!member.openSince;
  const needPin = member.hasPin && !on; // PIN only required to clock in
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: member.id, action: on ? 'out' : 'in', pin: needPin ? pin : undefined }),
      });
      const d = await res.json();
      if (res.ok) {
        if (d.action === 'out' && d.closingDone === false) {
          onDone(`${member.name}: odchod zaznamenán ✓ — nezapomeň vyplnit uzávěrku směny!`);
        } else {
          onDone();
        }
      }
      else { setErr(d.error || 'Nepodařilo se zaznamenat.'); setPin(''); }
    } catch { setErr('Chyba serveru.'); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div className="modal-sheet rounded-3xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
        <span className="text-5xl">{member.avatar || '👤'}</span>
        <h2 className="text-xl font-bold tracking-tight text-[#16181A] mt-2">{member.name}</h2>
        <p className="text-sm text-black/50 mt-1">
          {on ? `Na směně od ${new Date(member.openSince!).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })} · ${elapsed(member.openSince!, now)}` : 'Zaznamenej příchod na směnu'}
        </p>
        {!on && member.shiftStart && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF]/10 text-[#0A6FE0] px-3 py-1 text-xs font-medium tabular-nums">
            <Icon name="calendar" size={13} /> Dnes máš směnu {member.shiftStart}–{member.shiftEnd}
          </p>
        )}

        {needPin && (
          <div className="mt-5">
            <div className="flex justify-center gap-2 mb-3">
              {[0, 1, 2, 3].map(i => (
                <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-[#16181A]' : 'bg-black/15'}`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => k === '' ? <span key={i} /> : (
                <button key={i} onClick={() => k === '⌫' ? setPin(p => p.slice(0, -1)) : setPin(p => (p.length < 6 ? p + k : p))}
                  className="h-14 rounded-2xl glass border border-black/10 text-xl font-semibold text-[#16181A] hover:bg-black/[0.05] active:scale-95 transition">
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

        {err && <p className="text-sm text-red-600 mt-4">{err}</p>}

        <div className="mt-6 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full bg-black/[0.05] border border-black/10 text-[#16181A] px-4 py-3.5 font-medium hover:bg-black/[0.08] transition">
            Zpět
          </button>
          <button onClick={submit} disabled={busy || (needPin && pin.length < 4)}
            className={`flex-1 rounded-full px-4 py-3.5 font-semibold text-white transition disabled:opacity-50 ${on ? 'bg-red-500 hover:brightness-110' : 'bg-[#16181A] hover:bg-black'}`}>
            {busy ? '…' : on ? 'Odpíchnout odchod' : 'Odpíchnout příchod'}
          </button>
        </div>
      </div>
    </div>
  );
}
