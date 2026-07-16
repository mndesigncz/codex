'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../Icons';

interface Props {
  user: { id?: string; name?: string | null; avatar?: string; role?: string };
}

interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}
interface Submission {
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  unavailableDates: string[];
  dayPreferences?: Record<string, string>;
  preferredShift: string | null;
  maxShifts: number | null;
  note: string | null;
}
interface Shift {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
}
interface ShiftType {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  position: number;
}
interface FixedAssignment {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  weekday: number;
  shiftTypeId: number | null;
  shiftTypeName: string | null;
  startTime: string | null;
  endTime: string | null;
  color: string | null;
}
interface OpeningDay {
  open: string;
  close: string;
  closed: boolean;
}
interface Proposed {
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  shiftTypeId: number;
  shiftTypeName: string;
  color: string;
}

const CZ_DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const CZ_DAYS_FULL = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
const COLORS = ['#C8F542', '#3B82F6', '#F59E0B', '#8B5CF6', '#F43F5E', '#14B8A6', '#EC4899', '#64748B'];
const DEFAULT_TYPES = [
  { name: 'Ranní', startTime: '06:00', endTime: '14:00', color: '#C8F542' },
  { name: 'Odpolední', startTime: '14:00', endTime: '22:00', color: '#3B82F6' },
];
const SHIFT_PRESETS: Record<string, { start: string; end: string; label: string }> = {
  morning: { start: '08:00', end: '14:00', label: 'Ranní' },
  afternoon: { start: '14:00', end: '22:00', label: 'Odpolední' },
};
const SHIFT_LABEL: Record<string, string> = { morning: 'Ranní', afternoon: 'Odpolední', flexible: 'Vlastní' };

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
}
function dayLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
}
function buildGrid(month: string) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type Tab = 'rozvrh' | 'typy' | 'oteviraci' | 'pevne';
const TABS: { id: Tab; label: string }[] = [
  { id: 'rozvrh', label: 'Rozvrh' },
  { id: 'typy', label: 'Typy směn' },
  { id: 'oteviraci', label: 'Otevírací doba' },
  { id: 'pevne', label: 'Pevné dny' },
];

export default function ScheduleBuilder({ user }: Props) {
  const now = new Date();
  const currentMonth = ym(now);
  const nextMonth = ym(new Date(now.getFullYear(), now.getMonth() + 1, 1));

  const [tab, setTab] = useState<Tab>('rozvrh');
  const [month, setMonth] = useState(nextMonth);
  const [members, setMembers] = useState<Member[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [fixed, setFixed] = useState<FixedAssignment[]>([]);
  const [openingHours, setOpeningHours] = useState<Record<string, OpeningDay>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [dayModal, setDayModal] = useState<string | null>(null);
  const [publishNote, setPublishNote] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);

  // generate preview state
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<{ proposed: Proposed[]; warnings: string[] } | null>(null);
  const [committing, setCommitting] = useState(false);
  const [clearBeforeCommit, setClearBeforeCommit] = useState(true);

  // import preview state
  const [importPreview, setImportPreview] = useState<{ rows: any[]; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const employees = useMemo(() => members.filter((m) => m.role === 'employee'), [members]);
  const grid = useMemo(() => buildGrid(month), [month]);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, aRes, sRes, stRes, faRes, ohRes] = await Promise.all([
        fetch('/api/teams'),
        fetch(`/api/availability?month=${month}`),
        fetch(`/api/schedule?month=${month}`),
        fetch('/api/shift-types'),
        fetch('/api/fixed-assignments'),
        fetch('/api/opening-hours'),
      ]);
      const [tData, aData, sData, stData, faData, ohData] = await Promise.all([
        tRes.json(),
        aRes.json(),
        sRes.json(),
        stRes.json(),
        faRes.json(),
        ohRes.json(),
      ]);
      setMembers(tData.members ?? []);
      setSubmissions(aData.submissions ?? []);
      setShifts(sData.shifts ?? []);
      setShiftTypes(stData.shiftTypes ?? []);
      setFixed(faData.assignments ?? []);
      setOpeningHours(ohData.openingHours ?? {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setPublishNote(false);
    setConfirmClear(false);
    setPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const reloadTypes = async () => {
    const r = await fetch('/api/shift-types');
    const d = await r.json();
    setShiftTypes(d.shiftTypes ?? []);
  };
  const reloadFixed = async () => {
    const r = await fetch('/api/fixed-assignments');
    const d = await r.json();
    setFixed(d.assignments ?? []);
  };

  // Seed default shift types the first time the "Typy směn" tab is opened with none configured.
  useEffect(() => {
    if (tab !== 'typy' || loading || seededRef.current) return;
    if (shiftTypes.length > 0) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    (async () => {
      for (const t of DEFAULT_TYPES) {
        await fetch('/api/shift-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        });
      }
      await reloadTypes();
    })();
  }, [tab, loading, shiftTypes.length]);

  const submittedIds = new Set(submissions.map((s) => s.employeeId));
  const notSubmitted = employees.filter((e) => !submittedIds.has(e.id));
  const shiftsByDay = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    shifts.forEach((s) => {
      (map[s.date] ||= []).push(s);
    });
    return map;
  }, [shifts]);
  const proposedByDay = useMemo(() => {
    const map: Record<string, Proposed[]> = {};
    (preview?.proposed ?? []).forEach((p) => {
      (map[p.date] ||= []).push(p);
    });
    return map;
  }, [preview]);

  const unavailableOn = (date: string) =>
    new Set(submissions.filter((s) => (s.unavailableDates ?? []).includes(date)).map((s) => s.employeeId));

  const addShift = async (payload: { employeeId: number; date: string; startTime: string; endTime: string; type: string }) => {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shifts: [payload] }),
    });
    if (res.ok) await load();
  };

  const removeShift = async (id: number) => {
    const res = await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' });
    if (res.ok) setShifts((prev) => prev.filter((s) => s.id !== id));
  };

  const clearMonth = async () => {
    const res = await fetch(`/api/schedule?month=${month}`, { method: 'DELETE' });
    if (res.ok) {
      setShifts([]);
      setConfirmClear(false);
    }
  };

  // ---- Generate ----
  const generate = async () => {
    setGenerating(true);
    setPreview(null);
    try {
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const data = await res.json();
      if (res.ok) {
        setPreview({ proposed: data.proposed ?? [], warnings: data.warnings ?? [] });
      } else {
        setPreview({ proposed: [], warnings: [data.error ?? 'Generování selhalo.'] });
      }
    } catch {
      setPreview({ proposed: [], warnings: ['Generování selhalo.'] });
    } finally {
      setGenerating(false);
    }
  };

  const commitPreview = async () => {
    if (!preview || preview.proposed.length === 0) return;
    setCommitting(true);
    try {
      if (clearBeforeCommit) {
        await fetch(`/api/schedule?month=${month}`, { method: 'DELETE' });
      }
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, commit: true, shifts: preview.proposed }),
      });
      if (res.ok) {
        setPreview(null);
        await load();
      }
    } finally {
      setCommitting(false);
    }
  };

  // ---- CSV export ----
  const exportCsv = () => {
    const header = 'datum,zaměstnanec,od,do,typ';
    const lines = shifts
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .map((s) => {
        const name = /[",\n]/.test(s.employeeName) ? `"${s.employeeName.replace(/"/g, '""')}"` : s.employeeName;
        return `${s.date},${name},${s.startTime},${s.endTime},${s.type}`;
      });
    const csv = [header, ...lines].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rozvrh-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ---- CSV import ----
  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',' || ch === ';') out.push(cur), (cur = '');
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length === 0) {
      setImportPreview({ rows: [], errors: ['Soubor je prázdný.'] });
      return;
    }
    const startIdx = /datum/i.test(lines[0]) ? 1 : 0;
    const rows: any[] = [];
    const errors: string[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      const [date, who, start, end, type] = cols;
      if (!date || !who || !start || !end) {
        errors.push(`Řádek ${i + 1}: neúplný (${lines[i]})`);
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push(`Řádek ${i + 1}: neplatné datum "${date}" (očekává YYYY-MM-DD)`);
        continue;
      }
      const key = who.toLowerCase();
      const emp = employees.find((e) => e.email.toLowerCase() === key || e.name.toLowerCase() === key);
      if (!emp) {
        errors.push(`Řádek ${i + 1}: zaměstnanec "${who}" nenalezen v týmu`);
        continue;
      }
      const normType =
        type && ['morning', 'afternoon', 'flexible'].includes(type.toLowerCase()) ? type.toLowerCase() : 'flexible';
      rows.push({ employeeId: emp.id, employeeName: emp.name, date, startTime: start, endTime: end, type: normType });
    }
    setImportPreview({ rows, errors });
  };

  const confirmImport = async () => {
    if (!importPreview || importPreview.rows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch('/api/schedule/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, rows: importPreview.rows }),
      });
      if (res.ok) {
        setImportPreview(null);
        await load();
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A]">Rozvrh směn</h1>
          <p className="text-black/45 mt-1">Sestav měsíční rozvrh podle dostupnosti týmu.</p>
        </div>
        {/* Month selector */}
        <div className="flex gap-1 glass rounded-full p-1">
          {[currentMonth, nextMonth].map((m) => (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-all duration-300 ${
                month === m ? 'bg-[#C8F542] text-black font-semibold' : 'text-black/60 hover:text-black hover:bg-black/[0.06]'
              }`}
            >
              {monthLabel(m)}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-full p-1 w-full sm:w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300 ${
              tab === t.id ? 'bg-[#16181A] text-white font-semibold' : 'text-black/60 hover:text-black hover:bg-black/[0.06]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
        </div>
      ) : tab === 'typy' ? (
        <ShiftTypesManager shiftTypes={shiftTypes} onReload={reloadTypes} />
      ) : tab === 'oteviraci' ? (
        <OpeningHoursEditor value={openingHours} onSaved={(v) => setOpeningHours(v)} />
      ) : tab === 'pevne' ? (
        <FixedAssignmentsManager
          employees={employees}
          shiftTypes={shiftTypes}
          assignments={fixed}
          onReload={reloadFixed}
        />
      ) : (
        <>
          {/* Availability summary */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="users" size={20} className="text-black/70" />
              <h2 className="font-bold text-[#16181A]">Dostupnost týmu</h2>
              <span className="text-xs text-black/45">
                {submissions.length}/{employees.length} odesláno
              </span>
            </div>
            {employees.length === 0 ? (
              <p className="text-black/45 text-sm">Zatím nemáš v týmu žádné zaměstnance.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {submissions.map((s) => (
                    <button
                      key={s.employeeId}
                      onClick={() => setExpanded(expanded === s.employeeId ? null : s.employeeId)}
                      className={`flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1.5 text-sm border transition-all ${
                        expanded === s.employeeId
                          ? 'bg-[#C8F542]/15 border-[#C8F542]/40 text-[#16181A]'
                          : 'bg-[#C8F542]/[0.08] border-[#C8F542]/20 text-black/80 hover:bg-[#C8F542]/15'
                      }`}
                    >
                      <span className="text-base">{s.employeeAvatar}</span>
                      {s.employeeName}
                      <Icon name="check" size={15} className="text-[#5B7A08]" />
                    </button>
                  ))}
                  {notSubmitted.map((e) => (
                    <span
                      key={e.id}
                      className="flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1.5 text-sm bg-black/[0.03] border border-black/[0.08] text-black/45"
                    >
                      <span className="text-base opacity-60">{e.avatar ?? '👤'}</span>
                      {e.name}
                      <span className="text-[10px] uppercase tracking-wide text-black/30">čeká</span>
                    </span>
                  ))}
                </div>

                {expanded != null &&
                  (() => {
                    const s = submissions.find((x) => x.employeeId === expanded);
                    if (!s) return null;
                    return (
                      <div className="rounded-2xl bg-black/[0.03] border border-black/[0.08] p-4 space-y-2 text-sm">
                        <div className="flex items-center gap-2 font-semibold text-[#16181A]">
                          <span className="text-lg">{s.employeeAvatar}</span> {s.employeeName}
                        </div>
                        <p className="text-black/60">
                          Preferuje:{' '}
                          <span className="text-[#16181A]/90">
                            {s.preferredShift === 'morning'
                              ? 'Ranní'
                              : s.preferredShift === 'afternoon'
                              ? 'Odpolední'
                              : 'Flexibilní'}
                          </span>
                          {s.maxShifts != null && (
                            <>
                              {' · '}max <span className="text-[#16181A]/90">{s.maxShifts}</span> směn
                            </>
                          )}
                        </p>
                        <div className="text-black/60">
                          Nemůže ({(s.unavailableDates ?? []).length}):{' '}
                          {(s.unavailableDates ?? []).length === 0 ? (
                            <span className="text-black/45">bez omezení</span>
                          ) : (
                            <span className="flex flex-wrap gap-1 mt-1">
                              {(s.unavailableDates ?? []).sort().map((d) => (
                                <span key={d} className="rounded-md bg-red-500/15 text-red-500 px-1.5 py-0.5 text-xs">
                                  {parseInt(d.split('-')[2])}.{parseInt(d.split('-')[1])}.
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                        {s.note && <p className="text-black/60">Poznámka: <span className="text-[#16181A]/90">{s.note}</span></p>}
                      </div>
                    );
                  })()}
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={generate}
              disabled={generating}
              className="rounded-full bg-[#16181A] text-white font-semibold px-5 py-2.5 hover:brightness-125 transition inline-flex items-center gap-2 disabled:opacity-50"
            >
              <span>✨</span> {generating ? 'Generuji…' : 'Vygenerovat rozvrh'}
            </button>
            <button
              onClick={() => setPublishNote(true)}
              className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 hover:brightness-105 transition inline-flex items-center gap-2"
            >
              <Icon name="check" size={18} /> Publikovat rozvrh
            </button>
            <button
              onClick={exportCsv}
              disabled={shifts.length === 0}
              className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-5 py-2.5 transition inline-flex items-center gap-2 disabled:opacity-40"
            >
              <Icon name="trend" size={18} /> Export CSV
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-5 py-2.5 transition inline-flex items-center gap-2"
            >
              <Icon name="plus" size={18} /> Import CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => (confirmClear ? clearMonth() : setConfirmClear(true))}
              className={`rounded-full px-5 py-2.5 transition inline-flex items-center gap-2 border ${
                confirmClear
                  ? 'bg-red-500/20 border-red-500/40 text-red-500'
                  : 'glass border-black/10 text-black/70 hover:bg-black/[0.05]'
              }`}
            >
              <Icon name="warning" size={18} /> {confirmClear ? 'Opravdu vymazat?' : 'Vymazat měsíc'}
            </button>
            {confirmClear && (
              <button onClick={() => setConfirmClear(false)} className="text-black/45 text-sm hover:text-black">
                Zrušit
              </button>
            )}
          </div>

          {publishNote && (
            <div className="glass-card p-4 flex items-start gap-3 border border-[#C8F542]/20">
              <Icon name="check" size={20} className="text-[#5B7A08] mt-0.5" />
              <p className="text-sm text-black/70">
                Rozvrh je průběžně ukládán — každá přidaná směna je hned uložena a viditelná zaměstnancům v jejich sekci
                „Moje směny". Není potřeba nic dalšího potvrzovat.
              </p>
            </div>
          )}

          {/* Generated preview banner */}
          {preview && (
            <div className="glass-card p-5 border border-[#C8F542]/40 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-bold text-[#16181A] flex items-center gap-2">
                    <span>✨</span> Navržený rozvrh
                  </h3>
                  <p className="text-sm text-black/55 mt-0.5">
                    {preview.proposed.length} navržených směn
                    {preview.warnings.length > 0 && ` · ${preview.warnings.length} upozornění`}. Zkontroluj náhled v
                    kalendáři (zvýrazněno) a ulož.
                  </p>
                </div>
                <button onClick={() => setPreview(null)} className="text-black/45 hover:text-black text-sm">
                  Zahodit náhled
                </button>
              </div>

              {preview.warnings.length > 0 && (
                <div className="rounded-2xl bg-orange-500/10 border border-orange-500/25 p-3">
                  <p className="text-sm font-medium text-orange-600 mb-1 flex items-center gap-1.5">
                    <Icon name="warning" size={16} /> Upozornění ({preview.warnings.length})
                  </p>
                  <ul className="text-xs text-orange-700/90 space-y-0.5 max-h-40 overflow-y-auto">
                    {preview.warnings.slice(0, 40).map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                    {preview.warnings.length > 40 && (
                      <li className="text-orange-700/60">…a dalších {preview.warnings.length - 40}</li>
                    )}
                  </ul>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-black/60 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={clearBeforeCommit}
                  onChange={(e) => setClearBeforeCommit(e.target.checked)}
                  className="accent-[#C8F542] h-4 w-4"
                />
                Před uložením vymazat stávající směny měsíce
              </label>

              <div className="flex items-center gap-3">
                <button
                  onClick={commitPreview}
                  disabled={committing || preview.proposed.length === 0}
                  className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 hover:brightness-105 transition disabled:opacity-40 inline-flex items-center gap-2"
                >
                  <Icon name="check" size={18} /> {committing ? 'Ukládám…' : 'Potvrdit a uložit'}
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-5 py-2.5 transition"
                >
                  Zrušit
                </button>
              </div>
            </div>
          )}

          {/* Calendar grid */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-bold text-[#16181A] capitalize flex items-center gap-2">
                <Icon name="calendar" size={20} /> {monthLabel(month)}
              </h2>
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <span className="flex items-center gap-1.5 text-black/55">
                  <span className="h-3 w-3 rounded-md bg-[#C8F542]" /> Ranní
                </span>
                <span className="flex items-center gap-1.5 text-black/55">
                  <span className="h-3 w-3 rounded-md bg-blue-500" /> Odpolední
                </span>
                {preview && (
                  <span className="flex items-center gap-1.5 text-black/55">
                    <span className="h-3 w-3 rounded-md border-2 border-dashed border-[#5B7A08]" /> Návrh
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {CZ_DAYS.map((d) => (
                <div key={d} className="text-center text-[11px] font-medium text-black/35 py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {grid.map((cell, i) => {
                if (!cell) return <div key={i} />;
                const day = parseInt(cell.split('-')[2]);
                const dayShifts = shiftsByDay[cell] ?? [];
                const dayProposed = proposedByDay[cell] ?? [];
                return (
                  <button
                    key={cell}
                    onClick={() => setDayModal(cell)}
                    className="min-h-[84px] rounded-xl bg-black/[0.03] border border-black/[0.08] hover:border-[#C8F542]/40 hover:bg-black/[0.04] p-1.5 text-left transition-all flex flex-col gap-1"
                  >
                    <span className="text-xs font-medium text-black/55">{day}</span>
                    <div className="flex flex-col gap-1 overflow-hidden">
                      {dayShifts.slice(0, 3).map((s) => (
                        <span
                          key={s.id}
                          title={`${s.employeeName} · ${s.startTime}–${s.endTime}`}
                          className={`flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium truncate ${
                            s.type === 'morning'
                              ? 'bg-[#C8F542]/20 text-[#5B7A08]'
                              : s.type === 'afternoon'
                              ? 'bg-blue-500/20 text-blue-600'
                              : 'bg-black/[0.06] text-black/70'
                          }`}
                        >
                          <span>{s.employeeAvatar}</span>
                          <span className="truncate">{s.startTime}</span>
                        </span>
                      ))}
                      {dayShifts.length > 3 && (
                        <span className="text-[10px] text-black/45">+{dayShifts.length - 3} další</span>
                      )}
                      {/* proposed (preview) */}
                      {dayProposed.slice(0, 3).map((p, idx) => (
                        <span
                          key={`p-${idx}`}
                          title={`Návrh: ${p.employeeName} · ${p.shiftTypeName} ${p.startTime}–${p.endTime}`}
                          className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium truncate border border-dashed border-[#5B7A08]/60 bg-[#C8F542]/10 text-[#5B7A08]"
                        >
                          <span>✨{p.employeeAvatar}</span>
                          <span className="truncate">{p.startTime}</span>
                        </span>
                      ))}
                      {dayProposed.length > 3 && (
                        <span className="text-[10px] text-[#5B7A08]/70">+{dayProposed.length - 3} návrh</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Day modal */}
      {dayModal && (
        <DayModal
          date={dayModal}
          employees={employees}
          shifts={shiftsByDay[dayModal] ?? []}
          shiftTypes={shiftTypes}
          unavailable={unavailableOn(dayModal)}
          submissions={submissions}
          onClose={() => setDayModal(null)}
          onAdd={addShift}
          onRemove={removeShift}
        />
      )}

      {/* Import preview modal */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-xl p-0 md:p-4">
          <div className="glass-strong rounded-3xl rounded-b-none md:rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-[#16181A]">Náhled importu</h3>
              <button onClick={() => setImportPreview(null)} className="text-black/45 hover:text-black text-2xl leading-none">
                ×
              </button>
            </div>
            <div className="rounded-2xl bg-black/[0.03] border border-black/[0.08] p-3 text-xs text-black/55">
              Očekávaný formát: <code className="text-black/80">datum,zaměstnanec,od,do,typ</code> — např.{' '}
              <code className="text-black/80">2026-08-03,anna@cajovna.cz,08:00,14:00,morning</code>. Sloupec „zaměstnanec"
              může být e-mail nebo jméno. Typ: morning / afternoon / flexible.
            </div>

            {importPreview.rows.length > 0 && (
              <div>
                <p className="text-sm font-medium text-[#5B7A08] mb-2">{importPreview.rows.length} platných směn k importu</p>
                <div className="rounded-2xl border border-black/[0.08] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-black/[0.04] text-black/55">
                      <tr>
                        <th className="text-left px-3 py-2">Datum</th>
                        <th className="text-left px-3 py-2">Zaměstnanec</th>
                        <th className="text-left px-3 py-2">Od</th>
                        <th className="text-left px-3 py-2">Do</th>
                        <th className="text-left px-3 py-2">Typ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                      {importPreview.rows.slice(0, 40).map((r, i) => (
                        <tr key={i} className="text-black/80">
                          <td className="px-3 py-1.5">{r.date}</td>
                          <td className="px-3 py-1.5">{r.employeeName}</td>
                          <td className="px-3 py-1.5">{r.startTime}</td>
                          <td className="px-3 py-1.5">{r.endTime}</td>
                          <td className="px-3 py-1.5">{SHIFT_LABEL[r.type] ?? r.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importPreview.rows.length > 40 && (
                    <p className="text-[11px] text-black/45 px-3 py-2">…a dalších {importPreview.rows.length - 40}</p>
                  )}
                </div>
              </div>
            )}

            {importPreview.errors.length > 0 && (
              <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-3">
                <p className="text-sm font-medium text-red-500 mb-1 flex items-center gap-1.5">
                  <Icon name="warning" size={16} /> {importPreview.errors.length} problémů (přeskočeno)
                </p>
                <ul className="text-xs text-red-500/80 space-y-0.5 max-h-32 overflow-y-auto">
                  {importPreview.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={confirmImport}
                disabled={importing || importPreview.rows.length === 0}
                className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 hover:brightness-105 transition disabled:opacity-40"
              >
                {importing ? 'Importuji…' : `Importovat ${importPreview.rows.length} směn`}
              </button>
              <button
                onClick={() => setImportPreview(null)}
                className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-5 py-2.5 transition"
              >
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Shift Types manager ----
function ShiftTypesManager({ shiftTypes, onReload }: { shiftTypes: ShiftType[]; onReload: () => Promise<void> }) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [start, setStart] = useState('06:00');
  const [end, setEnd] = useState('14:00');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);

  const beginNew = () => {
    setEditing('new');
    setName('');
    setStart('06:00');
    setEnd('14:00');
    setColor(COLORS[0]);
  };
  const beginEdit = (t: ShiftType) => {
    setEditing(t.id);
    setName(t.name);
    setStart(t.startTime);
    setEnd(t.endTime);
    setColor(t.color ?? COLORS[0]);
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const payload = { name: name.trim(), startTime: start, endTime: end, color };
      if (editing === 'new') {
        await fetch('/api/shift-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else if (typeof editing === 'number') {
        await fetch(`/api/shift-types/${editing}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setEditing(null);
      await onReload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await fetch(`/api/shift-types/${id}`, { method: 'DELETE' });
      await onReload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="clock" size={20} className="text-black/70" />
          <h2 className="font-bold text-[#16181A]">Typy směn</h2>
        </div>
        <button
          onClick={beginNew}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2 hover:brightness-105 transition inline-flex items-center gap-1.5 text-sm"
        >
          <Icon name="plus" size={16} /> Přidat
        </button>
      </div>

      {shiftTypes.length === 0 && editing !== 'new' && (
        <p className="text-black/45 text-sm">Zatím žádné typy směn. Přidej ranní, odpolední nebo vlastní směnu.</p>
      )}

      <div className="space-y-2">
        {shiftTypes.map((t) =>
          editing === t.id ? (
            <TypeForm
              key={t.id}
              name={name}
              start={start}
              end={end}
              color={color}
              busy={busy}
              setName={setName}
              setStart={setStart}
              setEnd={setEnd}
              setColor={setColor}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-2xl bg-black/[0.03] border border-black/[0.08] px-4 py-3"
            >
              <span className="h-4 w-4 rounded-md flex-shrink-0" style={{ backgroundColor: t.color ?? '#C8F542' }} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#16181A] truncate">{t.name}</p>
                <p className="text-xs text-black/45">
                  {t.startTime}–{t.endTime}
                </p>
              </div>
              <button onClick={() => beginEdit(t)} className="text-black/50 hover:text-[#16181A] p-1.5" title="Upravit">
                <Icon name="settings" size={18} />
              </button>
              <button onClick={() => remove(t.id)} className="text-black/30 hover:text-red-600 p-1.5" title="Smazat">
                ×
              </button>
            </div>
          ),
        )}

        {editing === 'new' && (
          <TypeForm
            name={name}
            start={start}
            end={end}
            color={color}
            busy={busy}
            setName={setName}
            setStart={setStart}
            setEnd={setEnd}
            setColor={setColor}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  );
}

function TypeForm({
  name,
  start,
  end,
  color,
  busy,
  setName,
  setStart,
  setEnd,
  setColor,
  onSave,
  onCancel,
}: {
  name: string;
  start: string;
  end: string;
  color: string;
  busy: boolean;
  setName: (v: string) => void;
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
  setColor: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl bg-black/[0.03] border border-[#C8F542]/30 p-4 space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Název (např. Ranní)"
        className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
      />
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-black/55 mb-1">Od</label>
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-black/55 mb-1">Do</label>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-black/55 mb-1.5">Barva</label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-lg transition-all ${color === c ? 'ring-2 ring-offset-2 ring-black/40' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={busy || !name.trim()}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2 text-sm hover:brightness-105 transition disabled:opacity-40"
        >
          {busy ? 'Ukládám…' : 'Uložit'}
        </button>
        <button onClick={onCancel} className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-4 py-2 text-sm transition">
          Zrušit
        </button>
      </div>
    </div>
  );
}

// ---- Opening hours editor ----
function OpeningHoursEditor({
  value,
  onSaved,
}: {
  value: Record<string, OpeningDay>;
  onSaved: (v: Record<string, OpeningDay>) => void;
}) {
  const norm = (v: Record<string, OpeningDay>) => {
    const out: Record<string, OpeningDay> = {};
    for (let d = 0; d <= 6; d++) {
      const cur = v[String(d)] ?? { open: '08:00', close: '20:00', closed: false };
      out[String(d)] = { open: cur.open ?? '08:00', close: cur.close ?? '20:00', closed: !!cur.closed };
    }
    return out;
  };
  const [hours, setHours] = useState<Record<string, OpeningDay>>(() => norm(value));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setHours(norm(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const update = (d: number, patch: Partial<OpeningDay>) => {
    setSaved(false);
    setHours((prev) => ({ ...prev, [String(d)]: { ...prev[String(d)], ...patch } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/opening-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingHours: hours }),
      });
      if (res.ok) {
        const d = await res.json();
        onSaved(d.openingHours ?? hours);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon name="clock" size={20} className="text-black/70" />
        <h2 className="font-bold text-[#16181A]">Otevírací doba</h2>
      </div>
      <p className="text-sm text-black/45">Nastav, kdy má provoz otevřeno. Zavřené dny algoritmus přeskočí.</p>

      <div className="space-y-2">
        {CZ_DAYS_FULL.map((label, d) => {
          const day = hours[String(d)] ?? { open: '08:00', close: '20:00', closed: false };
          return (
            <div
              key={d}
              className="flex items-center gap-3 rounded-2xl bg-black/[0.03] border border-black/[0.08] px-4 py-3 flex-wrap"
            >
              <span className="w-24 font-medium text-[#16181A]">{label}</span>
              <button
                onClick={() => update(d, { closed: !day.closed })}
                className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                  day.closed
                    ? 'bg-red-500/15 border-red-500/30 text-red-600'
                    : 'bg-[#C8F542]/15 border-[#C8F542]/40 text-[#5B7A08]'
                }`}
              >
                {day.closed ? 'Zavřeno' : 'Otevřeno'}
              </button>
              {!day.closed && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={day.open}
                    onChange={(e) => update(d, { open: e.target.value })}
                    className="rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 py-2 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
                  />
                  <span className="text-black/40">–</span>
                  <input
                    type="time"
                    value={day.close}
                    onChange={(e) => update(d, { close: e.target.value })}
                    className="rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 py-2 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 hover:brightness-105 transition disabled:opacity-50"
        >
          {saving ? 'Ukládám…' : 'Uložit otevírací dobu'}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-[#5B7A08] text-sm font-medium">
            <Icon name="check" size={18} /> Uloženo!
          </span>
        )}
      </div>
    </div>
  );
}

// ---- Fixed assignments manager ----
function FixedAssignmentsManager({
  employees,
  shiftTypes,
  assignments,
  onReload,
}: {
  employees: Member[];
  shiftTypes: ShiftType[];
  assignments: FixedAssignment[];
  onReload: () => Promise<void>;
}) {
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [weekday, setWeekday] = useState<number>(0);
  const [shiftTypeId, setShiftTypeId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!employeeId) return;
    setBusy(true);
    try {
      await fetch('/api/fixed-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, weekday, shiftTypeId: shiftTypeId === '' ? null : shiftTypeId }),
      });
      setEmployeeId('');
      setShiftTypeId('');
      await onReload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await fetch(`/api/fixed-assignments?id=${id}`, { method: 'DELETE' });
      await onReload();
    } finally {
      setBusy(false);
    }
  };

  const byWeekday = useMemo(() => {
    const map: Record<number, FixedAssignment[]> = {};
    assignments.forEach((a) => {
      (map[a.weekday] ||= []).push(a);
    });
    return map;
  }, [assignments]);

  return (
    <div className="space-y-6">
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Icon name="swap" size={20} className="text-black/70" />
          <h2 className="font-bold text-[#16181A]">Přidat pevný den</h2>
        </div>
        <p className="text-sm text-black/45">
          Přiřaď zaměstnance k opakujícímu se dni v týdnu. Algoritmus ho na tento den nasadí přednostně.
        </p>

        {employees.length === 0 ? (
          <p className="text-black/45 text-sm">Žádní zaměstnanci v týmu.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-black/55 mb-1">Zaměstnanec</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value === '' ? '' : parseInt(e.target.value))}
                className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
              >
                <option value="">Vyber…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-black/55 mb-1">Den v týdnu</label>
              <select
                value={weekday}
                onChange={(e) => setWeekday(parseInt(e.target.value))}
                className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
              >
                {CZ_DAYS_FULL.map((label, d) => (
                  <option key={d} value={d}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-black/55 mb-1">
                Typ směny <span className="text-black/35">(nepovinné)</span>
              </label>
              <select
                value={shiftTypeId}
                onChange={(e) => setShiftTypeId(e.target.value === '' ? '' : parseInt(e.target.value))}
                className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none"
              >
                <option value="">Libovolná</option>
                {shiftTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.startTime}–{t.endTime})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={add}
                disabled={busy || !employeeId}
                className="w-full rounded-full bg-[#C8F542] text-black font-semibold px-5 py-3 hover:brightness-105 transition disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
              >
                <Icon name="plus" size={16} /> Přidat pevný den
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="glass-card p-5 space-y-3">
        <h2 className="font-bold text-[#16181A] flex items-center gap-2">
          <Icon name="calendar" size={20} className="text-black/70" /> Pevné dny
        </h2>
        {assignments.length === 0 ? (
          <p className="text-black/45 text-sm">Zatím žádné pevné dny.</p>
        ) : (
          <div className="space-y-3">
            {CZ_DAYS_FULL.map((label, d) => {
              const list = byWeekday[d] ?? [];
              if (list.length === 0) return null;
              return (
                <div key={d}>
                  <p className="text-xs uppercase tracking-wide text-black/40 mb-1.5">{label}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((a) => (
                      <span
                        key={a.id}
                        className="flex items-center gap-2 rounded-full pl-1.5 pr-2 py-1.5 text-sm bg-black/[0.03] border border-black/[0.08] text-[#16181A]"
                      >
                        <span className="text-base">{a.employeeAvatar}</span>
                        {a.employeeName}
                        <span className="text-xs text-black/45">
                          {a.shiftTypeName ? `· ${a.shiftTypeName}` : '· libovolná'}
                        </span>
                        <button
                          onClick={() => remove(a.id)}
                          className="text-black/30 hover:text-red-600 pl-1"
                          title="Odebrat"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Day modal for assigning shifts ----
function DayModal({
  date,
  employees,
  shifts,
  shiftTypes,
  unavailable,
  submissions,
  onClose,
  onAdd,
  onRemove,
}: {
  date: string;
  employees: Member[];
  shifts: Shift[];
  shiftTypes: ShiftType[];
  unavailable: Set<number>;
  submissions: Submission[];
  onClose: () => void;
  onAdd: (p: { employeeId: number; date: string; startTime: string; endTime: string; type: string }) => Promise<void>;
  onRemove: (id: number) => void;
}) {
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [type, setType] = useState<'morning' | 'afternoon' | 'flexible'>('morning');
  const [start, setStart] = useState(SHIFT_PRESETS.morning.start);
  const [end, setEnd] = useState(SHIFT_PRESETS.morning.end);
  const [saving, setSaving] = useState(false);

  const pickType = (t: 'morning' | 'afternoon' | 'flexible') => {
    setType(t);
    if (t !== 'flexible') {
      setStart(SHIFT_PRESETS[t].start);
      setEnd(SHIFT_PRESETS[t].end);
    }
  };

  const applyShiftType = (t: ShiftType) => {
    setStart(t.startTime);
    setEnd(t.endTime);
    setType(t.startTime < '12:00' ? 'morning' : 'afternoon');
  };

  const save = async () => {
    if (!employeeId || !start || !end) return;
    setSaving(true);
    try {
      await onAdd({ employeeId: Number(employeeId), date, startTime: start, endTime: end, type });
      setEmployeeId('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-xl p-0 md:p-4">
      <div className="glass-strong rounded-3xl rounded-b-none md:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-[#16181A] capitalize">{dayLabel(date)}</h3>
          <button onClick={onClose} className="text-black/45 hover:text-black text-2xl leading-none">
            ×
          </button>
        </div>

        {/* Existing shifts */}
        {shifts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-black/45">Přiřazené směny</p>
            {shifts.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 py-2">
                <span className="text-lg">{s.employeeAvatar}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#16181A] truncate">{s.employeeName}</p>
                  <p className="text-xs text-black/45">
                    {s.startTime}–{s.endTime}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    s.type === 'morning'
                      ? 'bg-[#C8F542]/15 text-[#5B7A08]'
                      : s.type === 'afternoon'
                      ? 'bg-blue-500/15 text-blue-600'
                      : 'bg-black/[0.06] text-black/60'
                  }`}
                >
                  {SHIFT_LABEL[s.type] ?? s.type}
                </span>
                <button onClick={() => onRemove(s.id)} className="text-black/30 hover:text-red-600 transition p-1" title="Odebrat">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add shift */}
        <div className="space-y-4 border-t border-black/[0.08] pt-4">
          <p className="text-xs uppercase tracking-wide text-black/45 flex items-center gap-1.5">
            <Icon name="plus" size={14} /> Přidat směnu
          </p>

          <div>
            <label className="block text-sm font-medium text-black/70 mb-2">Zaměstnanec</label>
            {employees.length === 0 ? (
              <p className="text-black/45 text-sm">Žádní zaměstnanci v týmu.</p>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
                {employees.map((e) => {
                  const blocked = unavailable.has(e.id);
                  const sub = submissions.find((s) => s.employeeId === e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => setEmployeeId(e.id)}
                      className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 text-left border transition-all ${
                        employeeId === e.id
                          ? 'bg-[#C8F542]/15 border-[#C8F542]/40'
                          : 'bg-black/[0.03] border-black/[0.08] hover:bg-black/[0.05]'
                      }`}
                    >
                      <span className="text-lg">{e.avatar ?? '👤'}</span>
                      <span className="flex-1 text-sm text-[#16181A]">{e.name}</span>
                      {blocked && (
                        <span className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                          <Icon name="warning" size={14} /> nemůže
                        </span>
                      )}
                      {!blocked && sub?.preferredShift === type && <span className="text-xs text-[#5B7A08]/80">preferuje</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {employeeId !== '' && unavailable.has(Number(employeeId)) && (
              <p className="mt-2 text-xs text-orange-600 flex items-center gap-1.5">
                <Icon name="warning" size={14} /> Tento zaměstnanec označil tento den jako nedostupný.
              </p>
            )}
          </div>

          {/* Shift type quick-picks */}
          {shiftTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-black/70 mb-2">Typ směny</label>
              <div className="flex flex-wrap gap-1.5">
                {shiftTypes.map((t) => {
                  const active = start === t.startTime && end === t.endTime;
                  return (
                    <button
                      key={t.id}
                      onClick={() => applyShiftType(t)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-all inline-flex items-center gap-1.5 ${
                        active ? 'bg-[#C8F542] text-black border-transparent' : 'glass border-black/10 text-[#16181A] hover:bg-black/[0.05]'
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color ?? '#C8F542' }} />
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-black/70 mb-2">Od</label>
              <input
                type="time"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setType('flexible');
                }}
                className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-black/70 mb-2">Do</label>
              <input
                type="time"
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setType('flexible');
                }}
                className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving || !employeeId}
            className="w-full rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 hover:brightness-105 transition disabled:opacity-40"
          >
            {saving ? 'Přidávám…' : 'Přidat směnu'}
          </button>
        </div>
      </div>
    </div>
  );
}
