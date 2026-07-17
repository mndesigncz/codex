'use client';

import { useState, useEffect, useMemo } from 'react';
import { Icon } from '../Icons';

type RosterMember = {
  id: number | string;
  name: string;
  avatar: string | null;
  hasPin: boolean;
  openSince: string | null;
};

type Entry = {
  id: number | string;
  employeeId: number | string;
  employeeName: string | null;
  employeeAvatar: string | null;
  clockIn: string;
  clockOut: string | null;
  source: 'kiosk' | 'self' | string;
};

const PERIODS = [7, 30, 90] as const;

// Format milliseconds as "H:MM:SS" for the live on-shift timers.
function hms(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Format milliseconds as "12 h 34 min" for the summary.
function humanDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

// Format milliseconds as "H:MM" for CSV export.
function hMM(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

export default function Attendance({ user: _user }: { user: { id?: string | number } }) {
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [deleting, setDeleting] = useState<Entry['id'] | null>(null);

  const load = async (d: number) => {
    setLoading(true);
    try {
      const data = await fetch(`/api/attendance?days=${d}`).then(r => r.json());
      setRoster(Array.isArray(data.roster) ? data.roster : []);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(days); }, [days]);

  // Tick every second so live timers advance.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const onShift = roster.filter(r => r.openSince);

  // Total worked time per employee. Open (still-on-shift) entries are counted
  // up to `now` so the summary keeps ticking with the live shift.
  const summary = useMemo(() => {
    const map = new Map<string, { name: string; avatar: string | null; ms: number; count: number; hasOpen: boolean }>();
    for (const e of entries) {
      const key = String(e.employeeId);
      const start = new Date(e.clockIn).getTime();
      const open = !e.clockOut;
      const end = open ? now : new Date(e.clockOut as string).getTime();
      const prev = map.get(key) ?? { name: e.employeeName ?? 'Neznámý', avatar: e.employeeAvatar ?? null, ms: 0, count: 0, hasOpen: false };
      prev.ms += Math.max(0, end - start);
      prev.count += 1;
      prev.hasOpen = prev.hasOpen || open;
      if (!prev.avatar && e.employeeAvatar) prev.avatar = e.employeeAvatar;
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.ms - a.ms);
  }, [entries, now]);

  // Group entries by calendar day (newest first — API already sorts DESC).
  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const d = new Date(e.clockIn);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key);
      if (arr) arr.push(e);
      else map.set(key, [e]);
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      label: new Date(list[0].clockIn).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }),
      list,
    }));
  }, [entries]);

  const remove = async (e: Entry) => {
    if (!confirm(`Smazat záznam ${e.employeeName ?? ''} z ${new Date(e.clockIn).toLocaleDateString('cs-CZ')}?`)) return;
    setDeleting(e.id);
    const prev = entries;
    setEntries(list => list.filter(x => x.id !== e.id));
    try {
      const res = await fetch(`/api/attendance?id=${e.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch { setEntries(prev); }
    setDeleting(null);
  };

  const exportCsv = () => {
    const head = ['Datum', 'Zaměstnanec', 'Příchod', 'Odchod', 'Odpracováno', 'Zdroj'];
    const rows = entries.map(e => {
      const start = new Date(e.clockIn).getTime();
      const end = e.clockOut ? new Date(e.clockOut).getTime() : now;
      return [
        new Date(e.clockIn).toLocaleDateString('cs-CZ'),
        e.employeeName ?? 'Neznámý',
        fmtTime(e.clockIn),
        e.clockOut ? fmtTime(e.clockOut) : '',
        hMM(end - start),
        e.source === 'kiosk' ? 'kiosk' : 'ručně',
      ];
    });
    const csv = [head, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dochazka-${days}dni.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const avatar = (av: string | null, size = 'h-10 w-10 text-lg') => (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60`}>{av || '👤'}</span>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header + period selector */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon name="clock" size={22} className="text-[#16181A] shrink-0" />
          <h2 className="text-xl font-bold tracking-tight text-[#16181A] truncate">Docházka</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex gap-1 rounded-full glass border border-black/[0.07] p-1">
            {PERIODS.map(p => (
              <button key={p} onClick={() => setDays(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${days === p ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'}`}>
                {p} dní
              </button>
            ))}
          </div>
          {entries.length > 0 && (
            <button onClick={exportCsv}
              className="rounded-full glass border border-black/10 text-[#16181A] px-4 py-2 text-sm font-medium hover:bg-black/[0.05] transition whitespace-nowrap">
              Export CSV ↓
            </button>
          )}
        </div>
      </div>

      {/* Právě na směně */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="users" size={18} className="text-[#5B7A08]" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-black/55">Právě na směně</h3>
        </div>
        {onShift.length === 0 ? (
          <p className="text-sm text-black/40">Nikdo právě není na směně.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {onShift.map(r => (
              <div key={r.id} className="flex items-center gap-3 min-w-0 rounded-2xl bg-[#C8F542]/[0.12] border border-[#C8F542]/40 px-4 py-3">
                {avatar(r.avatar)}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#16181A] truncate">{r.name}</p>
                  <p className="text-xs text-[#5B7A08]">od {fmtTime(r.openSince as string)}</p>
                </div>
                <span className="shrink-0 whitespace-nowrap tabular-nums font-bold text-[#16181A] text-lg">
                  {hms(now - new Date(r.openSince as string).getTime())}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : (
        <>
          {/* Souhrn hodin */}
          {summary.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold tracking-tight text-[#16181A]">Souhrn hodin</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {summary.map(s => (
                  <div key={s.name} className="glass-card p-4 flex items-center gap-3 min-w-0">
                    {avatar(s.avatar)}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#16181A] truncate">{s.name}</p>
                      <p className="text-xs text-black/45 truncate">
                        {s.count} {s.count === 1 ? 'směna' : s.count >= 2 && s.count <= 4 ? 'směny' : 'směn'}
                        {s.hasOpen && <span className="text-[#5B7A08]"> · právě běží</span>}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap tabular-nums font-bold text-[#16181A]">{humanDuration(s.ms)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seznam záznamů */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold tracking-tight text-[#16181A]">Záznamy ({entries.length})</h3>
            {entries.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <p className="text-black/45">Za zvolené období nejsou žádné záznamy docházky.</p>
              </div>
            ) : (
              grouped.map(g => (
                <div key={g.key} className="space-y-2">
                  <div className="flex items-center gap-2 px-1 pt-1">
                    <Icon name="calendar" size={14} className="text-black/35 shrink-0" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-black/45 capitalize truncate">{g.label}</p>
                  </div>
                  <div className="glass-card divide-y divide-black/[0.06] overflow-hidden">
                    {g.list.map(e => {
                      const open = !e.clockOut;
                      const start = new Date(e.clockIn).getTime();
                      const end = open ? now : new Date(e.clockOut as string).getTime();
                      return (
                        <div key={e.id} className="flex items-center gap-3 flex-wrap p-3 sm:p-4">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {avatar(e.employeeAvatar, 'h-9 w-9 text-base')}
                            <div className="min-w-0">
                              <p className="font-semibold text-[#16181A] truncate">{e.employeeName ?? 'Neznámý'}</p>
                              <p className="text-xs text-black/45 tabular-nums whitespace-nowrap">
                                {fmtTime(e.clockIn)} – {open ? '…' : fmtTime(e.clockOut as string)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-auto">
                            <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${e.source === 'kiosk' ? 'bg-black/[0.05] text-black/55' : 'bg-[#C8F542]/20 text-[#5B7A08]'}`}>
                              {e.source === 'kiosk' ? 'kiosk' : 'ručně'}
                            </span>
                            <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${open ? 'text-[#5B7A08]' : 'text-[#16181A]'}`}>
                              {open ? hms(end - start) : humanDuration(end - start)}
                            </span>
                            <button onClick={() => remove(e)} disabled={deleting === e.id}
                              aria-label="Smazat záznam"
                              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full text-black/35 hover:text-red-600 hover:bg-red-500/[0.08] transition-colors disabled:opacity-40">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
