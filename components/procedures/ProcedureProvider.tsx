'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import ReminderWatcher from './ReminderWatcher';

export interface ActiveRun {
  id: number;
  procedureId: number;
  name: string;
  icon: string;
  color: string;
  items: any[];
  checkedItems: number[];
  skippedItems: number[];
  /** index → why it was skipped (drives automatic points). */
  skipReasons: Record<string, { reason: string; note?: string }>;
  totalItems: number;
  startedAt: string;
  status: string;
}

export interface ProcedureLite {
  id: number;
  name: string;
  description?: string | null;
  icon?: string;
  color?: string;
  items: any[];
  remindAt?: string | null;
  remindDays?: number[] | null;
  remindAnchor?: string | null;
}

export interface Celebration {
  name: string;
  duration: number; // seconds
  total: number;
  done: number;
  skipped: number;
}

interface ProcedureCtx {
  /** Record why a step was skipped; empty reason removes the record. */
  setSkipReason: (index: number, reason: string, note?: string) => void;
  active: ActiveRun | null;
  /** True when a tick didn't reach the server. The run is still safe locally,
   *  but the employer wouldn't see it — so the runner has to say so. */
  syncFailed: boolean;
  justCompleted: Celebration | null;
  starting: boolean;
  startRun: (procedure: ProcedureLite) => Promise<void>;
  toggleItem: (index: number) => void;
  toggleSkip: (index: number) => void;
  complete: () => Promise<void>;
  cancel: () => void;
  dismissCelebration: () => void;
}

const Ctx = createContext<ProcedureCtx | null>(null);

const LS_KEY = 'pangea-active-run';

export function ProcedureProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveRun | null>(null);
  const [justCompleted, setJustCompleted] = useState<Celebration | null>(null);
  const [starting, setStarting] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  // Debounce PATCH progress writes so rapid taps don't spam the server.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate on mount: trust the server's running run; localStorage only gates the fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/procedures/runs?active=1');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.active) setActive({ skipReasons: {}, ...(data.active as any) } as ActiveRun);
      } catch {
        /* offline — ignore */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Mirror the active run id into localStorage so a refresh knows to restore.
  useEffect(() => {
    try {
      if (active) localStorage.setItem(LS_KEY, String(active.id));
      else localStorage.removeItem(LS_KEY);
    } catch { /* ignore */ }
  }, [active]);

  const persist = useCallback((runId: number, checkedItems: number[], skippedItems: number[], skipReasons?: Record<string, { reason: string; note?: string }>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/procedures/runs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, checkedItems, skippedItems, skipReasons }),
        });
        // A whole opening procedure can be ticked off without a single write
        // landing; the person doing it has to find out before they walk away.
        setSyncFailed(!res.ok);
      } catch {
        setSyncFailed(true);
      }
    }, 350);
  }, []);

  const startRun = useCallback(async (procedure: ProcedureLite) => {
    setStarting(true);
    setSyncFailed(false);
    try {
      const res = await fetch('/api/procedures/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procedureId: procedure.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.active) {
        setJustCompleted(null);
        setActive({ skipReasons: {}, ...(data.active as any) } as ActiveRun);
      } else {
        // Nothing opened — without this the button looks simply dead.
        setSyncFailed(true);
      }
    } catch {
      setSyncFailed(true);
    } finally {
      setStarting(false);
    }
  }, []);

  const toggleItem = useCallback((index: number) => {
    setActive(prev => {
      if (!prev) return prev;
      const has = prev.checkedItems.includes(index);
      const checkedItems = has
        ? prev.checkedItems.filter(i => i !== index)
        : [...prev.checkedItems, index].sort((a, b) => a - b);
      // Marking a step done clears any "skipped" flag on it.
      const skippedItems = has ? prev.skippedItems : prev.skippedItems.filter(i => i !== index);
      const skipReasons = { ...prev.skipReasons };
      if (!has) delete skipReasons[String(index)];
      persist(prev.id, checkedItems, skippedItems, skipReasons);
      return { ...prev, checkedItems, skippedItems, skipReasons };
    });
  }, [persist]);

  // Skip a step the person couldn't do right now — tracked, but doesn't block finishing.
  const toggleSkip = useCallback((index: number) => {
    setActive(prev => {
      if (!prev) return prev;
      const has = prev.skippedItems.includes(index);
      const skippedItems = has
        ? prev.skippedItems.filter(i => i !== index)
        : [...prev.skippedItems, index].sort((a, b) => a - b);
      // Skipping a step clears any "done" flag on it.
      const checkedItems = has ? prev.checkedItems : prev.checkedItems.filter(i => i !== index);
      const skipReasons = { ...prev.skipReasons };
      if (has) delete skipReasons[String(index)];
      persist(prev.id, checkedItems, skippedItems, skipReasons);
      return { ...prev, checkedItems, skippedItems, skipReasons };
    });
  }, [persist]);

  const setSkipReason = useCallback((index: number, reason: string, note?: string) => {
    setActive(prev => {
      if (!prev) return prev;
      const skipReasons = { ...prev.skipReasons };
      if (reason) skipReasons[String(index)] = note ? { reason, note } : { reason };
      else delete skipReasons[String(index)];
      persist(prev.id, prev.checkedItems, prev.skippedItems, skipReasons);
      return { ...prev, skipReasons };
    });
  }, [persist]);

  const complete = useCallback(async () => {
    if (!active) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const snapshot = active;
    const celebrate = (duration: number) => setJustCompleted({
      name: snapshot.name,
      duration,
      total: snapshot.totalItems,
      done: snapshot.checkedItems.length,
      skipped: snapshot.skippedItems.length,
    });
    try {
      const res = await fetch('/api/procedures/runs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: snapshot.id, checkedItems: snapshot.checkedItems, skippedItems: snapshot.skippedItems, skipReasons: snapshot.skipReasons, complete: true }),
      });
      const data = await res.json();
      const duration = res.ok && data.run?.duration_seconds != null
        ? data.run.duration_seconds
        : Math.max(0, Math.round((Date.now() - new Date(snapshot.startedAt).getTime()) / 1000));
      celebrate(duration);
      setActive(null);
    } catch {
      celebrate(Math.max(0, Math.round((Date.now() - new Date(snapshot.startedAt).getTime()) / 1000)));
      setActive(null);
    }
  }, [active]);

  const cancel = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setActive(prev => {
      if (prev) {
        fetch('/api/procedures/runs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: prev.id, cancel: true }),
        }).catch(() => { /* best-effort */ });
      }
      return null;
    });
  }, []);

  const dismissCelebration = useCallback(() => setJustCompleted(null), []);

  return (
    <Ctx.Provider value={{ active, justCompleted, starting, syncFailed, startRun, toggleItem, toggleSkip, complete, cancel, dismissCelebration , setSkipReason }}>
      {children}
      <ReminderWatcher />
    </Ctx.Provider>
  );
}

export function useProcedures(): ProcedureCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProcedures must be used within a ProcedureProvider');
  return ctx;
}
