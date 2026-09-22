'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../Icons';
import { Button, PageHeader, Segmented, Modal, SearchField } from '../ui';
import { PersonLink } from './ProfileLinkProvider';
import { useMoney, useSymbol, useCurrency } from '../CurrencyProvider';
import { usePlan, UpgradeModal } from '../Pro';
import { parseDbTime, dbTimeHM } from '@/lib/pragueTime';
import { useModal } from '@/lib/useModal';
import { earnedFor } from '@/lib/wages';
import { okJson } from '@/lib/api';
import { obsahuje, obsahujeNekde } from '@/lib/hledani';

type RosterMember = {
  id: number | string;
  name: string;
  avatar: string | null;
  hasPin: boolean;
  openSince: string | null;
  hourlyRate: number | null;
};

type Closing = {
  date: string; // 'YYYY-MM-DD'
  cash_revenue: number;
  card_revenue: number;
};

type Entry = {
  id: number | string;
  employeeId: number | string;
  employeeName: string | null;
  employeeAvatar: string | null;
  clockIn: string;
  clockOut: string | null;
  source: 'kiosk' | 'self' | string;
  note?: string | null;
};

// ISO → 'YYYY-MM-DDTHH:MM' for a datetime-local input (in local time).
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = parseDbTime(iso);
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

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

// Hrubá mzda za jeden záznam. Sdílená s Financemi i s Uzávěrkami, aby
// tatáž docházka nedávala tři různé měsíční součty (viz lib/wages).
const earned = earnedFor;

function fmtTime(iso: string): string {
  return dbTimeHM(iso);
}

export default function Attendance({ user: _user }: { user: { id?: string | number } }) {
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  // Patnáct lidí krát devadesát dní je přes tisíc řádků v jednom stromu
  // a jediné filtrování bylo 7/30/90 dní. Hledání zúží na jednoho člověka.
  const [q, setQ] = useState('');
  // Souhrn se řadil vždycky podle odpracovaných hodin. Mzda je přitom na
  // kartě taky a „kdo mě stojí nejvíc" byla otázka, na kterou obrazovka
  // odpověď měla, ale nešlo se k ní dostat.
  const [sumSort, setSumSort] = useState<'hours' | 'name' | 'cost'>('hours');
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [deleting, setDeleting] = useState<Entry['id'] | null>(null);
  const [closings, setClosings] = useState<Closing[]>([]);
  const money = useMoney();
  const { pro } = usePlan();
  const [upgradeFor, setUpgradeFor] = useState<string | null>(null);
  const symbol = useSymbol();
  const { laborTargetPct } = useCurrency();
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  // Manual entry — someone forgot to punch entirely.
  const [addOpen, setAddOpen] = useState(false);
  const [addEmp, setAddEmp] = useState<number | ''>('');
  const [addIn, setAddIn] = useState('');
  const [addOut, setAddOut] = useState('');
  const [addErr, setAddErr] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);
  const saveAdd = async () => {
    if (addEmp === '' || !addIn || !addOut) { setAddErr('Vyplň zaměstnance i oba časy.'); return; }
    setSavingAdd(true); setAddErr('');
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: addEmp,
          clockIn: new Date(addIn).toISOString(),
          clockOut: new Date(addOut).toISOString(),
        }),
      });
      const d = await res.json();
      if (res.ok) { setAddOpen(false); setAddEmp(''); setAddIn(''); setAddOut(''); await load(days); }
      else setAddErr(d.error || 'Nepodařilo se uložit.');
    } catch { setAddErr('Chyba serveru.'); }
    setSavingAdd(false);
  };
  const [editErr, setEditErr] = useState('');

  const openEdit = (e: Entry) => {
    setEditEntry(e); setEditErr('');
    setEditIn(toLocalInput(e.clockIn));
    setEditOut(toLocalInput(e.clockOut));
  };
  const saveEdit = async () => {
    if (!editEntry) return;
    setSavingEdit(true); setEditErr('');
    try {
      const res = await fetch('/api/attendance', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editEntry.id,
          clockIn: editIn ? new Date(editIn).toISOString() : undefined,
          clockOut: editOut ? new Date(editOut).toISOString() : null,
        }),
      });
      const d = await res.json();
      if (res.ok && d.entry) {
        setEntries(list => list.map(x => x.id === editEntry.id ? { ...x, clockIn: d.entry.clockIn, clockOut: d.entry.clockOut } : x));
        if (d.entry.clockOut) {
          setRoster(rs => rs.map(r => String(r.id) === String(editEntry.employeeId) ? { ...r, openSince: null } : r));
        }
        setEditEntry(null);
      } else setEditErr(d.error || 'Nepodařilo se uložit.');
    } catch { setEditErr('Chyba serveru.'); }
    setSavingEdit(false);
  };

  // Fast 7/30/90 toggles overlap requests; only the newest may paint.
  const reqRef = useRef(0);
  const load = async (d: number) => {
    const req = ++reqRef.current;
    setLoading(true);
    try {
      const data = await fetch(`/api/attendance?days=${d}`).then(okJson);
      if (req !== reqRef.current) return;
      setRoster(Array.isArray(data.roster) ? data.roster : []);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch { /* ignore */ }
    if (req === reqRef.current) setLoading(false);
  };

  useEffect(() => { load(days); }, [days]);

  // Revenue for the "Podíl na tržbách" tile — refetch when the period changes.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/closings')
      .then(okJson)
      .then(d => { if (!cancelled) setClosings(Array.isArray(d.closings) ? d.closings : []); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [days]);

  // Tick every second so live timers advance.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const onShift = roster.filter(r => r.openSince);

  // employeeId -> hourly rate (Kč/h); 0/null means no wage is shown.
  const rateById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of roster) {
      if (typeof r.hourlyRate === 'number' && r.hourlyRate > 0) map.set(String(r.id), r.hourlyRate);
    }
    return map;
  }, [roster]);

  // Total worked time per employee. Open (still-on-shift) entries are counted
  // up to `now` so the summary keeps ticking with the live shift.
  const summary = useMemo(() => {
    const map = new Map<string, { id: string; name: string; avatar: string | null; ms: number; count: number; hasOpen: boolean }>();
    for (const e of entries) {
      const key = String(e.employeeId);
      const start = parseDbTime(e.clockIn)?.getTime() ?? NaN;
      const open = !e.clockOut;
      const end = open ? now : (parseDbTime(e.clockOut)?.getTime() ?? NaN);
      const prev = map.get(key) ?? { id: key, name: e.employeeName ?? 'Neznámý', avatar: e.employeeAvatar ?? null, ms: 0, count: 0, hasOpen: false };
      prev.ms += Math.max(0, end - start);
      prev.count += 1;
      prev.hasOpen = prev.hasOpen || open;
      if (!prev.avatar && e.employeeAvatar) prev.avatar = e.employeeAvatar;
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.ms - a.ms);
  }, [entries, now]);

  const summarySorted = useMemo(() => {
    const list = [...summary];
    if (sumSort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    if (sumSort === 'cost') {
      const costOf = (s: typeof list[number]) => earned(s.ms, rateById.get(s.id) ?? 0);
      return list.sort((a, b) => costOf(b) - costOf(a));
    }
    return list;
  }, [summary, sumSort, rateById]);

  // Gross labor cost over the period (only employees with a rate > 0).
  const laborCost = useMemo(() => {
    let sum = 0;
    for (const s of summary) {
      const rate = rateById.get(s.id);
      if (rate) sum += earned(s.ms, rate);
    }
    return sum;
  }, [summary, rateById]);

  // Revenue (cash + card) from closings whose date falls within the selected period.
  const revenue = useMemo(() => {
    const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - (days - 1));
    const fromKey = toKey(from);
    const toKeyStr = toKey(today);
    let sum = 0;
    for (const c of closings) {
      if (c.date >= fromKey && c.date <= toKeyStr) sum += (c.cash_revenue || 0) + (c.card_revenue || 0);
    }
    return sum;
  }, [closings, days]);

  const hasRates = rateById.size > 0;

  // Group entries by calendar day (newest first — API already sorts DESC).
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(e => obsahuje(e.employeeName, needle));
  }, [entries, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of shown) {
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
  }, [shown]);

  // A shift open longer than 12 h is almost certainly a forgotten clock-out.
  const STALE_MS = 12 * 3600 * 1000;

  // "Ukončit" opens the editor with the clock-out prefilled to now, so the
  // employer sets the real leaving time in one step instead of close-then-fix.
  const closeEntry = (e: Entry) => {
    setEditEntry(e); setEditErr('');
    setEditIn(toLocalInput(e.clockIn));
    setEditOut(toLocalInput(new Date().toISOString()));
  };

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
    if (!pro) { setUpgradeFor('Export CSV'); return; }
    const head = ['Datum', 'Zaměstnanec', 'Příchod', 'Odchod', 'Odpracováno', 'Zdroj', `Mzda (${symbol})`];
    const rows = entries.map(e => {
      const start = new Date(e.clockIn).getTime();
      const end = e.clockOut ? new Date(e.clockOut).getTime() : now;
      const rate = rateById.get(String(e.employeeId));
      return [
        new Date(e.clockIn).toLocaleDateString('cs-CZ'),
        e.employeeName ?? 'Neznámý',
        fmtTime(e.clockIn),
        e.clockOut ? fmtTime(e.clockOut) : '',
        hMM(end - start),
        e.source === 'kiosk' ? 'kiosk' : 'ručně',
        rate ? String(earned(Math.max(0, end - start), rate)) : '',
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
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader hintId="attendance"
        title="Docházka"
        subtitle="Kdo je na směně, odpracované hodiny a mzdy za období."
        secondary={<Segmented size="sm" ariaLabel="Období" value={String(days)} onChange={v => setDays(Number(v) as typeof PERIODS[number])}
          options={PERIODS.map(p => ({ id: String(p), label: `${p} dní` }))} />}
        primary={
          <>
            {entries.length > 0 && (
              <Button variant="secondary" icon="download" onClick={exportCsv}>Export CSV</Button>
            )}
            <Button variant="accent" icon="plus" onClick={() => { setAddOpen(true); setAddErr(''); }}>Přidat záznam</Button>
          </>
        }
      />

      {/* Právě na směně */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="users" size={18} className="text-[#5B7A08]" />
          <h3 className="t-label">Právě na směně</h3>
        </div>
        {onShift.length === 0 ? (
          <p className="text-sm text-black/40">Nikdo právě není na směně.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {onShift.map(r => (
              /* Na telefonu se do jedné řádky nevešlo jméno, stopky i tlačítko —
                 „Kryštof Eliáš" se ořezal na „Kryštof El…". Jméno teď drží
                 celou šířku a zbytek se zalomí pod něj. */
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0 rounded-2xl bg-[#C8F542]/[0.12] border border-[#C8F542]/40 px-4 py-3">
                <PersonLink id={Number(r.id)}>{avatar(r.avatar)}</PersonLink>
                <div className="min-w-0 flex-1 basis-[min(100%,8rem)]">
                  <PersonLink id={Number(r.id)}><p className="font-semibold text-[#16181A] truncate">{r.name}</p></PersonLink>
                  <p className="text-xs text-[#5B7A08]">od {fmtTime(r.openSince as string)}</p>
                </div>
                {/* Stopky a tlačítko mají každé svůj sloupec. Dokud se
                    tlačítko jen vynechalo, sjely stopky u člověka bez
                    otevřeného záznamu úplně doprava — dvě stejné karty
                    vedle sebe pak měly čas každá jinde. */}
                <span className="shrink-0 whitespace-nowrap tabular-nums font-bold text-[#16181A] text-lg ml-auto">
                  {hms(now - new Date(r.openSince as string).getTime())}
                </span>
                {(() => {
                  const openEntry = entries.find(e => String(e.employeeId) === String(r.id) && !e.clockOut);
                  return (
                    <span className="shrink-0 w-[5.5rem] flex justify-end">
                      {openEntry && (
                        <button onClick={() => closeEntry(openEntry)} title="Ukončit směnu a nastavit čas odchodu"
                          className="tap-target-sm rounded-full glass border border-black/10 text-[#16181A] text-xs font-semibold px-3 py-1.5 hover:bg-black/[0.05] transition whitespace-nowrap">
                          Ukončit
                        </button>
                      )}
                    </span>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* Mzdové náklady */}
          {hasRates && (
            <div className="space-y-3">
              <h2 className="t-section">Mzdy</h2>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="glass-card p-5 min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-black/45 line-clamp-2">Mzdové náklady</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-[#16181A] whitespace-nowrap">
                    {money(laborCost)}
                  </p>
                </div>
                {(() => {
                  const pct = revenue > 0 ? laborCost / revenue * 100 : null;
                  const over = pct != null && laborTargetPct != null && pct > laborTargetPct;
                  const tone = pct == null || laborTargetPct == null
                    ? 'text-[#16181A]'
                    : over ? 'text-bad-ink' : 'text-[#5B7A08]';
                  return (
                    <div className={`glass-card p-5 min-w-0 ${over ? 'ring-1 ring-bad/30' : ''}`}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-black/45 line-clamp-2">Podíl na tržbách</p>
                      <p className={`mt-1 text-xl font-bold tabular-nums whitespace-nowrap ${tone}`}>
                        {pct != null ? `${pct.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %` : '—'}
                      </p>
                      {laborTargetPct != null ? (
                        <p className="text-[11px] text-black/40">
                          cíl {laborTargetPct} % · {over ? 'nad cílem' : 'v cíli'}
                        </p>
                      ) : (
                        <p className="text-[11px] text-black/40">z tržeb za období</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Souhrn hodin */}
          {summary.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:flex-wrap">
                <h2 className="t-section">Souhrn hodin</h2>
                {summary.length > 2 && (
                  <div className="sm:ml-auto flex flex-wrap gap-1.5">
                    {([['hours', 'Nejvíc hodin'], ['cost', 'Nejvíc mzdy'], ['name', 'Podle jména']] as const).map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setSumSort(id)}
                        aria-pressed={sumSort === id}
                        className={`filter-pill ${sumSort === id ? 'seg-on' : 'seg-off glass'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {summarySorted.map(s => {
                  const rate = rateById.get(s.id);
                  return (
                    <div key={s.id} className="glass-card p-4 flex items-center gap-x-3 gap-y-1.5 flex-wrap min-w-0">
                      <PersonLink id={Number(s.id)}>{avatar(s.avatar)}</PersonLink>
                      <div className="min-w-0 flex-1 basis-24">
                        <PersonLink id={Number(s.id)}><p className="font-semibold text-[#16181A] truncate">{s.name}</p></PersonLink>
                        <p className="text-xs text-black/45 truncate">
                          {s.count} {s.count === 1 ? 'směna' : s.count >= 2 && s.count <= 4 ? 'směny' : 'směn'}
                          {s.hasOpen && <span className="text-[#5B7A08]"> · právě běží</span>}
                        </p>
                      </div>
                      <div className="shrink-0 flex flex-col items-end">
                        <span className="whitespace-nowrap tabular-nums font-bold text-[#16181A]">{humanDuration(s.ms)}</span>
                        {rate ? (
                          <span className="whitespace-nowrap tabular-nums text-[#5B7A08] font-semibold text-sm">
                            {money(earned(s.ms, rate))}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seznam záznamů */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="t-section">
                Záznamy ({shown.length}{q.trim() && shown.length !== entries.length ? ` z ${entries.length}` : ''})
              </h2>
              {entries.length > 10 && (
                <SearchField className="ml-auto min-w-[14rem] flex-1 max-w-sm" value={q} onChange={setQ}
                  storageKey="dochazka" placeholder="Hledat zaměstnance…" ariaLabel="Hledat zaměstnance v docházce" />
              )}
            </div>
            {entries.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <p className="text-black/45">Za zvolené období nejsou žádné záznamy docházky.</p>
              </div>
            ) : shown.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <p className="text-black/45">Nikdo takový v tomhle období nic neodpíchl.</p>
              </div>
            ) : (
              grouped.map(g => (
                <div key={g.key} className="space-y-2">
                  <div className="flex items-center gap-2 px-1 pt-1">
                    <Icon name="calendar" size={14} className="text-black/35 shrink-0" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-black/45 cz-sentence line-clamp-2">{g.label}</p>
                  </div>
                  <div className="glass-card divide-y divide-black/[0.06] overflow-hidden">
                    {g.list.map(e => {
                      const open = !e.clockOut;
                      const start = new Date(e.clockIn).getTime();
                      const end = open ? now : new Date(e.clockOut as string).getTime();
                      const stale = open && (now - start) > STALE_MS;
                      return (
                        <div key={e.id} className="flex items-center gap-x-3 gap-y-2 flex-wrap p-3 sm:p-4">
                          {/* Na úzkém telefonu si identita bere celý řádek a
                              ovládání se zalomí pod ni. Dřív se dělila o šířku
                              s nezalomitelným časem a jméno spadlo na 2 px. */}
                          <div className="flex items-center gap-3 min-w-0 basis-full sm:basis-0 sm:flex-1">
                            <PersonLink id={Number(e.employeeId)}>{avatar(e.employeeAvatar, 'h-9 w-9 text-base')}</PersonLink>
                            <div className="min-w-0 flex-1">
                              <PersonLink id={Number(e.employeeId)}><p className="font-semibold text-[#16181A] truncate">{e.employeeName ?? 'Neznámý'}</p></PersonLink>
                              <p className="text-xs text-black/45 tabular-nums whitespace-nowrap">
                                {fmtTime(e.clockIn)} – {open ? '…' : fmtTime(e.clockOut as string)}
                              </p>
                            </div>
                          </div>
                          {stale && (
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full bg-wait/15 text-wait-ink px-2 py-0.5 whitespace-nowrap">
                                <Icon name="warning" size={12} /> Zapomenutý odchod?
                              </span>
                              <button onClick={() => closeEntry(e)}
                                className="tap-target-sm rounded-full bg-[#16181A] text-white text-xs font-semibold px-3 py-1.5 hover:bg-black transition whitespace-nowrap">
                                Ukončit
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-2 shrink-0 ml-auto">
                            <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${e.source === 'kiosk' ? 'bg-black/[0.05] text-black/55' : e.source === 'closing' ? 'bg-wait/15 text-wait-ink' : 'bg-[#C8F542]/20 text-[#5B7A08]'}`}>
                              {e.source === 'kiosk' ? 'kiosk' : e.source === 'closing' ? 'z uzávěrky' : 'ručně'}
                            </span>
                            <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${open ? 'text-[#5B7A08]' : 'text-[#16181A]'}`}>
                              {open ? hms(end - start) : humanDuration(end - start)}
                            </span>
                            {/* Ikony ze sady, ne ručně kreslené cesty: stejná
                                tloušťka linky jako všude jinde. A zvětšená
                                dotyková plocha — 32 px se palcem míjí. */}
                            <button onClick={() => openEdit(e)} aria-label="Upravit čas"
                              className="tap-target shrink-0 h-8 w-8 flex items-center justify-center rounded-full text-black/35 hover:text-[#16181A] hover:bg-black/[0.05] transition-colors">
                              <Icon name="pencil" size={15} />
                            </button>
                            <button onClick={() => remove(e)} disabled={deleting === e.id}
                              aria-label="Smazat záznam"
                              className="tap-target shrink-0 h-8 w-8 flex items-center justify-center rounded-full text-black/35 hover:text-bad-ink hover:bg-bad/[0.08] transition-colors disabled:opacity-40">
                              <Icon name="trash" size={16} />
                            </button>
                          </div>
                          {e.note && (
                            <div className="w-full flex items-center gap-1.5 rounded-xl bg-wait/[0.07] border border-wait/20 px-3 py-2 text-xs text-wait-ink">
                              <Icon name="warning" size={13} className="shrink-0" />
                              <span className="min-w-0">{e.note}</span>
                              <button onClick={() => openEdit(e)} className="tap-target-sm ml-auto shrink-0 font-semibold text-wait-ink hover:underline whitespace-nowrap">Zkontrolovat čas</button>
                            </div>
                          )}
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

      {/* Edit time modal */}
      {addOpen && (
        <Modal open onClose={() => setAddOpen(false)} size="sm"
          title="Přidat záznam docházky" subtitle="Když se někdo zapomněl odpíchnout úplně."
          footer={<>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Zrušit</Button>
            <Button variant="primary" icon="plus" loading={savingAdd} onClick={saveAdd}>Přidat záznam</Button>
          </>}>
            {addErr && <div className="p-3 note note-danger text-sm mb-3">{addErr}</div>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Zaměstnanec</label>
                <select aria-label="Zaměstnanec" value={addEmp} onChange={e => setAddEmp(e.target.value === '' ? '' : parseInt(e.target.value))}
                  className="w-full field border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none">
                  <option value="">— vyber —</option>
                  {roster.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Příchod</label>
                <input type="datetime-local" aria-label="Příchod" value={addIn} onChange={e => setAddIn(e.target.value)}
                  className="w-full field border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Odchod</label>
                <input type="datetime-local" aria-label="Odchod" value={addOut} onChange={e => setAddOut(e.target.value)}
                  className="w-full field border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none" />
              </div>
            </div>
        </Modal>
      )}

      {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}

      {editEntry && (
        <Modal open onClose={() => setEditEntry(null)} size="sm"
          title="Upravit čas na směně" subtitle={editEntry.employeeName}
          footer={<>
            <Button variant="secondary" onClick={() => setEditEntry(null)}>Zrušit</Button>
            <Button variant="primary" icon="check" loading={savingEdit} onClick={saveEdit}>Uložit</Button>
          </>}>
            {editErr && <div className="p-3 note note-danger text-sm mb-3">{editErr}</div>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Příchod</label>
                <input type="datetime-local" aria-label="Příchod" value={editIn} onChange={e => setEditIn(e.target.value)}
                  className="w-full field border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Odchod <span className="normal-case text-black/35">(prázdné = stále na směně)</span></label>
                <input type="datetime-local" aria-label="Odchod" value={editOut} onChange={e => setEditOut(e.target.value)}
                  className="w-full field border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none" />
              </div>
            </div>
        </Modal>
      )}
    </div>
  );
}
