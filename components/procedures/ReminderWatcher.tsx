'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { useProcedures, type ProcedureLite } from './ProcedureProvider';

const FIRED_KEY = 'pangea-proc-fired';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Local YYYY-MM-DD (not UTC) so the fired-key rolls over at local midnight.
function localDateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// JS getDay() is 0=Sun..6=Sat; our remind_days use 0=Mon..6=Sun.
function mondayIndex(d: Date) {
  return (d.getDay() + 6) % 7;
}

function readFired(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function markFired(key: string) {
  try {
    const map = readFired();
    map[key] = true;
    // Prune keys from previous days so the map doesn't grow forever.
    const today = localDateKey(new Date());
    for (const k of Object.keys(map)) {
      if (!k.endsWith(today)) delete map[k];
    }
    map[key] = true;
    localStorage.setItem(FIRED_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Watches the team's procedures and, when one hits its scheduled remind_at on a
 * matching weekday, surfaces a floating prompt AND fires a push notification.
 * Mounted inside ProcedureProvider — never rendered on its own.
 */
export default function ReminderWatcher() {
  const { active, startRun, starting } = useProcedures();
  const proceduresRef = useRef<ProcedureLite[]>([]);
  const hasShiftTodayRef = useRef(false);
  const openingRef = useRef<{ open: string; close: string; closed: boolean }>({ open: '08:00', close: '20:00', closed: false });
  const [due, setDue] = useState<ProcedureLite | null>(null);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  // Load the team's procedures (with reminder config), whether the current user
  // works today, and today's opening hours. Kept fresh.
  const loadProcedures = useCallback(async () => {
    try {
      const res = await fetch('/api/procedures');
      if (!res.ok) return;
      const data = await res.json();
      proceduresRef.current = Array.isArray(data.procedures) ? data.procedures : [];
      hasShiftTodayRef.current = !!data.hasShiftToday;
      if (data.openingToday) openingRef.current = data.openingToday;
    } catch {
      /* offline — ignore */
    }
  }, []);

  // A procedure's effective reminder time today: fixed, or the day's open/close.
  const effectiveTime = (p: ProcedureLite): string | null => {
    const oh = openingRef.current;
    if (p.remindAnchor === 'open') return oh.closed ? null : oh.open;
    if (p.remindAnchor === 'close') return oh.closed ? null : oh.close;
    return p.remindAt ?? null;
  };

  const fireRemind = useCallback((procedureId: number) => {
    fetch('/api/procedures/remind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ procedureId }),
    }).catch(() => { /* best-effort — the in-app prompt still shows */ });
  }, []);

  const check = useCallback(() => {
    // Never interrupt a run in progress.
    if (activeRef.current) return;
    // Only nudge people who actually work today (kiosk always does).
    if (!hasShiftTodayRef.current) return;

    const now = new Date();
    const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const weekday = mondayIndex(now);
    const dateKey = localDateKey(now);
    const fired = readFired();

    for (const p of proceduresRef.current) {
      const eff = effectiveTime(p);
      if (!eff || eff !== hhmm) continue;
      const days = p.remindDays;
      if (Array.isArray(days) && days.length > 0 && !days.includes(weekday)) continue;

      const key = `${p.id}-${dateKey}`;
      if (fired[key]) continue;

      // Fire once for this occurrence: mark before showing so a re-tick within
      // the same minute (or a dismiss) never re-fires today.
      markFired(key);
      fireRemind(p.id);
      setDueTime(eff);
      setDue(p);
      return; // one prompt at a time
    }
  }, [fireRemind]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadProcedures();
      if (!cancelled) check();
    })();

    const tick = setInterval(check, 30_000);
    const refresh = setInterval(loadProcedures, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [loadProcedures, check]);

  // If a run starts (this or another procedure), drop the prompt.
  useEffect(() => {
    if (active) setDue(null);
  }, [active]);

  if (!due || active) return null;

  const startNow = () => {
    const p = due;
    setDue(null);
    startRun(p);
  };

  return (
    <div className="fixed z-50 bottom-3 inset-x-3 md:inset-x-0 md:bottom-6 md:flex md:justify-center pointer-events-none">
      <div className="mx-auto w-full md:max-w-sm pointer-events-auto glass-strong rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.28)] motion-safe:animate-[pr-remind-pop_0.3s_ease-out]">
        <style>{`
          @keyframes pr-remind-pop { 0% { opacity:0; transform: translateY(10px) scale(0.98); } 100% { opacity:1; transform: translateY(0) scale(1); } }
        `}</style>
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[#C8F542] text-black motion-safe:animate-[pr-remind-pop_0.4s_ease-out]">
            <Icon name="bell" size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#5B7A08]">Připomínka</p>
            <p className="mt-0.5 text-lg font-bold leading-snug tracking-tight text-[#16181A]">
              Je čas na {due.name}!
            </p>
            {dueTime && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-black/45">
                <Icon name="clock" size={13} /> {dueTime}
                {due.remindAnchor === 'open' ? ' · otevření' : due.remindAnchor === 'close' ? ' · zavření' : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            onClick={() => setDue(null)}
            className="rounded-full glass border border-black/10 text-[#16181A] px-5 py-2.5 font-medium hover:bg-black/[0.05] transition"
          >
            Odložit
          </button>
          <button
            onClick={startNow}
            disabled={starting}
            className="flex-1 rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 hover:brightness-110 transition disabled:opacity-60"
          >
            Spustit teď
          </button>
        </div>
      </div>
    </div>
  );
}
