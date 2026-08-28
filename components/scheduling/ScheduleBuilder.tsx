'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { dayPrefLabel, prefAllowsSlot, parseTypePref } from '@/lib/dayPrefs';
import { Icon } from '../Icons';
import ShiftCalendar from './ShiftCalendar';
import { usePlan, UpgradeModal } from '../Pro';

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
  startsAtOpen?: boolean;
  endsAtClose?: boolean;
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

// Resolve a shift's display name + colour from the team's configured shift
// types — matched by name first, then by exact times — so the calendar always
// shows the configured naming instead of the legacy morning/afternoon labels.
function resolveShiftType(
  s: { type?: string; startTime?: string; endTime?: string },
  types: ShiftType[],
): { label: string; color: string } {
  const byName = types.find((t) => t.name === s.type);
  if (byName) return { label: byName.name, color: byName.color || '#64748B' };
  const byTime = types.find((t) => t.startTime === s.startTime && t.endTime === s.endTime);
  if (byTime) return { label: byTime.name, color: byTime.color || '#64748B' };
  const legacy = s.type ? SHIFT_LABEL[s.type] : undefined;
  if (legacy) return { label: legacy, color: s.type === 'morning' ? '#C8F542' : s.type === 'afternoon' ? '#3B82F6' : '#64748B' };
  return { label: s.type || 'Směna', color: '#64748B' };
}

// Opening hours are keyed 0=Mon..6=Sun; convert a 'YYYY-MM-DD' to that index.
function weekdayKey(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return String((d.getDay() + 6) % 7);
}

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// Step a 'YYYY-MM' string by whole months — lets the employer plan any month
// ahead (or look back), not just this one and the next.
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
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

type Tab = 'rozvrh' | 'kalendar' | 'typy' | 'oteviraci' | 'pevne' | 'pravidla';
const TABS: { id: Tab; label: string }[] = [
  { id: 'rozvrh', label: 'Rozvrh' },
  { id: 'kalendar', label: 'Kalendář' },
  { id: 'typy', label: 'Typy směn' },
  { id: 'oteviraci', label: 'Otevírací doba' },
  { id: 'pevne', label: 'Pevné dny' },
  { id: 'pravidla', label: 'Pravidla' },
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
  // Approved time off — a shift must never land on someone's holiday silently.
  const [timeOff, setTimeOff] = useState<{ employeeId: number; fromDate: string; toDate: string; status: string }[]>([]);
  // Events land in the planner too — a concert evening needs different staffing.
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editAvail, setEditAvail] = useState<{ id: number; name: string; avatar: string } | null>(null);
  const [dayModal, setDayModal] = useState<string | null>(null);
  const [publishNote, setPublishNote] = useState('');
  const { pro } = usePlan();
  const [upgradeFor, setUpgradeFor] = useState<string | null>(null);
  // Copy a whole week of shifts onto another week — the "typical week" workflow.
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySrc, setCopySrc] = useState('');
  const [copyDst, setCopyDst] = useState('');
  const [copying, setCopying] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const mondayOf = (d: Date) => {
    const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(12, 0, 0, 0);
    return x;
  };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const weekLabel = (mon: Date) => {
    const end = new Date(mon); end.setDate(end.getDate() + 6);
    return `${mon.getDate()}.${mon.getMonth() + 1}. – ${end.getDate()}.${end.getMonth() + 1}.`;
  };
  const weekOptions = (back: number, fwd: number) => {
    const base = mondayOf(new Date());
    const out: { value: string; label: string }[] = [];
    for (let i = -back; i <= fwd; i++) {
      const m = new Date(base); m.setDate(m.getDate() + i * 7);
      out.push({ value: iso(m), label: `${weekLabel(m)}${i === 0 ? ' (tento týden)' : ''}` });
    }
    return out;
  };
  const copyWeek = async () => {
    if (!copySrc || !copyDst || copySrc === copyDst) { setCopyMsg('Vyber dva různé týdny.'); return; }
    setCopying(true); setCopyMsg('');
    try {
      // Source shifts may live outside the loaded month — fetch both weeks' months.
      const months = new Set([copySrc.slice(0, 7), iso(new Date(new Date(copySrc + 'T12:00:00').getTime() + 6 * 86400000)).slice(0, 7)]);
      let source: Shift[] = [];
      for (const m of Array.from(months)) {
        const d = await fetch(`/api/schedule?month=${m}`).then(r => r.json()).catch(() => ({}));
        source = source.concat(Array.isArray(d?.shifts) ? d.shifts : []);
      }
      const srcStart = copySrc;
      const srcEnd = iso(new Date(new Date(copySrc + 'T12:00:00').getTime() + 6 * 86400000));
      const offsetDays = Math.round((new Date(copyDst + 'T12:00:00').getTime() - new Date(copySrc + 'T12:00:00').getTime()) / 86400000);
      const toCreate = source
        .filter(sh => sh.date >= srcStart && sh.date <= srcEnd)
        .map(sh => {
          const nd = new Date(sh.date + 'T12:00:00'); nd.setDate(nd.getDate() + offsetDays);
          return { employeeId: sh.employeeId, date: iso(nd), startTime: sh.startTime, endTime: sh.endTime, type: sh.type };
        });
      if (toCreate.length === 0) { setCopyMsg('Ve zdrojovém týdnu nejsou žádné směny.'); setCopying(false); return; }
      const res = await fetch('/api/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shifts: toCreate }),
      });
      if (res.ok) {
        setCopyMsg(`Hotovo — zkopírováno ${toCreate.length} směn. ✓`);
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        setCopyMsg(d.error || 'Kopírování se nepodařilo.');
      }
    } catch { setCopyMsg('Kopírování se nepodařilo.'); }
    setCopying(false);
  };
  const [publishing, setPublishing] = useState(false);
  const publish = async () => {
    setPublishing(true);
    try {
      const res = await fetch('/api/schedule/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        const n = Number(d.notified) || 0;
        setPublishNote(n === 0
          ? 'V tomhle měsíci zatím nikdo nemá směnu — není komu dát vědět.'
          : `Hotovo — rozvrh dostal${n === 1 ? '' : 'o'} ${n} ${n === 1 ? 'člověk' : n <= 4 ? 'lidi' : 'lidí'} jako notifikaci. Každá další změna se jim ukáže v „Moje směny".`);
      } else {
        setPublishNote(d.error || 'Publikování se nepodařilo — zkus to znovu.');
      }
    } catch {
      setPublishNote('Publikování se nepodařilo — zkus to znovu.');
    }
    setPublishing(false);
  };
  const [confirmClear, setConfirmClear] = useState(false);
  // Surfaced when an action on the board didn't reach the server.
  const [boardError, setBoardError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);

  // generate preview state
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<{ proposed: Proposed[]; warnings: string[] } | null>(null);
  const [adjust, setAdjust] = useState<{ changes: any[]; warnings: string[] } | null>(null);
  const [adjustSkipped, setAdjustSkipped] = useState<Set<number>>(new Set());
  const [adjusting, setAdjusting] = useState(false);
  const [applyingAdjust, setApplyingAdjust] = useState(false);

  // "Automaticky upravit": check the SAVED month against the newest
  // availability and propose the smallest set of swaps/removals.
  const runAdjust = async () => {
    setAdjusting(true); setBoardError('');
    try {
      const res = await fetch('/api/schedule/adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setBoardError(d.error || 'Kontrola se nepodařila.');
      else { setAdjust({ changes: d.changes ?? [], warnings: d.warnings ?? [] }); setAdjustSkipped(new Set()); }
    } catch { setBoardError('Kontrola se nepodařila.'); }
    setAdjusting(false);
  };

  const applyAdjust = async () => {
    if (!adjust) return;
    const chosen = adjust.changes.filter((_, i) => !adjustSkipped.has(i));
    if (chosen.length === 0) { setAdjust(null); return; }
    setApplyingAdjust(true); setBoardError('');
    try {
      const res = await fetch('/api/schedule/adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, commit: true, changes: chosen }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setBoardError(d.error || 'Úpravy se nepodařilo uložit.');
      else { setAdjust(null); await load(); }
    } catch { setBoardError('Úpravy se nepodařilo uložit.'); }
    setApplyingAdjust(false);
  };
  const [committing, setCommitting] = useState(false);
  const [clearBeforeCommit, setClearBeforeCommit] = useState(true);

  // import preview state
  const [importPreview, setImportPreview] = useState<{ rows: any[]; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const employees = useMemo(() => members.filter((m) => m.role === 'employee'), [members]);
  // Assignable to shifts = employees + the employer (who can also work a shift).
  const assignable = useMemo(() => members.filter((m) => m.role === 'employee' || m.role === 'employer'), [members]);
  const grid = useMemo(() => buildGrid(month), [month]);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, aRes, sRes, stRes, faRes, ohRes, toRes] = await Promise.all([
        fetch('/api/teams'),
        fetch(`/api/availability?month=${month}`),
        fetch(`/api/schedule?month=${month}`),
        fetch('/api/shift-types'),
        fetch('/api/fixed-assignments'),
        fetch('/api/opening-hours'),
        fetch('/api/timeoff'),
      ]);
      const [tData, aData, sData, stData, faData, ohData, toData] = await Promise.all([
        tRes.json(),
        aRes.json(),
        sRes.json(),
        stRes.json(),
        faRes.json(),
        ohRes.json(),
        toRes.json(),
      ]);
      setMembers(tData.members ?? []);
      setSubmissions(aData.submissions ?? []);
      setShifts(sData.shifts ?? []);
      setShiftTypes(stData.shiftTypes ?? []);
      setFixed(faData.assignments ?? []);
      setOpeningHours(ohData.openingHours ?? {});
      setTimeOff(Array.isArray(toData?.requests) ? toData.requests.filter((r: any) => r.status === 'approved') : []);
      fetch('/api/events').then(r => r.json())
        .then(d => setEvents((Array.isArray(d.events) ? d.events : []).filter((e: any) => e.status !== 'cancelled')))
        .catch(() => {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setPublishNote('');
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

  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    events.forEach(e => { (map[e.date] ||= []).push(e); });
    return map;
  }, [events]);

  const unavailableOn = (date: string) => {
    const set = new Set(
      submissions
        .filter((s) => (s.unavailableDates ?? []).includes(date) || s.dayPreferences?.[date] === 'off')
        .map((s) => s.employeeId),
    );
    // Approved holiday counts as unavailable — the whole point of approving it.
    timeOff.forEach(t => {
      if (t.fromDate <= date && date <= t.toDate) set.add(t.employeeId);
    });
    return set;
  };

  const addShift = async (payload: { employeeId: number; date: string; startTime: string; endTime: string; type: string }) => {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shifts: [payload] }),
    }).catch(() => null);
    if (res?.ok) { await load(); return true; }
    const d = res ? await res.json().catch(() => ({} as any)) : {};
    setBoardError(d?.error || 'Směnu se nepodařilo přidat.');
    return false;
  };

  const removeShift = async (id: number) => {
    const res = await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) setShifts((prev) => prev.filter((s) => s.id !== id));
    else setBoardError('Směnu se nepodařilo smazat.');
  };

  const clearMonth = async () => {
    const res = await fetch(`/api/schedule?month=${month}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      setShifts([]);
      setConfirmClear(false);
    } else {
      setBoardError('Vymazání měsíce se nepodařilo.');
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
      // The server wipes + inserts in one request — a failed save must leave
      // the existing schedule untouched, not deleted.
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, commit: true, replaceMonth: clearBeforeCommit, shifts: preview.proposed }),
      }).catch(() => null);
      if (res?.ok) {
        setPreview(null);
        await load();
      } else {
        const d = res ? await res.json().catch(() => ({} as any)) : {};
        setBoardError(d?.error || 'Uložení rozvrhu se nepodařilo — nic se nezměnilo, zkus to znovu.');
      }
    } finally {
      setCommitting(false);
    }
  };

  // ---- CSV export ----
  const exportCsv = () => {
    if (!pro) { setUpgradeFor('Export CSV'); return; }
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
      }).catch(() => null);
      if (res?.ok) {
        setImportPreview(null);
        await load();
      } else {
        const d = res ? await res.json().catch(() => ({} as any)) : {};
        setBoardError(d?.error || 'Import se nepodařilo uložit.');
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A]">Rozvrh směn</h1>
          <p className="text-black/45 mt-1">Sestav měsíční rozvrh podle dostupnosti týmu.</p>
        </div>
        {/* Month selector — arrows for any month, chips for the usual ones.
            Only the schedule grid is month-scoped; the calendar and the
            settings tabs bring their own navigation. */}
        {boardError && (
          <div className="w-full rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm font-medium text-red-600 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><Icon name="warning" size={16} /> {boardError}</span>
            <button onClick={() => setBoardError('')} className="shrink-0 text-red-600/60 hover:text-red-600">✕</button>
          </div>
        )}

        {tab === 'rozvrh' && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 glass rounded-full p-1">
            <button
              onClick={() => setMonth(shiftMonth(month, -1))}
              title="Předchozí měsíc"
              className="h-9 w-9 grid place-items-center rounded-full text-black/55 hover:text-black hover:bg-black/[0.06] transition"
            >
              <Icon name="chevron" size={17} className="rotate-90" />
            </button>
            <span className="px-2 min-w-[9.5rem] text-center text-sm font-semibold capitalize text-[#16181A] tabular-nums">
              {monthLabel(month)}
            </span>
            <button
              onClick={() => setMonth(shiftMonth(month, 1))}
              title="Další měsíc"
              className="h-9 w-9 grid place-items-center rounded-full text-black/55 hover:text-black hover:bg-black/[0.06] transition"
            >
              <Icon name="chevron" size={17} className="-rotate-90" />
            </button>
          </div>
          {/* Quick jumps; the current month doubles as "back to today". */}
          <div className="flex gap-1 glass rounded-full p-1 max-w-full overflow-x-auto">
            {[currentMonth, nextMonth].map((m) => (
              <button
                key={m}
                onClick={() => setMonth(m)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium capitalize whitespace-nowrap transition ${
                  month === m ? 'bg-[#16181A] text-white font-semibold' : 'text-black/55 hover:text-black hover:bg-black/[0.06]'
                }`}
              >
                {m === currentMonth ? 'Tento měsíc' : 'Příští měsíc'}
              </button>
            ))}
          </div>
        </div>
        )}
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
      ) : tab === 'kalendar' ? (
        <div className="space-y-3">
          <p className="text-sm text-black/50">
            Kdo kdy pracoval, kdo udělal uzávěrku a kde chybí.
          </p>
          <ShiftCalendar />
        </div>
      ) : tab === 'typy' ? (
        <ShiftTypesManager shiftTypes={shiftTypes} onReload={reloadTypes} />
      ) : tab === 'oteviraci' ? (
        <OpeningHoursEditor value={openingHours} onSaved={(v) => setOpeningHours(v)} />
      ) : tab === 'pevne' ? (
        <FixedAssignmentsManager
          employees={assignable}
          shiftTypes={shiftTypes}
          assignments={fixed}
          onReload={reloadFixed}
        />
      ) : tab === 'pravidla' ? (
        <ScheduleRulesManager />
      ) : (
        <>
          {/* Availability summary */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="users" size={20} className="text-black/70 shrink-0" />
                <h2 className="font-bold text-[#16181A] truncate">Dostupnost týmu</h2>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                submissions.length >= employees.length && employees.length > 0
                  ? 'bg-[#C8F542]/20 text-[#5B7A08]' : 'bg-black/[0.05] text-black/50'
              }`}>
                {submissions.length}/{employees.length} odesláno
              </span>
            </div>
            {employees.length === 0 ? (
              <p className="text-black/45 text-sm">Zatím nemáš v týmu žádné zaměstnance.</p>
            ) : (
              <div className="space-y-3">
                {/* One row per person, responsive columns — readable at every width. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {submissions.map((s) => {
                    const blocked = (s.unavailableDates ?? []).length;
                    return (
                      <button
                        key={s.employeeId}
                        onClick={() => setExpanded(expanded === s.employeeId ? null : s.employeeId)}
                        className={`flex items-center gap-2.5 min-w-0 rounded-2xl px-3 py-2.5 text-sm border text-left transition-all ${
                          expanded === s.employeeId
                            ? 'bg-[#C8F542]/15 border-[#C8F542]/40 text-[#16181A]'
                            : 'bg-[#C8F542]/[0.08] border-[#C8F542]/20 text-black/80 hover:bg-[#C8F542]/15'
                        }`}
                      >
                        <span className="text-lg flex-shrink-0">{s.employeeAvatar}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{s.employeeName}</span>
                          <span className="block text-[11px] text-black/45 truncate">
                            {blocked === 0 ? 'bez omezení' : `nemůže ${blocked} ${blocked === 1 ? 'den' : blocked <= 4 ? 'dny' : 'dní'}`}
                          </span>
                        </span>
                        <Icon name="check" size={15} className="text-[#5B7A08] flex-shrink-0" />
                      </button>
                    );
                  })}
                  {notSubmitted.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setEditAvail({ id: e.id, name: e.name, avatar: e.avatar ?? '👤' })}
                      title="Vyplnit dostupnost za tohoto člověka"
                      className="flex items-center gap-2.5 min-w-0 rounded-2xl px-3 py-2.5 text-sm bg-black/[0.03] border border-black/[0.08] text-black/45 text-left hover:bg-black/[0.06] transition"
                    >
                      <span className="text-lg opacity-60 flex-shrink-0">{e.avatar ?? '👤'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{e.name}</span>
                        <span className="block text-[11px] uppercase tracking-wide text-black/30">čeká na vyplnění · vyplnit za něj</span>
                      </span>
                    </button>
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
                        {(() => {
                          const prefTypes = shiftTypes.map((t) => ({ id: t.id, name: t.name, start: t.startTime }));
                          const prefs = Object.entries(s.dayPreferences ?? {})
                            .filter(([d, v]) => (v === 'morning' || v === 'afternoon' || /^type:\d+$/.test(String(v))) && d.startsWith(month + '-'))
                            .sort(([a], [b]) => a.localeCompare(b));
                          const kinds = Array.from(new Set(prefs.map(([, v]) => String(v))));
                          const CHIP_TONES = ['bg-amber-500/15 text-amber-700', 'bg-indigo-500/15 text-indigo-600', 'bg-purple-500/15 text-purple-700', 'bg-teal-500/15 text-teal-700'];
                          const chips = (kind: string, tone: string) => {
                            const list = prefs.filter(([, v]) => v === kind);
                            if (!list.length) return null;
                            const lbl = dayPrefLabel(kind, prefTypes) ?? kind;
                            return (
                              <div key={kind} className="text-black/60">
                                {lbl.charAt(0).toUpperCase() + lbl.slice(1)} ({list.length}):{' '}
                                <span className="inline-flex flex-wrap gap-1 mt-1 align-middle">
                                  {list.map(([d]) => (
                                    <span key={d} className={`rounded-md px-1.5 py-0.5 text-xs ${tone}`}>
                                      {parseInt(d.split('-')[2])}.{parseInt(d.split('-')[1])}.
                                    </span>
                                  ))}
                                </span>
                              </div>
                            );
                          };
                          return (
                            <>
                              {kinds.map((k, i) => chips(k, CHIP_TONES[i % CHIP_TONES.length]))}
                              {prefs.length > 0 && (
                                <p className="text-[11px] text-black/40">
                                  Denní volby jsou závazné — generátor jiný typ směny ten den nenasadí.
                                </p>
                              )}
                            </>
                          );
                        })()}
                        {s.note && <p className="text-black/60">Poznámka: <span className="text-[#16181A]/90">{s.note}</span></p>}
                        <button
                          onClick={() => setEditAvail({ id: s.employeeId, name: s.employeeName, avatar: s.employeeAvatar })}
                          className="mt-1 rounded-full glass border border-black/10 text-[#16181A] px-4 py-2 text-xs font-semibold hover:bg-black/[0.05] transition">
                          ✏️ Upravit dostupnost
                        </button>
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
              className="rounded-full bg-[#16181A] text-white font-semibold px-4 py-2.5 whitespace-nowrap hover:brightness-125 transition inline-flex items-center gap-2 disabled:opacity-50"
            >
              <span>✨</span> {generating ? 'Generuji…' : 'Vygenerovat rozvrh'}
            </button>
            <button
              onClick={runAdjust}
              disabled={adjusting || shifts.length === 0}
              title={shifts.length === 0 ? 'Nejdřív musí existovat uložený rozvrh' : 'Zkontroluje uložený rozvrh proti nejnovější dostupnosti a navrhne přeobsazení'}
              className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] font-semibold px-4 py-2.5 whitespace-nowrap transition inline-flex items-center gap-2 disabled:opacity-40"
            >
              <span>🪄</span> {adjusting ? 'Kontroluji…' : 'Upravit podle nových požadavků'}
            </button>
            <button
              onClick={publish}
              disabled={publishing}
              className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2.5 whitespace-nowrap hover:brightness-105 transition inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Icon name="check" size={18} /> {publishing ? 'Posílám…' : 'Publikovat rozvrh'}
            </button>
            <button
              onClick={exportCsv}
              disabled={shifts.length === 0}
              className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-4 py-2.5 whitespace-nowrap transition inline-flex items-center gap-2 disabled:opacity-40"
            >
              <Icon name="trend" size={18} /> Export CSV
            </button>
            <button
              onClick={() => { setCopyOpen(true); setCopyMsg(''); setCopySrc(''); setCopyDst(''); }}
              className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-4 py-2.5 whitespace-nowrap transition inline-flex items-center gap-2"
            >
              <Icon name="swap" size={18} /> Kopírovat týden
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-4 py-2.5 whitespace-nowrap transition inline-flex items-center gap-2"
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
              className={`rounded-full px-4 py-2.5 whitespace-nowrap transition inline-flex items-center gap-2 border ${
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

          {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}
          {copyOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center modal-overlay p-4" onClick={() => setCopyOpen(false)}>
              <div className="modal-sheet rounded-3xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold tracking-tight text-[#16181A] mb-1">Kopírovat týden</h3>
                <p className="text-sm text-black/50 mb-4">Vezme všechny směny zdrojového týdne a naplánuje je do cílového (stejné dny, časy i lidi).</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Zkopírovat týden</label>
                    <select value={copySrc} onChange={(e) => setCopySrc(e.target.value)}
                      className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none">
                      <option value="">— vyber —</option>
                      {weekOptions(4, 0).map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Do týdne</label>
                    <select value={copyDst} onChange={(e) => setCopyDst(e.target.value)}
                      className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none">
                      <option value="">— vyber —</option>
                      {weekOptions(0, 5).map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                    </select>
                  </div>
                  {copyMsg && <p className={`text-sm ${copyMsg.includes('✓') ? 'text-[#5B7A08]' : 'text-red-600'}`}>{copyMsg}</p>}
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setCopyOpen(false)} className="flex-1 rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-5 py-3 text-sm hover:bg-black/[0.08] transition">Zavřít</button>
                  <button onClick={copyWeek} disabled={copying || !copySrc || !copyDst}
                    className="flex-1 rounded-full bg-[#16181A] text-white font-semibold px-5 py-3 text-sm hover:bg-black disabled:opacity-50 transition">
                    {copying ? 'Kopíruji…' : 'Zkopírovat'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {publishNote && (
            <div className="glass-card p-4 flex items-start gap-3 border border-[#C8F542]/20">
              <Icon name="check" size={20} className="text-[#5B7A08] mt-0.5" />
              <p className="text-sm text-black/70">{publishNote}</p>
            </div>
          )}

          {/* Adjust-to-new-requests preview */}
          {adjust && (
            <div className="rounded-3xl border border-[#0A84FF]/30 bg-[#0A84FF]/[0.06] p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-bold text-[#16181A]">
                  🪄 Úprava podle nových požadavků
                  <span className="ml-2 text-sm font-medium text-black/50">
                    {adjust.changes.length === 0
                      ? 'Všechno sedí — žádná směna není v rozporu s dostupností.'
                      : `${adjust.changes.length} ${adjust.changes.length === 1 ? 'navržená změna' : adjust.changes.length <= 4 ? 'navržené změny' : 'navržených změn'}`}
                  </span>
                </p>
                <button onClick={() => setAdjust(null)} className="text-black/40 hover:text-black text-sm font-medium">Zavřít ✕</button>
              </div>
              {adjust.changes.length > 0 && (
                <>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                    {adjust.changes.map((ch: any, i: number) => (
                      <div key={i} className={`flex items-center gap-2.5 rounded-2xl bg-white/60 border border-black/[0.06] px-3.5 py-2.5 text-sm flex-wrap transition ${adjustSkipped.has(i) ? 'opacity-45' : ''}`}>
                        <input type="checkbox" checked={!adjustSkipped.has(i)}
                          onChange={() => setAdjustSkipped(prev => {
                            const n = new Set(prev);
                            if (n.has(i)) n.delete(i); else n.add(i);
                            return n;
                          })}
                          className="h-[18px] w-[18px] rounded accent-[#8FB811] shrink-0" />
                        <span className="font-semibold tabular-nums text-[#16181A] shrink-0 w-14">{parseInt(ch.date.split('-')[2])}.{parseInt(ch.date.split('-')[1])}.</span>
                        <span className="text-black/45 tabular-nums shrink-0">{ch.startTime}–{ch.endTime}</span>
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <span>{ch.fromAvatar}</span>
                          <span className="font-medium text-[#16181A] truncate">{ch.fromName}</span>
                        </span>
                        {ch.action === 'reassign' ? (
                          <>
                            <span className="text-black/35">→</span>
                            <span className="inline-flex items-center gap-1 min-w-0">
                              <span>{ch.toAvatar}</span>
                              <span className="font-semibold text-[#5B7A08] truncate">{ch.toName}</span>
                            </span>
                          </>
                        ) : (
                          <span className="rounded-full bg-red-500/12 text-red-600 px-2.5 py-0.5 text-xs font-bold">zrušit — nikdo nemůže</span>
                        )}
                        <span className="text-xs text-black/40 w-full sm:w-auto sm:ml-auto">({ch.reason})</span>
                      </div>
                    ))}
                  </div>
                  {adjust.warnings.length > 0 && (
                    <ul className="text-xs text-orange-700 space-y-0.5">
                      {adjust.warnings.slice(0, 10).map((w, i) => <li key={i}>⚠ {w}</li>)}
                    </ul>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={applyAdjust}
                      disabled={applyingAdjust || adjust.changes.length === adjustSkipped.size}
                      className="rounded-full bg-[#16181A] text-white font-semibold px-5 py-2.5 text-sm hover:bg-black disabled:opacity-50 transition">
                      {applyingAdjust ? 'Ukládám…' : `Použít vybrané (${adjust.changes.length - adjustSkipped.size})`}
                    </button>
                    <button onClick={() => setAdjust(null)} className="rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-5 py-2.5 text-sm hover:bg-black/[0.08] transition">
                      Zahodit
                    </button>
                    <span className="text-[11px] text-black/40">
                      Odškrtni, co měnit nechceš. Důvody vycházejí z uložené dostupnosti — když nesedí,
                      oprav ji v „Dostupnost týmu" → Upravit dostupnost. Dotčení lidé dostanou notifikaci.
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Generated preview banner */}
          {preview && (
            <div className="glass-card p-5 border border-[#C8F542]/40 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h3 className="font-bold text-[#16181A] flex items-center gap-2">
                    <span>✨</span> Navržený rozvrh
                  </h3>
                  <p className="text-sm text-black/55 mt-0.5">
                    {preview.proposed.length} navržených směn
                    {preview.warnings.length > 0 && ` · ${preview.warnings.length} upozornění`}. Zkontroluj náhled v
                    kalendáři (zvýrazněno) a ulož.
                  </p>
                </div>
                <button onClick={() => setPreview(null)} className="text-black/45 hover:text-black text-sm whitespace-nowrap flex-shrink-0">
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

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={commitPreview}
                  disabled={committing || preview.proposed.length === 0}
                  className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2.5 whitespace-nowrap hover:brightness-105 transition disabled:opacity-40 inline-flex items-center gap-2"
                >
                  <Icon name="check" size={18} /> {committing ? 'Ukládám…' : 'Potvrdit a uložit'}
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-4 py-2.5 whitespace-nowrap transition"
                >
                  Zrušit
                </button>
              </div>
            </div>
          )}

          {/* Calendar grid */}
          <div className="glass-card p-3 sm:p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-bold text-[#16181A] capitalize flex items-center gap-2">
                <Icon name="calendar" size={20} /> {monthLabel(month)}
              </h2>
              <div className="flex items-center gap-3 text-xs flex-wrap">
                {shiftTypes.map((t) => (
                  <span key={t.id} className="flex items-center gap-1.5 text-black/55">
                    <span className="h-3 w-3 rounded-md" style={{ backgroundColor: t.color ?? '#C8F542' }} /> {t.name}
                  </span>
                ))}
                {preview && (
                  <span className="flex items-center gap-1.5 text-black/55">
                    <span className="h-3 w-3 rounded-md border-2 border-dashed border-[#5B7A08]" /> Návrh
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
              {CZ_DAYS.map((d) => (
                <div key={d} className="text-center text-[11px] font-medium text-black/35 py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {grid.map((cell, i) => {
                if (!cell) return <div key={i} />;
                const day = parseInt(cell.split('-')[2]);
                const dayShifts = shiftsByDay[cell] ?? [];
                const dayProposed = proposedByDay[cell] ?? [];
                return (
                  <button
                    key={cell}
                    onClick={() => setDayModal(cell)}
                    className="min-h-[84px] min-w-0 rounded-xl bg-black/[0.03] border border-black/[0.08] hover:border-[#C8F542]/40 hover:bg-black/[0.04] p-1 sm:p-1.5 text-left transition-all flex flex-col gap-1 overflow-hidden"
                  >
                    <span className="text-[11px] sm:text-xs font-medium text-black/55">{day}</span>
                    <div className="flex flex-col gap-1 min-w-0 overflow-hidden">
                      {(eventsByDate[cell] ?? []).map((ev: any) => (
                        <span key={`e-${ev.id}`} title={`Akce: ${ev.title}${ev.startTime ? ` od ${ev.startTime}` : ''}`}
                          className="flex items-center gap-1 min-w-0 rounded-md px-1 py-0.5 text-[11px] font-semibold overflow-hidden bg-[#0A84FF]/12 text-[#0A6FE0]">
                          <span className="flex-shrink-0">📅</span>
                          <span className="truncate min-w-0">{ev.title}</span>
                        </span>
                      ))}
                      {dayShifts.slice(0, 3).map((s) => {
                        const rt = resolveShiftType(s, shiftTypes);
                        return (
                          <span
                            key={s.id}
                            title={`${s.employeeName} · ${rt.label} · ${s.startTime}–${s.endTime}`}
                            className="flex items-center gap-1 min-w-0 rounded-md px-1 py-0.5 text-[11px] font-medium overflow-hidden bg-black/[0.05] text-black/70"
                          >
                            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: rt.color }} />
                            <span className="flex-shrink-0">{s.employeeAvatar}</span>
                            <span className="truncate min-w-0">{s.startTime}</span>
                          </span>
                        );
                      })}
                      {dayShifts.length > 3 && (
                        <span className="text-[11px] text-black/45">+{dayShifts.length - 3} další</span>
                      )}
                      {/* proposed (preview) */}
                      {dayProposed.slice(0, 3).map((p, idx) => (
                        <span
                          key={`p-${idx}`}
                          title={`Návrh: ${p.employeeName} · ${p.shiftTypeName} ${p.startTime}–${p.endTime}${(p as any).split ? ' (část směny)' : ''}`}
                          className="flex items-center gap-1 min-w-0 rounded-md px-1 py-0.5 text-[11px] font-medium overflow-hidden border border-dashed border-[#5B7A08]/60 bg-[#C8F542]/10 text-[#5B7A08]"
                        >
                          <span className="flex-shrink-0">✨{p.employeeAvatar}</span>
                          <span className="truncate min-w-0">{p.startTime}</span>
                        </span>
                      ))}
                      {dayProposed.length > 3 && (
                        <span className="text-[11px] text-[#5B7A08]/70">+{dayProposed.length - 3} návrh</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {editAvail && (
        <EditAvailabilityModal
          member={editAvail}
          month={month}
          shiftTypes={shiftTypes}
          initial={submissions.find((x) => x.employeeId === editAvail.id) ?? null}
          onClose={() => setEditAvail(null)}
          onSaved={() => { setEditAvail(null); load(); }}
        />
      )}

      {/* Day modal */}
      {dayModal && (
        <DayModal
          date={dayModal}
          employees={assignable}
          shifts={shiftsByDay[dayModal] ?? []}
          proposed={proposedByDay[dayModal] ?? []}
          events={eventsByDate[dayModal] ?? []}
          shiftTypes={shiftTypes}
          openingHours={openingHours}
          unavailable={unavailableOn(dayModal)}
          submissions={submissions}
          onClose={() => setDayModal(null)}
          onAdd={addShift}
          onRemove={removeShift}
          onRemoveProposed={(p) =>
            setPreview((prev) => prev && ({
              ...prev,
              proposed: prev.proposed.filter(
                (x) => !(x.date === p.date && x.employeeId === p.employeeId && x.startTime === p.startTime),
              ),
            }))
          }
        />
      )}

      {/* Import preview modal */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center modal-overlay p-0 md:p-4">
          <div className="modal-sheet rounded-3xl rounded-b-none md:rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-bold text-[#16181A] min-w-0 truncate">Náhled importu</h3>
              <button onClick={() => setImportPreview(null)} className="text-black/45 hover:text-black text-2xl leading-none flex-shrink-0">
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
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-xs">
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
                          <td className="px-3 py-1.5">{resolveShiftType(r, shiftTypes).label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
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

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                onClick={confirmImport}
                disabled={importing || importPreview.rows.length === 0}
                className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2.5 whitespace-nowrap hover:brightness-105 transition disabled:opacity-40"
              >
                {importing ? 'Importuji…' : `Importovat ${importPreview.rows.length} směn`}
              </button>
              <button
                onClick={() => setImportPreview(null)}
                className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-4 py-2.5 whitespace-nowrap transition"
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
  const [startsAtOpen, setStartsAtOpen] = useState(false);
  const [endsAtClose, setEndsAtClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const beginNew = () => {
    setEditing('new');
    setName('');
    setStart('06:00');
    setEnd('14:00');
    setColor(COLORS[0]);
    setStartsAtOpen(false);
    setEndsAtClose(false);
  };
  const beginEdit = (t: ShiftType) => {
    setEditing(t.id);
    setName(t.name);
    setStart(t.startTime);
    setEnd(t.endTime);
    setColor(t.color ?? COLORS[0]);
    setStartsAtOpen(!!t.startsAtOpen);
    setEndsAtClose(!!t.endsAtClose);
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const payload = { name: name.trim(), startTime: start, endTime: end, color, startsAtOpen, endsAtClose };
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
    setErr('');
    const t = shiftTypes.find(x => x.id === id);
    if (!confirm(`Smazat typ směny „${t?.name ?? ''}"? Naplánované směny tohoto typu zůstanou, ale ztratí barvu i název.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shift-types/${id}`, { method: 'DELETE' });
      if (!res.ok) setErr('Typ směny se nepodařilo smazat.');
      await onReload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card p-5 space-y-4">
      {err && <p className="text-sm font-medium text-red-600">{err}</p>}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="clock" size={20} className="text-black/70 flex-shrink-0" />
          <h2 className="font-bold text-[#16181A] truncate">Typy směn</h2>
        </div>
        <button
          onClick={beginNew}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2 whitespace-nowrap flex-shrink-0 hover:brightness-105 transition inline-flex items-center gap-1.5 text-sm"
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
              startsAtOpen={startsAtOpen}
              endsAtClose={endsAtClose}
              busy={busy}
              setName={setName}
              setStart={setStart}
              setEnd={setEnd}
              setColor={setColor}
              setStartsAtOpen={setStartsAtOpen}
              setEndsAtClose={setEndsAtClose}
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
                  {t.startsAtOpen ? 'otevření' : t.startTime}–{t.endsAtClose ? 'zavření' : t.endTime}
                </p>
              </div>
              <button onClick={() => beginEdit(t)} className="text-black/50 hover:text-[#16181A] p-1.5 flex-shrink-0" title="Upravit">
                <Icon name="settings" size={18} />
              </button>
              <button onClick={() => remove(t.id)} className="text-black/30 hover:text-red-600 p-1.5 flex-shrink-0" title="Smazat">
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
            startsAtOpen={startsAtOpen}
            endsAtClose={endsAtClose}
            busy={busy}
            setName={setName}
            setStart={setStart}
            setEnd={setEnd}
            setColor={setColor}
            setStartsAtOpen={setStartsAtOpen}
            setEndsAtClose={setEndsAtClose}
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
  startsAtOpen,
  endsAtClose,
  busy,
  setName,
  setStart,
  setEnd,
  setColor,
  setStartsAtOpen,
  setEndsAtClose,
  onSave,
  onCancel,
}: {
  name: string;
  start: string;
  end: string;
  color: string;
  startsAtOpen: boolean;
  endsAtClose: boolean;
  busy: boolean;
  setName: (v: string) => void;
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
  setColor: (v: string) => void;
  setStartsAtOpen: (v: boolean) => void;
  setEndsAtClose: (v: boolean) => void;
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
          {startsAtOpen ? (
            <div className="w-full rounded-2xl bg-black/[0.03] border border-black/[0.08] px-4 py-3 text-sm text-black/45">Otevření podniku</div>
          ) : (
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none" />
          )}
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-black/55 mb-1">Do</label>
          {endsAtClose ? (
            <div className="w-full rounded-2xl bg-black/[0.03] border border-black/[0.08] px-4 py-3 text-sm text-black/45">Zavření podniku</div>
          ) : (
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none" />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-black/70 cursor-pointer">
          <input type="checkbox" checked={startsAtOpen} onChange={(e) => setStartsAtOpen(e.target.checked)} className="h-4 w-4 accent-[#8FB811]" />
          Začíná otevřením podniku
        </label>
        <label className="flex items-center gap-2 text-sm text-black/70 cursor-pointer">
          <input type="checkbox" checked={endsAtClose} onChange={(e) => setEndsAtClose(e.target.checked)} className="h-4 w-4 accent-[#8FB811]" />
          Končí zavřením podniku <span className="text-black/35">(do konce směny)</span>
        </label>
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
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={busy || !name.trim()}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2 text-sm whitespace-nowrap hover:brightness-105 transition disabled:opacity-40"
        >
          {busy ? 'Ukládám…' : 'Uložit'}
        </button>
        <button onClick={onCancel} className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.05] px-4 py-2 text-sm whitespace-nowrap transition">
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
              <span className="w-24 font-medium text-[#16181A] truncate">{label}</span>
              <button
                onClick={() => update(d, { closed: !day.closed })}
                className={`rounded-full px-3 py-1.5 text-xs font-medium border whitespace-nowrap flex-shrink-0 transition-all ${
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2.5 whitespace-nowrap hover:brightness-105 transition disabled:opacity-50"
        >
          {saving ? 'Ukládám…' : 'Uložit otevírací dobu'}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-[#5B7A08] text-sm font-medium whitespace-nowrap">
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
  const [err, setErr] = useState('');

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
    setErr('');
    if (!confirm('Smazat pevné přiřazení? Z příštího generování rozpisu vypadne.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/fixed-assignments?id=${id}`, { method: 'DELETE' });
      if (!res.ok) setErr('Přiřazení se nepodařilo smazat.');
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
      {err && <p className="text-sm font-medium text-red-600">{err}</p>}
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
                        className="flex items-center gap-2 max-w-full rounded-full pl-1.5 pr-2 py-1.5 text-sm bg-black/[0.03] border border-black/[0.08] text-[#16181A]"
                      >
                        <span className="text-base flex-shrink-0">{a.employeeAvatar}</span>
                        <span className="min-w-0 truncate">{a.employeeName}</span>
                        <select
                          value={a.shiftTypeId ?? ''}
                          onChange={async (e) => {
                            const v = e.target.value === '' ? null : parseInt(e.target.value);
                            const res = await fetch('/api/fixed-assignments', {
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: a.id, shiftTypeId: v }),
                            }).catch(() => null);
                            if (res?.ok) await onReload();
                            else setErr('Změnu se nepodařilo uložit.');
                          }}
                          className="text-xs text-black/55 bg-transparent border-0 focus:outline-none cursor-pointer max-w-[140px] truncate"
                          title="Změnit typ směny"
                        >
                          <option value="">libovolná</option>
                          {shiftTypes.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => remove(a.id)}
                          className="text-black/30 hover:text-red-600 pl-1 flex-shrink-0"
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
  proposed = [],
  shiftTypes,
  openingHours,
  unavailable,
  submissions,
  onClose,
  onAdd,
  onRemove,
  onRemoveProposed,
  events = [],
}: {
  date: string;
  employees: Member[];
  shifts: Shift[];
  proposed?: Proposed[];
  shiftTypes: ShiftType[];
  openingHours: Record<string, OpeningDay>;
  unavailable: Set<number>;
  submissions: Submission[];
  onClose: () => void;
  onAdd: (p: { employeeId: number; date: string; startTime: string; endTime: string; type: string }) => Promise<boolean>;
  onRemove: (id: number) => void;
  onRemoveProposed?: (p: Proposed) => void;
  events?: any[];
}) {
  // Opening hours for THIS day (keyed 0=Mon..6=Sun).
  const oh = openingHours[weekdayKey(date)] as OpeningDay | undefined;
  const dayOpen = oh && !oh.closed ? oh.open : null;
  const dayClose = oh && !oh.closed ? oh.close : null;

  // Resolve a shift type's concrete times for this day (following open/close).
  const resolveTimes = (t: ShiftType) => ({
    start: t.startsAtOpen && dayOpen ? dayOpen : t.startTime,
    end: t.endsAtClose && dayClose ? dayClose : t.endTime,
  });

  const first = shiftTypes[0];
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  // The chosen type name ('' = manual custom time).
  const [typeName, setTypeName] = useState<string>(first ? first.name : '');
  const [start, setStart] = useState(first ? resolveTimes(first).start : '08:00');
  const [end, setEnd] = useState(first ? resolveTimes(first).end : '16:00');
  const [saving, setSaving] = useState(false);

  const applyShiftType = (t: ShiftType) => {
    const rt = resolveTimes(t);
    setStart(rt.start);
    setEnd(rt.end);
    setTypeName(t.name);
  };
  const pickCustom = () => setTypeName('');

  const save = async () => {
    if (!employeeId || !start || !end) return;
    // Warn if the chosen person marked this day off / unavailable, or prefers a
    // different kind of shift than the one being assigned.
    const emp = Number(employeeId);
    const sub = submissions.find((s) => s.employeeId === emp);
    const empName = employees.find((e) => e.id === emp)?.name ?? 'Zaměstnanec';
    const shiftCat = start < '12:00' ? 'morning' : 'afternoon';
    const dayPref = sub?.dayPreferences?.[date];
    const prefTypesForCheck = shiftTypes.map((t) => ({ id: t.id, name: t.name, start: t.startTime }));
    const slotTypeId = shiftTypes.find((t) => t.name === typeName)?.id ?? null;
    const prefBlocks = dayPref && dayPref !== 'off' && dayPref !== 'flexible'
      && !prefAllowsSlot(dayPref, { typeId: slotTypeId, start }, prefTypesForCheck);
    if (unavailable.has(emp)) {
      if (!confirm(`⚠️ ${empName} označil/a tento den jako NEDOSTUPNÝ. Opravdu ho/ji na směnu přiřadit?`)) return;
    } else if (prefBlocks) {
      if (!confirm(`⚠️ ${empName} má na tento den závaznou volbu „${dayPrefLabel(dayPref, prefTypesForCheck)}" — tahle směna jí neodpovídá. Opravdu přiřadit?`)) return;
    } else if (!dayPref && sub?.preferredShift && sub.preferredShift !== 'flexible' && sub.preferredShift !== shiftCat) {
      if (!confirm(`⚠️ ${empName} preferuje ${sub.preferredShift === 'morning' ? 'ranní' : 'odpolední'} směny. Přesto přiřadit na tuhle?`)) return;
    }
    setSaving(true);
    try {
      const ok = await onAdd({ employeeId: emp, date, startTime: start, endTime: end, type: typeName || 'Vlastní' });
      // Only a landed save clears the selection — a failure looking identical
      // to success is how shifts silently go missing.
      if (ok) setEmployeeId('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center modal-overlay p-0 md:p-4">
      <div className="modal-sheet rounded-3xl rounded-b-none md:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-bold text-[#16181A] capitalize min-w-0 truncate">{dayLabel(date)}</h3>
          <button onClick={onClose} className="text-black/45 hover:text-black text-2xl leading-none flex-shrink-0">
            ×
          </button>
        </div>

        {events.length > 0 && events.map((ev: any) => (
          <div key={ev.id} className="rounded-2xl bg-[#0A84FF]/[0.07] border border-[#0A84FF]/25 px-4 py-3">
            <p className="text-sm font-bold text-[#16181A]">📅 {ev.title}</p>
            <p className="text-xs text-black/50 mt-0.5">
              {ev.startTime ? `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ''}` : 'celý den'}
              {ev.location ? ` · 📍 ${ev.location}` : ''}
              {ev.crewPeople?.length ? ` · na akci: ${ev.crewPeople.map((p: any) => p.name).join(', ')}` : ' · zatím bez obsazení'}
            </p>
          </div>
        ))}

        {/* Existing shifts */}
        {shifts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-black/45">Přiřazené směny</p>
            {shifts.map((s) => {
              const rt = resolveShiftType(s, shiftTypes);
              return (
              <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 py-2">
                <span className="text-lg flex-shrink-0">{s.employeeAvatar}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#16181A] truncate">{s.employeeName}</p>
                  <p className="text-xs text-black/45">
                    {s.startTime}–{s.endTime}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap flex-shrink-0 bg-black/[0.05] text-black/70">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: rt.color }} />
                  {rt.label}
                </span>
                <button onClick={() => onRemove(s.id)} className="text-black/30 hover:text-red-600 transition p-1 flex-shrink-0" title="Odebrat">
                  ×
                </button>
              </div>
              );
            })}
          </div>
        )}

        {/* Auto-generated proposal for this day — the review the calendar icons can't give. */}
        {proposed.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[#5B7A08] font-semibold">✨ Navržené směny (náhled — zatím neuloženo)</p>
            {proposed.map((p, idx) => (
              <div key={`prop-${idx}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-[#5B7A08]/50 bg-[#C8F542]/[0.08] px-3 py-2">
                <span className="text-lg flex-shrink-0">{p.employeeAvatar}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#16181A] truncate">{p.employeeName}</p>
                  <p className="text-xs text-black/45">{p.startTime}–{p.endTime}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap flex-shrink-0 bg-[#C8F542]/25 text-[#5B7A08]">
                  {p.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />}
                  {p.shiftTypeName || 'Směna'}
                </span>
                {onRemoveProposed && (
                  <button onClick={() => onRemoveProposed(p)}
                    className="text-black/30 hover:text-red-600 transition p-1 flex-shrink-0" title="Vyhodit z návrhu">
                    ×
                  </button>
                )}
              </div>
            ))}
            <p className="text-[11px] text-black/40">Uloží se až tlačítkem „Uložit rozvrh" v náhledu.</p>
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
                      <span className="text-lg flex-shrink-0">{e.avatar ?? '👤'}</span>
                      <span className="flex-1 min-w-0 truncate text-sm text-[#16181A]">{e.name}</span>
                      {blocked && (
                        <span className="flex items-center gap-1 text-xs text-orange-600 font-medium whitespace-nowrap flex-shrink-0">
                          <Icon name="warning" size={14} /> nemůže
                        </span>
                      )}
                      {!blocked && sub?.preferredShift && sub.preferredShift !== 'flexible' && (
                        <span className="text-xs text-[#5B7A08]/80 whitespace-nowrap flex-shrink-0">preferuje {sub.preferredShift === 'morning' ? 'ranní' : 'odpolední'}</span>
                      )}
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

          {/* Shift type quick-picks — from the team's configured types */}
          <div>
            <label className="block text-sm font-medium text-black/70 mb-2">Typ směny</label>
            <div className="flex flex-wrap gap-1.5">
              {shiftTypes.map((t) => {
                const rt = resolveTimes(t);
                const active = typeName === t.name;
                return (
                  <button
                    key={t.id}
                    onClick={() => applyShiftType(t)}
                    title={`${rt.start}–${rt.end}`}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium border whitespace-nowrap transition-all inline-flex items-center gap-1.5 ${
                      active ? 'bg-[#C8F542] text-black border-transparent' : 'glass border-black/10 text-[#16181A] hover:bg-black/[0.05]'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color ?? '#C8F542' }} />
                    {t.name}
                    {(t.startsAtOpen || t.endsAtClose) && <span className={`text-[11px] ${active ? 'text-black/50' : 'text-black/35'}`}>{rt.start}–{rt.end}</span>}
                  </button>
                );
              })}
              <button
                onClick={pickCustom}
                className={`rounded-full px-3 py-1.5 text-sm font-medium border whitespace-nowrap transition-all ${
                  typeName === '' ? 'bg-[#16181A] text-white border-transparent' : 'glass border-black/10 text-[#16181A] hover:bg-black/[0.05]'
                }`}
              >
                Vlastní čas
              </button>
            </div>
            {typeName !== '' && (shiftTypes.find(t => t.name === typeName)?.endsAtClose) && !dayClose && (
              <p className="text-[11px] text-orange-600 mt-1.5">Tento den je zavřeno — použije se výchozí konec typu.</p>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-black/70 mb-2">Od</label>
              <input
                type="time"
                value={start}
                onChange={(e) => { setStart(e.target.value); pickCustom(); }}
                className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-black/70 mb-2">Do</label>
              <input
                type="time"
                value={end}
                onChange={(e) => { setEnd(e.target.value); pickCustom(); }}
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

// ---------------------------------------------------------------------------
// Pravidla generování — max dní v řadě, týmově + výjimky pro jednotlivce.
// ---------------------------------------------------------------------------
function ScheduleRulesManager() {
  const [teamMax, setTeamMax] = useState<string>('');
  const [teamMaxHours, setTeamMaxHours] = useState<string>('');
  const [balance, setBalance] = useState(true);
  const [split, setSplit] = useState(false);
  const [members, setMembers] = useState<{ id: number; name: string; avatar: string | null; role: string; maxConsecutive: number | null; maxHours?: number | null }[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [hourOverrides, setHourOverrides] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/schedule/rules').then(r => r.json()).then(d => {
      if (d?.error) { setErr(d.error); return; }
      setTeamMax(d.teamMax != null ? String(d.teamMax) : '');
      setTeamMaxHours(d.teamMaxHours != null ? String(d.teamMaxHours) : '');
      setBalance(d.balanceShifts !== false);
      setSplit(d.splitShifts === true);
      const list = Array.isArray(d.members) ? d.members : [];
      setMembers(list);
      const ov: Record<number, string> = {};
      const hov: Record<number, string> = {};
      list.forEach((m: any) => {
        ov[m.id] = m.maxConsecutive != null ? String(m.maxConsecutive) : '';
        hov[m.id] = m.maxHours != null ? String(m.maxHours) : '';
      });
      setOverrides(ov);
      setHourOverrides(hov);
    }).catch(() => setErr('Načtení se nepodařilo.')).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setMsg(''); setErr('');
    try {
      const res = await fetch('/api/schedule/rules', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamMax: teamMax === '' ? null : parseInt(teamMax),
          teamMaxHours: teamMaxHours === '' ? null : parseInt(teamMaxHours),
          balanceShifts: balance,
          splitShifts: split,
          overrides: members.map(m => ({
            id: m.id,
            maxConsecutive: overrides[m.id] === '' ? null : parseInt(overrides[m.id]),
            maxHours: hourOverrides[m.id] === '' || hourOverrides[m.id] == null ? null : parseInt(hourOverrides[m.id]),
          })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setMsg('Uloženo. Pravidlo se použije při dalším generování rozvrhu.');
      else setErr(d.error || 'Uložení se nepodařilo.');
    } catch { setErr('Chyba serveru.'); }
    setSaving(false);
  };

  const teamLimit = teamMax === '' ? null : parseInt(teamMax);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="clock" size={18} className="text-[#5B7A08]" />
          <h2 className="font-bold text-[#16181A]">Maximálně dní v řadě</h2>
        </div>
        <p className="text-sm text-black/50">
          Kolik dní po sobě může někdo pracovat. Generátor rozvrhu po dosažení limitu
          člověku automaticky naplánuje volno — a počítá i směny na přelomu měsíce.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-[#16181A]">Pro celý tým:</label>
          <select value={teamMax} onChange={e => setTeamMax(e.target.value)}
            className="rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-2.5 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none">
            <option value="">Bez omezení</option>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(n => (
              <option key={n} value={n}>max {n} {n <= 4 ? 'dny' : 'dní'} po sobě</option>
            ))}
          </select>
        </div>
      </div>

      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="users" size={18} className="text-[#5B7A08]" />
          <h2 className="font-bold text-[#16181A]">Spravedlivé střídání</h2>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={balance} onChange={e => setBalance(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded accent-[#8FB811]" />
          <span className="text-sm text-black/60">
            <span className="font-semibold text-[#16181A]">Míchat lidi a držet všem podobný počet směn.</span>{' '}
            Generátor dá přednost tomu, kdo má zatím méně směn, a střídá, kdo s kým slouží.
            Nedostupnost a limity mají vždy přednost; preference ranní/odpolední se dál
            zohledňují při rovnosti.
          </span>
        </label>
      </div>

      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="swap" size={18} className="text-[#5B7A08]" />
          <h2 className="font-bold text-[#16181A]">Dělení směn</h2>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={split} onChange={e => setSplit(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded accent-[#8FB811]" />
          <span className="text-sm text-black/60">
            <span className="font-semibold text-[#16181A]">Povolit rozdělení směny mezi dva lidi.</span>{' '}
            Když směnu nemůže vzít nikdo celou, generátor ji rozpůlí — první část vezme ten,
            kdo může začátek, druhou ten, kdo může až později (třeba „jen odpolední").
            V náhledu jsou půlky označené.
          </span>
        </label>
      </div>

      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="overview" size={18} className="text-[#5B7A08]" />
          <h2 className="font-bold text-[#16181A]">Maximálně hodin za měsíc</h2>
        </div>
        <p className="text-sm text-black/50">
          Strop odpracovaných hodin na osobu a měsíc — hodí se pro brigádníky (DPP)
          nebo úvazky. Generátor člověku po dosažení limitu už žádnou směnu nepřidá.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-[#16181A]">Pro celý tým:</label>
          <input type="number" inputMode="numeric" min={8} max={400} value={teamMaxHours}
            onChange={e => setTeamMaxHours(e.target.value)} placeholder="bez omezení"
            className="w-36 rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-2.5 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none" />
          <span className="text-sm text-black/45">hodin / měsíc</span>
        </div>
      </div>

      <div className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-black/55">Výjimky pro jednotlivce</h3>
        <p className="text-sm text-black/50">
          Kdo to má jinak než tým — třeba brigádník, co chce co nejvíc směn v kuse,
          nebo někdo, komu tři dny stačí.
        </p>
        <div className="divide-y divide-black/[0.06]">
          {members.map(m => {
            const v = overrides[m.id] ?? '';
            const effective = v === '' ? (teamLimit != null ? `podle týmu (max ${teamLimit})` : 'bez omezení')
              : v === '0' ? 'bez omezení' : `max ${v} po sobě`;
            const hv = hourOverrides[m.id] ?? '';
            const effHours = hv === '' ? (teamMaxHours !== '' ? `podle týmu (${teamMaxHours} h)` : 'hodiny bez omezení')
              : hv === '0' ? 'hodiny bez omezení' : `max ${hv} h/měsíc`;
            return (
              <div key={m.id} className="flex items-center gap-3 py-2.5 flex-wrap">
                <span className="text-lg flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60 shrink-0">{m.avatar || '👤'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#16181A] truncate">{m.name}</p>
                  <p className="text-[11px] text-black/40">{effective} · {effHours}</p>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-black/35">dní po sobě</span>
                  <select value={v}
                    onChange={e => setOverrides(o => ({ ...o, [m.id]: e.target.value }))}
                    className="rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3.5 py-2 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none">
                    <option value="">Podle týmu</option>
                    <option value="0">Bez omezení</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(n => (
                      <option key={n} value={n}>max {n} po sobě</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-black/35">hodin / měsíc</span>
                  <input type="number" inputMode="numeric" min={0} max={400}
                    value={hourOverrides[m.id] ?? ''}
                    onChange={e => setHourOverrides(o => ({ ...o, [m.id]: e.target.value }))}
                    placeholder="podle týmu"
                    title="Prázdné = podle týmu, 0 = bez omezení"
                    className="w-28 rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3.5 py-2 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-[#5B7A08] bg-[#C8F542]/10 border border-[#C8F542]/25 rounded-2xl px-4 py-2.5">{msg}</p>}
      <button onClick={save} disabled={saving}
        className="rounded-full bg-[#16181A] text-white px-6 py-3 text-sm font-bold hover:bg-black disabled:opacity-50 transition">
        {saving ? 'Ukládám…' : 'Uložit pravidla'}
      </button>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Employer's view of one person's availability — every request on one screen,
// editable in place. Tapping a day cycles: volno → nemůže → jen ranní → jen
// odpolední → volno. The employee is notified about any change.
// ---------------------------------------------------------------------------
function EditAvailabilityModal({ member, month, initial, shiftTypes = [], onClose, onSaved }: {
  member: { id: number; name: string; avatar: string };
  month: string;
  initial: Submission | null;
  shiftTypes?: ShiftType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // One state per day: '' | 'off' | 'type:<id>' (legacy 'morning'/'afternoon' kept readable).
  const [days, setDays] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    (initial?.unavailableDates ?? []).forEach((x) => { if (x.startsWith(month + '-')) d[x] = 'off'; });
    Object.entries(initial?.dayPreferences ?? {}).forEach(([k, v]) => {
      if (!k.startsWith(month + '-')) return;
      if (v === 'morning' || v === 'afternoon' || /^type:\d+$/.test(v)) d[k] = v;
      if (v === 'off') d[k] = 'off';
    });
    return d;
  });
  const [preferred, setPreferred] = useState<string>(initial?.preferredShift ?? 'flexible');
  const [maxShifts, setMaxShifts] = useState<string>(initial?.maxShifts != null ? String(initial.maxShifts) : '');
  const [note, setNote] = useState<string>(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // The cycle mirrors the team's shift types; binary fallback only without them.
  const CYCLE = shiftTypes.length
    ? ['', 'off', ...shiftTypes.map((t) => `type:${t.id}`)]
    : ['', 'off', 'morning', 'afternoon'];
  const cycle = (date: string) =>
    setDays((d) => {
      const i = CYCLE.indexOf(d[date] ?? '');
      return { ...d, [date]: CYCLE[(i < 0 ? 1 : i + 1) % CYCLE.length] };
    });

  const grid = buildGrid(month);
  const TYPE_TONES = [
    'bg-amber-500/15 border-amber-500/40 text-amber-700',
    'bg-indigo-500/15 border-indigo-500/40 text-indigo-600',
    'bg-purple-500/15 border-purple-500/40 text-purple-700',
    'bg-teal-500/15 border-teal-500/40 text-teal-700',
  ];
  const toneOf = (v: string) => {
    if (v === 'off') return 'bg-red-500/15 border-red-500/40 text-red-600';
    if (v === 'morning') return TYPE_TONES[0];
    if (v === 'afternoon') return TYPE_TONES[1];
    const idx = shiftTypes.findIndex((t) => `type:${t.id}` === v);
    return TYPE_TONES[(idx < 0 ? 0 : idx) % TYPE_TONES.length];
  };
  const labelOf = (v: string) => {
    if (v === 'off') return 'nemůže';
    if (v === 'morning') return 'ranní';
    if (v === 'afternoon') return 'odpo';
    const t = shiftTypes.find((x) => `type:${x.id}` === v);
    return (t?.name ?? 'směna').slice(0, 6).toLowerCase();
  };

  const save = async () => {
    setSaving(true); setErr('');
    const unavailableDates = Object.entries(days).filter(([, v]) => v === 'off').map(([k]) => k);
    const dayPreferences: Record<string, string> = {};
    Object.entries(days).forEach(([k, v]) => {
      if (v === 'morning' || v === 'afternoon' || /^type:\d+$/.test(v)) dayPreferences[k] = v;
    });
    try {
      const res = await fetch('/api/availability', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: member.id, month,
          unavailableDates, dayPreferences,
          preferredShift: preferred,
          maxShifts: maxShifts === '' ? null : parseInt(maxShifts),
          note: note.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) onSaved();
      else setErr(d.error || 'Uložení se nepodařilo.');
    } catch { setErr('Chyba serveru.'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4" onClick={onClose}>
      <div className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="text-xl flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60 shrink-0">{member.avatar}</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold tracking-tight text-[#16181A] truncate">Dostupnost — {member.name}</h3>
            <p className="text-xs text-black/45 capitalize">{monthLabel(month)}</p>
          </div>
          <button onClick={onClose} className="rounded-full w-9 h-9 flex items-center justify-center glass text-black/50 hover:text-black shrink-0">✕</button>
        </div>

        <p className="text-xs text-black/45">
          Klikáním na den přepínáš: volno → <span className="text-red-600 font-medium">nemůže</span>
          {shiftTypes.length
            ? shiftTypes.map((t) => <span key={t.id}> → <span className="font-medium">jen {t.name}</span></span>)
            : <> → <span className="text-amber-700 font-medium">jen ranní</span> → <span className="text-indigo-600 font-medium">jen odpolední</span></>}
          . Denní volby jsou pro generátor závazné — typy se berou z nastavení „Typy směn".
        </p>

        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((d) => (
              <span key={d} className="text-center text-[10px] uppercase tracking-wide text-black/35">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const v = days[cell] ?? '';
              return (
                <button key={cell} onClick={() => cycle(cell)}
                  className={`aspect-square rounded-xl border text-center flex flex-col items-center justify-center gap-0.5 transition active:scale-95 ${
                    v ? toneOf(v) : 'bg-black/[0.03] border-black/[0.08] text-black/60 hover:bg-black/[0.06]'
                  }`}>
                  <span className="text-xs font-semibold leading-none">{parseInt(cell.split('-')[2])}</span>
                  {v && <span className="text-[9px] font-medium leading-none">{labelOf(v)}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Preferuje celkově</label>
            <select value={preferred} onChange={(e) => setPreferred(e.target.value)}
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none">
              <option value="flexible">Flexibilní</option>
              <option value="morning">Ranní</option>
              <option value="afternoon">Odpolední</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Max směn</label>
            <input type="number" inputMode="numeric" min={1} max={31} value={maxShifts}
              onChange={(e) => setMaxShifts(e.target.value)} placeholder="bez limitu"
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Poznámka</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
            className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none" />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full bg-black/[0.05] text-[#16181A] font-semibold px-5 py-3 text-sm hover:bg-black/[0.08] transition">Zrušit</button>
          <button onClick={save} disabled={saving}
            className="flex-1 rounded-full bg-[#16181A] text-white font-semibold px-5 py-3 text-sm hover:bg-black disabled:opacity-50 transition">
            {saving ? 'Ukládám…' : 'Uložit a upozornit'}
          </button>
        </div>
      </div>
    </div>
  );
}
