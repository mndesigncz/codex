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
  active: ActiveRun | null;
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
        if (!cancelled && data.active) setActive(data.active as ActiveRun);
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

  const persist = useCallback((runId: number, checkedItems: number[], skippedItems: number[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/procedures/runs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, checkedItems, skippedItems }),
      }).catch(() => { /* best-effort */ });
    }, 350);
  }, []);

  const startRun = useCallback(async (procedure: ProcedureLite) => {
    setStarting(true);
    try {
      const res = await fetch('/api/procedures/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procedureId: procedure.id }),
      });
      const data = await res.json();
      if (res.ok && data.active) {
        setJustCompleted(null);
        setActive(data.active as ActiveRun);
      }
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
      persist(prev.id, checkedItems, skippedItems);
      return { ...prev, checkedItems, skippedItems };
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
      persist(prev.id, checkedItems, skippedItems);
      return { ...prev, checkedItems, skippedItems };
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
        body: JSON.stringify({ runId: snapshot.id, checkedItems: snapshot.checkedItems, skippedItems: snapshot.skippedItems, complete: true }),
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
    <Ctx.Provider value={{ active, justCompleted, starting, startRun, toggleItem, toggleSkip, complete, cancel, dismissCelebration }}>
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
