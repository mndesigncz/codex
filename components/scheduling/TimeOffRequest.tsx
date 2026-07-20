'use client';

import { useCallback, useEffect, useState } from 'react';

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

const TYPE_OPTIONS: { id: TimeOffType; label: string }[] = [
  { id: 'vacation', label: 'Dovolená' },
  { id: 'sick', label: 'Nemoc' },
  { id: 'other', label: 'Jiné' },
];

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

const inputCls =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm appearance-none min-w-0 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-colors';

export default function TimeOffRequest() {
  const [requests, setRequests] = useState<TimeOffRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [type, setType] = useState<TimeOffType>('vacation');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/timeoff');
      if (!res.ok) return;
      const data = await res.json();
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setError(null);
    if (!fromDate || !toDate) {
      setError('Vyplň datum od i do.');
      return;
    }
    if (fromDate > toDate) {
      setError('Datum „Od" nesmí být později než datum „Do".');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/timeoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate, type, note: note.trim() || null }),
      });
      if (!res.ok) {
        setError('Žádost se nepodařilo odeslat. Zkus to prosím znovu.');
        return;
      }
      setFromDate('');
      setToDate('');
      setType('vacation');
      setNote('');
      await load();
    } catch {
      setError('Žádost se nepodařilo odeslat. Zkus to prosím znovu.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (id: number) => {
    const prev = requests;
    setRequests((rs) => rs.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/timeoff?id=${id}`, { method: 'DELETE' });
      if (!res.ok) setRequests(prev);
    } catch {
      setRequests(prev);
    }
  };

  return (
    <div className="glass-card p-6 space-y-4">
      <div>
        <h2 className="font-bold tracking-tight text-[#16181A]">🏖️ Dovolená a volno</h2>
        <p className="text-sm text-black/45 mt-0.5">
          Požádej o volno — vedoucí dostane notifikaci a žádost schválí.
        </p>
      </div>

      {/* Form */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block text-sm font-medium text-black/70 mb-1.5">Od</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={inputCls}
              style={{ WebkitAppearance: 'none' }}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-medium text-black/70 mb-1.5">Do</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={inputCls}
              style={{ WebkitAppearance: 'none' }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                type === t.id
                  ? 'bg-[#16181A] text-white'
                  : 'bg-black/[0.04] border border-black/[0.08] text-black/60 hover:bg-black/[0.07]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Poznámka (nepovinné)"
          className={inputCls}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-105 transition disabled:opacity-50"
        >
          {submitting ? 'Odesílám…' : 'Odeslat žádost'}
        </button>
      </div>

      {/* My requests */}
      <div className="space-y-2 pt-2 border-t border-black/[0.06]">
        <h3 className="text-sm font-semibold text-[#16181A]">Moje žádosti</h3>
        {loading ? (
          <p className="text-sm text-black/40">Načítám…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-black/40">Zatím žádné žádosti.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-black/[0.03] px-4 py-3"
              >
                <span className="text-sm font-medium text-[#16181A] tabular-nums">
                  {formatRange(r.fromDate, r.toDate)}
                </span>
                <span className="text-xs text-black/45">{TYPE_LABELS[r.type]}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_META[r.status].cls}`}
                >
                  {STATUS_META[r.status].label}
                </span>
                {r.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => cancelRequest(r.id)}
                    className="ml-auto rounded-full bg-black/[0.05] border border-black/10 text-black/60 text-xs px-3 py-1.5 whitespace-nowrap hover:bg-black/[0.08] transition"
                  >
                    Zrušit
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
