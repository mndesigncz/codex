'use client';

import { useEffect, useState } from 'react';

type TimeOffType = 'vacation' | 'sick' | 'other';
type TimeOffStatus = 'pending' | 'approved' | 'rejected';

interface TimeOffRequestItem {
  id: number;
  employeeId: string;
  fromDate: string;
  toDate: string;
  type: TimeOffType;
  note: string | null;
  status: TimeOffStatus;
  createdAt: string;
  employeeName?: string | null;
  employeeAvatar?: string | null;
}

const TYPE_LABELS: Record<TimeOffType, string> = {
  vacation: 'Dovolená',
  sick: 'Nemoc',
  other: 'Jiné',
};

const STATUS_META: Record<TimeOffStatus, { label: string; cls: string }> = {
  pending: { label: 'Čeká', cls: 'bg-black/[0.05] text-black/55' },
  approved: { label: 'Schváleno', cls: 'bg-[#C8F542]/15 text-[#5B7A08]' },
  rejected: { label: 'Zamítnuto', cls: 'bg-red-500/15 text-red-600' },
};

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatFull(d: Date): string {
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function formatRange(fromDate: string, toDate: string): string {
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  if (fromDate === toDate) return formatFull(from);
  if (from.getFullYear() === to.getFullYear()) {
    const fromShort = from.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
    return `${fromShort} – ${formatFull(to)}`;
  }
  return `${formatFull(from)} – ${formatFull(to)}`;
}

export default function TimeOffApprovals() {
  const [requests, setRequests] = useState<TimeOffRequestItem[]>([]);
  const [isEmployer, setIsEmployer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/timeoff')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setRequests(Array.isArray(data.requests) ? data.requests : []);
        setIsEmployer(Boolean(data.isEmployer));
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const decide = async (id: number, status: 'approved' | 'rejected') => {
    const prev = requests;
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      const res = await fetch('/api/timeoff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) setRequests(prev);
    } catch {
      setRequests(prev);
    }
  };

  // Edit dates / cancel — an approved holiday must stay fixable without
  // forcing the person to cancel and re-request.
  const [editId, setEditId] = useState<number | null>(null);
  const [editFrom, setEditFrom] = useState('');
  const [editTo, setEditTo] = useState('');
  const startEdit = (r: any) => { setEditId(r.id); setEditFrom(r.fromDate); setEditTo(r.toDate); };
  const saveEdit = async () => {
    if (editId == null) return;
    const res = await fetch('/api/timeoff', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, fromDate: editFrom, toDate: editTo }),
    }).catch(() => null);
    if (res?.ok) {
      setRequests(rs => rs.map(r => r.id === editId ? { ...r, fromDate: editFrom, toDate: editTo } : r));
      setEditId(null);
    }
  };
  const cancel = async (r: any) => {
    if (!confirm(`Zrušit volno ${r.employeeName ?? ''} (${formatRange(r.fromDate, r.toDate)})? Dotyčný dostane notifikaci.`)) return;
    setRequests(rs => rs.filter(x => x.id !== r.id));
    try { await fetch(`/api/timeoff?id=${r.id}`, { method: 'DELETE' }); } catch { /* optimistic */ }
  };

  if (loading || !isEmployer) return null;

  const pending = requests.filter((r) => r.status === 'pending');
  const resolved = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-bold tracking-tight text-[#16181A]">🏖️ Žádosti o volno</h2>
        {pending.length > 0 && (
          <span className="rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-2.5 py-0.5 text-xs font-semibold tabular-nums">
            {pending.length}
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-black/40">Žádné žádosti o volno.</p>
      ) : (
        <>
          {pending.length === 0 ? (
            <p className="text-sm text-black/40">Žádné čekající žádosti.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-black/[0.03] px-4 py-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-9 w-9 shrink-0 rounded-full bg-[#C8F542]/25 flex items-center justify-center text-base">
                      {r.employeeAvatar || '🙂'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#16181A] truncate">
                        {r.employeeName || 'Zaměstnanec'}
                      </p>
                      <p className="text-xs text-black/45">
                        <span className="tabular-nums">{formatRange(r.fromDate, r.toDate)}</span>
                        {' · '}
                        {TYPE_LABELS[r.type]}
                        {r.note ? ` · ${r.note}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => decide(r.id, 'approved')}
                      className="rounded-full bg-[#C8F542] text-black text-sm font-semibold px-4 py-2 whitespace-nowrap hover:brightness-105 transition"
                    >
                      Schválit
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(r.id, 'rejected')}
                      className="rounded-full bg-black/[0.05] border border-black/10 text-red-600 text-sm px-4 py-2 whitespace-nowrap hover:bg-black/[0.08] transition"
                    >
                      Zamítnout
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {(() => {
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
            const upcoming = requests.filter(r => r.status === 'approved' && r.toDate >= today)
              .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
            if (!upcoming.length) return null;
            return (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-black/45">Schválené dovolené</p>
                <ul className="space-y-2">
                  {upcoming.map(r => (
                    <li key={r.id} className="rounded-2xl bg-[#C8F542]/[0.08] border border-[#C8F542]/25 px-4 py-3">
                      {editId === r.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#16181A]">{r.employeeName}</span>
                          <input type="date" value={editFrom} onChange={e => setEditFrom(e.target.value)}
                            className="rounded-xl bg-white/70 border border-black/10 px-3 py-1.5 text-sm" />
                          <span className="text-black/40">–</span>
                          <input type="date" value={editTo} onChange={e => setEditTo(e.target.value)}
                            className="rounded-xl bg-white/70 border border-black/10 px-3 py-1.5 text-sm" />
                          <button onClick={saveEdit}
                            className="rounded-full bg-[#16181A] text-white text-xs font-bold px-3.5 py-2 hover:bg-black transition">Uložit</button>
                          <button onClick={() => setEditId(null)}
                            className="rounded-full bg-black/[0.05] text-black/60 text-xs font-semibold px-3.5 py-2">Zrušit</button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="h-8 w-8 shrink-0 rounded-full bg-white/70 ring-1 ring-black/10 flex items-center justify-center text-sm">{r.employeeAvatar || '🙂'}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[#16181A] truncate">{r.employeeName}</p>
                            <p className="text-xs text-black/45 tabular-nums">{formatRange(r.fromDate, r.toDate)} · {TYPE_LABELS[r.type]}</p>
                          </div>
                          <button onClick={() => startEdit(r)}
                            className="rounded-full glass border border-black/10 text-[#16181A] text-xs font-semibold px-3.5 py-2 hover:bg-black/[0.05] transition">✎ Upravit</button>
                          <button onClick={() => cancel(r)}
                            className="rounded-full text-red-600 text-xs font-semibold px-3.5 py-2 hover:bg-red-500/[0.08] transition">Zrušit volno</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {resolved.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowHistory((s) => !s)}
                className="text-sm text-black/50 hover:text-black/70 transition font-medium"
              >
                {showHistory ? 'Skrýt vyřízené' : `Zobrazit vyřízené (${resolved.length})`}
              </button>
              {showHistory && (
                <ul className="space-y-2">
                  {resolved.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-black/[0.02] px-4 py-2.5"
                    >
                      <span className="text-sm font-medium text-[#16181A] truncate min-w-0">
                        {r.employeeName || 'Zaměstnanec'}
                      </span>
                      <span className="text-xs text-black/45 tabular-nums">
                        {formatRange(r.fromDate, r.toDate)}
                      </span>
                      <span className="text-xs text-black/45">{TYPE_LABELS[r.type]}</span>
                      <span
                        className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_META[r.status].cls}`}
                      >
                        {STATUS_META[r.status].label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
