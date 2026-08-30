'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { parseDbTime, dbTimeHM } from '@/lib/pragueTime';

export interface RosterMember {
  id: number;
  name: string;
  avatar?: string | null;
  hasPin: boolean;
  openSince: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
}

export interface ActivePerson {
  id: number;
  name: string;
  avatar: string;
}

const LS_ACTIVE = 'managero-kiosk-active';
const LS_ACTIVE_OLD = 'pangea-kiosk-active';
// The active person is mirrored into a cookie so server routes can attribute
// work to them even for shared components that post their own request bodies
// (the procedure runner, for example). Server side it is only ever honoured for
// a kiosk session whose target is clocked in — see app/api/tasks/route.ts.
const ACTING_COOKIE = 'managero-kiosk-acting';
const ACTING_MAX_AGE = 16 * 60 * 60; // one long shift

function writeActingCookie(id: number | null) {
  try {
    document.cookie = id
      ? `${ACTING_COOKIE}=${id}; path=/; max-age=${ACTING_MAX_AGE}; SameSite=Lax`
      : `${ACTING_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch { /* cookies disabled — the client still sends actingAs in bodies */ }
}

/** Tikající „teď". Vrací 0, dokud stránka nenaskočí v prohlížeči.
 *
 *  Brát Date.now() rovnou při renderu znamená, že server vykreslí jiný čas než
 *  prohlížeč — hydratace se rozejde, React zahodí celý serverový strom a
 *  překreslí ho znovu. Na iPadu to bylo vidět jako probliknutí při každém
 *  otevření. Nula je srozumitelné „ještě nevím" a komponenty na ni umí čekat. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function elapsed(fromIso: string, now: number) {
  // now === 0 znamená „prohlížeč se ještě neozval" — bez tohohle by se první
  // snímek pokusil odečíst čas od nuly a ukázal by nesmysl.
  if (!now) return '—';
  const from = parseDbTime(fromIso)?.getTime();
  if (from == null) return '—';
  const secs = Math.max(0, Math.round((now - from) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const timeOf = (iso: string) => dbTimeHM(iso);

interface KioskShiftValue {
  roster: RosterMember[];
  onShift: RosterMember[];
  offShift: RosterMember[];
  loading: boolean;
  activeId: number | null;
  active: ActivePerson | null;
  selectPerson: (id: number) => void;
  punch: (member: RosterMember) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<KioskShiftValue | null>(null);

export function useKioskShift(): KioskShiftValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useKioskShift must be used within a KioskShiftProvider');
  return v;
}

export function KioskShiftProvider({ children }: { children: React.ReactNode }) {
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [punching, setPunching] = useState<RosterMember | null>(null);
  const [flash, setFlash] = useState('');
  const now = useNow();

  const reload = useCallback(async () => {
    try {
      const d = await fetch('/api/attendance').then(r => r.json());
      if (Array.isArray(d.roster)) setRoster(d.roster);
    } catch { /* offline — keep the last roster on screen */ }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  // Keep in sync with the employer app and any second tablet.
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t); }, [reload]);

  const onShift = useMemo(() => roster.filter(m => m.openSince), [roster]);
  const offShift = useMemo(() => roster.filter(m => !m.openSince), [roster]);

  // Restore the last active person after a tablet refresh.
  useEffect(() => {
    try {
      const raw = (localStorage.getItem(LS_ACTIVE) ?? localStorage.getItem(LS_ACTIVE_OLD));
      const id = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(id)) setActiveId(id);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // The active person must always be someone who is actually clocked in.
  useEffect(() => {
    if (!hydrated || loading) return;
    if (activeId != null && onShift.some(m => m.id === activeId)) return;
    setActiveId(onShift[0]?.id ?? null);
  }, [hydrated, loading, onShift, activeId]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (activeId != null) localStorage.setItem(LS_ACTIVE, String(activeId));
      else localStorage.removeItem(LS_ACTIVE);
    } catch { /* ignore */ }
    writeActingCookie(activeId);
  }, [hydrated, activeId]);

  const active = useMemo<ActivePerson | null>(() => {
    const m = onShift.find(x => x.id === activeId);
    return m ? { id: m.id, name: m.name, avatar: m.avatar || '👤' } : null;
  }, [onShift, activeId]);

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 8000);
  }, []);

  const value: KioskShiftValue = {
    roster, onShift, offShift, loading, activeId, active,
    selectPerson: setActiveId,
    punch: setPunching,
    reload,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {flash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] px-5 py-3.5 rounded-2xl glass-strong border border-[#C8F542]/40 text-[#5B7A08] font-medium text-center shadow-lg">
          {flash}
        </div>
      )}
      {punching && (
        <PunchDialog
          member={punching}
          now={now}
          onClose={() => setPunching(null)}
          onDone={(action, member, msg) => {
            setPunching(null);
            // Whoever just arrived is the person now using the tablet.
            if (action === 'in') setActiveId(member.id);
            reload();
            if (msg) showFlash(msg);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/**
 * Everything behind the gate is only reachable once somebody is on shift, so
 * the tablet always knows whose account to record work under.
 */
export function KioskShiftGate({ children }: { children: React.ReactNode }) {
  const { loading, onShift } = useKioskShift();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="h-10 w-10 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
      </div>
    );
  }
  if (onShift.length === 0) return <LockScreen />;
  return <>{children}</>;
}

function LockScreen() {
  const { roster, punch } = useKioskShift();
  const [picking, setPicking] = useState(false);

  return (
    <div className="flex-1 flex items-start justify-center pt-10 sm:pt-16 pb-10">
      <div className="glass-card w-full max-w-3xl p-8 sm:p-10 text-center">
        {!picking ? (
          <>
            <div className="mx-auto h-20 w-20 rounded-3xl bg-[#16181A] text-[#C8F542] grid place-items-center">
              <Icon name="clock" size={38} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A] mt-6">Tablet čeká na směnu</h1>
            <p className="text-black/50 mt-3 max-w-md mx-auto leading-relaxed">
              Odemkne se, jakmile se někdo přihlásí na směnu. Všechno, co pak na tabletu uděláš,
              se zapíše pod tvoje jméno.
            </p>
            <button
              onClick={() => setPicking(true)}
              className="mt-8 inline-flex items-center gap-2.5 rounded-full bg-[#C8F542] text-black font-semibold px-8 py-4 text-lg hover:brightness-110 active:scale-[0.98] transition"
            >
              <Icon name="play" size={20} /> Jsem na směně
            </button>
            {roster.length === 0 && (
              <p className="mt-6 text-sm text-black/40">
                Zatím žádní zaměstnanci. Přidej je v aplikaci vedení (Nastavení týmu).
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-[#16181A]">Kdo přichází na směnu?</h1>
            <p className="text-black/45 mt-2">Ťukni na sebe a zaznamenej příchod.</p>
            <div className="mt-7">
              <PersonPicker
                members={roster}
                onPick={punch}
                emptyText="Zatím žádní zaměstnanci. Přidej je v aplikaci vedení (Nastavení týmu)."
              />
            </div>
            <button
              onClick={() => setPicking(false)}
              className="mt-7 rounded-full glass border border-black/10 text-[#16181A] px-6 py-3 text-sm font-medium hover:bg-black/[0.05] transition"
            >
              Zpět
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Big tap-target grid of people — used on the lock screen and for late arrivals. */
export function PersonPicker({ members, onPick, emptyText }: {
  members: RosterMember[];
  onPick: (m: RosterMember) => void;
  emptyText: string;
}) {
  if (members.length === 0) {
    return <p className="text-sm text-black/40 py-6">{emptyText}</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
      {members.map(m => (
        <button
          key={m.id}
          onClick={() => onPick(m)}
          className="glass-card p-5 text-left min-h-[112px] hover:bg-black/[0.03] active:scale-[0.98] transition"
        >
          <span className="text-4xl">{m.avatar || '👤'}</span>
          <p className="font-bold text-[#16181A] mt-3 truncate">{m.name}</p>
          {m.openSince ? (
            <p className="text-sm font-semibold text-[#5B7A08] mt-0.5">Na směně</p>
          ) : m.shiftStart ? (
            <p className="text-sm text-black/45 tabular-nums mt-0.5">Dnes {m.shiftStart}–{m.shiftEnd}</p>
          ) : (
            <p className="text-sm text-black/35 mt-0.5">Mimo směnu</p>
          )}
        </button>
      ))}
    </div>
  );
}

/** "Kdo teď pracuje" — pick the person whose account the tablet records under. */
export function WhoIsWorking() {
  const { onShift, offShift, activeId, selectPerson, punch } = useKioskShift();
  const [adding, setAdding] = useState(false);
  const now = useNow();

  return (
    <section className="glass-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/40">Kdo teď pracuje</h2>
        <button
          onClick={() => setAdding(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-full glass border border-black/10 text-[#16181A] px-4 py-2 text-sm font-medium hover:bg-black/[0.05] transition"
        >
          <Icon name="plus" size={15} /> {adding ? 'Zavřít' : 'Další příchod'}
        </button>
      </div>

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5 mt-3.5">
        {onShift.map(m => {
          const isActive = m.id === activeId;
          return (
            <div key={m.id} className="relative">
              <button
                onClick={() => selectPerson(m.id)}
                className={`w-full text-left rounded-3xl p-3.5 pr-10 sm:p-4 sm:pr-12 min-h-[112px] border transition active:scale-[0.98] ${
                  isActive
                    ? 'bg-[#C8F542]/[0.18] border-[#C8F542] ring-2 ring-[#C8F542]/35'
                    : 'glass-card hover:bg-black/[0.03]'
                }`}
              >
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <span className="text-3xl sm:text-4xl leading-none shrink-0">{m.avatar || '👤'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[#16181A] truncate">{m.name}</span>
                    <span className="block text-sm font-semibold text-[#5B7A08] tabular-nums">
                      {elapsed(m.openSince!, now)}
                    </span>
                  </span>
                </div>
                <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  isActive ? 'bg-[#16181A] text-[#C8F542]' : 'bg-black/[0.05] text-black/45'
                }`}>
                  {isActive ? <><Icon name="check" size={12} /> Zapisuje se</> : 'Přepnout'}
                </span>
              </button>
              <button
                onClick={() => punch(m)}
                title={`Odchod – ${m.name}`}
                className="absolute top-3 right-3 h-9 w-9 grid place-items-center rounded-full bg-white/70 border border-black/10 text-black/40 hover:text-red-600 hover:border-red-500/30 transition"
              >
                <Icon name="logout" size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="mt-5 pt-5 border-t border-black/[0.06]">
          <p className="text-sm text-black/45 mb-3">Kdo dále nastupuje na směnu?</p>
          <PersonPicker
            members={offShift}
            onPick={m => { setAdding(false); punch(m); }}
            emptyText="Všichni z týmu už jsou na směně."
          />
        </div>
      )}
    </section>
  );
}

/** Header chip: who the tablet is recording as, plus a one-tap switcher. */
export function ActivePersonChip() {
  const { active, onShift, selectPerson } = useKioskShift();
  const [open, setOpen] = useState(false);

  if (!active) return null;
  const canSwitch = onShift.length > 1;

  return (
    <div className="relative">
      <button
        onClick={() => canSwitch && setOpen(v => !v)}
        className={`flex items-center gap-2.5 rounded-full glass border border-[#C8F542]/45 bg-[#C8F542]/[0.14] pl-2.5 pr-4 py-2 transition ${
          canSwitch ? 'hover:bg-[#C8F542]/20' : 'cursor-default'
        }`}
      >
        <span className="text-2xl leading-none">{active.avatar}</span>
        <span className="text-left leading-tight">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">Zapisuje se jako</span>
          <span className="block font-bold text-[#16181A] text-sm truncate max-w-[9rem]">{active.name}</span>
        </span>
        {canSwitch && <Icon name="chevron" size={15} className="text-black/35" />}
      </button>

      {open && canSwitch && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl glass-strong border border-black/10 p-1.5 shadow-xl">
            {onShift.map(m => (
              <button
                key={m.id}
                onClick={() => { selectPerson(m.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 min-h-[52px] text-left transition ${
                  m.id === active.id ? 'bg-[#C8F542]/20' : 'hover:bg-black/[0.05]'
                }`}
              >
                <span className="text-2xl leading-none">{m.avatar || '👤'}</span>
                <span className="font-semibold text-[#16181A] truncate flex-1">{m.name}</span>
                {m.id === active.id && <Icon name="check" size={16} className="text-[#5B7A08]" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PunchDialog({ member, now, onClose, onDone }: {
  member: RosterMember;
  now: number;
  onClose: () => void;
  onDone: (action: 'in' | 'out', member: RosterMember, flashMsg?: string) => void;
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
          onDone('out', member, `${member.name}: odchod zaznamenán ✓ — nezapomeň vyplnit uzávěrku směny!`);
        } else {
          onDone(on ? 'out' : 'in', member);
        }
      } else {
        setErr(d.error || 'Nepodařilo se zaznamenat.');
        setPin('');
      }
    } catch { setErr('Chyba serveru.'); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div className="modal-sheet rounded-3xl w-full max-w-sm p-6 text-center max-h-[85vh] overflow-y-auto scrollbar-thin" onClick={e => e.stopPropagation()}>
        <span className="text-5xl">{member.avatar || '👤'}</span>
        <h2 className="text-xl font-bold tracking-tight text-[#16181A] mt-2">{member.name}</h2>
        <p className="text-sm text-black/50 mt-1">
          {on
            ? `Na směně od ${timeOf(member.openSince!)} · ${elapsed(member.openSince!, now)}`
            : 'Zaznamenej příchod na směnu'}
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
                <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-[#C8F542] ring-1 ring-black/15' : 'bg-black/15'}`} />
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
