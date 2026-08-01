'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { Icon } from '../Icons';
import ClockWidget from './ClockWidget';
import AnnouncementsManager from './AnnouncementsManager';
import ShiftReviewModal from './ShiftReviewModal';
import { PersonLink } from './ProfileLinkProvider';
import {
  isWidgetOn, readLayout, type LayoutEntry,
  EMPLOYER_WIDGETS, EMPLOYEE_WIDGETS,
} from '@/lib/dashboardWidgets';
import { DashboardEditor, LinkTile } from '../DashboardEditor';

// Everything past `rating` is an optional enrichment of the roster response —
// rendered only when the API sends it, so the row degrades to name + shift.
interface RosterEntry {
  id: number; name: string; avatar?: string; worked: boolean; reviewed: boolean; rating: number;
  points?: number; flagged?: boolean;
  shiftLabel?: string | null; startTime?: string | null; endTime?: string | null;
  closingFiled?: boolean; tasksDone?: number; tasksMissed?: number; stepsSkipped?: number;
}

const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : '');

// Compact "what happened on this shift" line, built from whatever the roster
// response carries — never a per-person detail request from the dashboard.
function rosterMeta(r: RosterEntry): string {
  const parts: string[] = [];
  const time = r.startTime && r.endTime ? `${hhmm(r.startTime)}–${hhmm(r.endTime)}` : '';
  if (r.shiftLabel) parts.push(time ? `${r.shiftLabel} · ${time}` : r.shiftLabel);
  else if (time) parts.push(time);
  if (r.closingFiled !== undefined) parts.push(r.closingFiled ? 'uzávěrka hotová' : 'bez uzávěrky');
  if (r.tasksDone !== undefined || r.tasksMissed !== undefined) {
    const done = r.tasksDone ?? 0;
    const missed = r.tasksMissed ?? 0;
    parts.push(missed > 0 ? `${done} splněných · ${missed} nesplněných úkolů` : `${done} splněných úkolů`);
  }
  if (r.stepsSkipped) parts.push(`${r.stepsSkipped} přeskočených ${plural(r.stepsSkipped, 'krok', 'kroky', 'kroků')}`);
  return parts.join(' · ');
}

interface Props {
  user: { id?: string; name?: string | null; avatar?: string };
  onNavigate: (view: string, arg?: string) => void;
}

function nextMonthStr() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function StatCard({ icon, label, value, onClick, alert = false }: { icon: string; label: string; value: number | string; onClick?: () => void; alert?: boolean }) {
  return (
    <button onClick={onClick} className="text-left glass-card p-5 hover:bg-black/[0.05] transition-all duration-300">
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-wider text-black/45">{label}</p>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${alert ? 'bg-red-500/10 border-red-500/20 text-red-600' : 'bg-[#C8F542]/10 border-[#C8F542]/20 text-[#5B7A08]'}`}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <p className="text-3xl font-bold tracking-tight text-[#16181A] mt-3">{value}</p>
    </button>
  );
}

export default function EmployerDashboard({ user, onNavigate }: Props) {
  const [members, setMembers] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [unreadChats, setUnreadChats] = useState(0);
  const [onShift, setOnShift] = useState<any[]>([]);
  const [rosters, setRosters] = useState<Record<string, RosterEntry[]>>({});
  const [reviewDate, setReviewDate] = useState('');
  const [rating, setRating] = useState<RosterEntry | null>(null);
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [employeeCfg, setEmployeeCfg] = useState<Record<string, any>>({});
  const [editing, setEditing] = useState(false);
  const [editRole, setEditRole] = useState<'employer' | 'employee'>('employer');
  const [loading, setLoading] = useState(true);
  const show = (id: string) => isWidgetOn(cfg, id);
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const loadRoster = useCallback(async (autoPick = false) => {
    const day = (d: string) => fetch(`/api/shift-reviews?date=${d}`).then(r => r.json()).catch(() => null);
    const [y, t] = await Promise.all([day(yesterday), day(today)]);
    const next: Record<string, RosterEntry[]> = {
      [yesterday]: Array.isArray(y?.list) ? y.list : [],
      [today]: Array.isArray(t?.list) ? t.list : [],
    };
    setRosters(next);
    // The owner usually rates the previous day, so start there when it still
    // has someone unrated.
    if (autoPick) {
      const pendingYesterday = next[yesterday].filter(r => r.worked && !r.reviewed).length;
      setReviewDate(pendingYesterday > 0 ? yesterday : today);
    }
  }, [today, yesterday]);

  const month = nextMonthStr();

  useEffect(() => {
    (async () => {
      try {
        const [team, sh, tk, inv, av, conv, att] = await Promise.all([
          fetch('/api/teams').then(r => r.json()).catch(() => ({})),
          fetch('/api/shifts').then(r => r.json()).catch(() => ({})),
          fetch('/api/tasks').then(r => r.json()).catch(() => []),
          fetch('/api/inventory').then(r => r.json()).catch(() => []),
          fetch(`/api/availability?month=${month}`).then(r => r.json()).catch(() => []),
          fetch('/api/conversations').then(r => r.json()).catch(() => []),
          fetch('/api/attendance?days=1').then(r => r.json()).catch(() => ({})),
        ]);
        setCfg(team?.team?.dashboard_config?.employer ?? {});
        setEmployeeCfg(team?.team?.dashboard_config?.employee ?? {});
        setMembers((team?.members ?? []).filter((m: any) => m.role === 'employee'));
        const allShifts = Array.isArray(sh?.shifts) ? sh.shifts : Array.isArray(sh) ? sh : [];
        setShifts(allShifts);
        setTasks(Array.isArray(tk) ? tk : []);
        setInventory(Array.isArray(inv) ? inv : []);
        setAvailability(Array.isArray(av) ? av : (av?.submissions ?? []));
        const convs = Array.isArray(conv) ? conv : conv?.conversations ?? [];
        setUnreadChats(convs.reduce((s: number, c: any) => s + (c.unreadCount || 0), 0));
        setOnShift((att?.roster ?? []).filter((r: any) => r.openSince));
        loadRoster(true);
      } catch {}
      setLoading(false);
    })();
  }, [month, loadRoster]);

  const activeDate = reviewDate || today;
  const dayRoster = (rosters[activeDate] ?? []).filter(r => r.worked);
  const pendingActive = dayRoster.filter(r => !r.reviewed).length;
  const anyWorked = [yesterday, today].some(d => (rosters[d] ?? []).some(r => r.worked));

  const todayShifts = shifts.filter(s => (s.date ?? '') === today);
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const lowStock = inventory.filter(i => i.quantity <= i.minQuantity);
  const critical = inventory.filter(i => i.quantity <= (i.criticalQuantity ?? i.critical_quantity ?? 0));
  const submittedIds = new Set(availability.map((a: any) => a.employeeId ?? a.employee_id));
  const notSubmitted = members.filter(m => !submittedIds.has(m.id));

  const monthLabel = new Date(month + '-01T00:00:00').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-7 w-64 rounded-full bg-black/[0.05] animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="glass-card h-28 animate-pulse" />)}
        </div>
        <div className="glass-card h-36 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card h-48 animate-pulse" />
          <div className="glass-card h-48 animate-pulse" />
        </div>
      </div>
    );
  }

  const layout = readLayout(cfg, EMPLOYER_WIDGETS);
  const employeeLayout = readLayout(employeeCfg, EMPLOYEE_WIDGETS);

  // Layout is saved straight from the editor; optimistic so dragging feels instant.
  const saveLayout = async (role: 'employer' | 'employee', next: LayoutEntry[]) => {
    const setter = role === 'employer' ? setCfg : setEmployeeCfg;
    const prev = role === 'employer' ? cfg : employeeCfg;
    setter({ ...prev, layout: next });
    try {
      const teams = await fetch('/api/teams').then(r => r.json()).catch(() => ({}));
      const current = teams?.team?.dashboard_config ?? {};
      const merged = { ...current, [role]: { ...(current[role] ?? {}), layout: next } };
      const res = await fetch('/api/teams', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardConfig: merged }),
      });
      if (!res.ok) setter(prev);
    } catch { setter(prev); }
  };

  // Each widget is a named block; the saved layout decides order and presence,
  // so the employer can rearrange the dashboard like a phone homescreen.
  const blocks: Record<string, React.ReactNode> = {
    clock: user.id ? <ClockWidget userId={parseInt(String(user.id))} /> : null,
    kpis: (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon="users" label="Zaměstnanci" value={members.length} onClick={() => onNavigate('team-settings')} />
              <StatCard icon="calendar" label="Směny dnes" value={todayShifts.length} onClick={() => onNavigate('shifts')} />
              <StatCard icon="check" label="Aktivní úkoly" value={activeTasks.length} onClick={() => onNavigate('tasks')} />
              <StatCard icon="warning" label="Kriticky málo" value={critical.length} onClick={() => onNavigate('inventory')} alert={critical.length > 0} />
            </div>
    ),
    onShift: onShift.length > 0 ? (
              <button onClick={() => onNavigate('attendance')} className="w-full text-left rounded-3xl bg-[#C8F542]/[0.12] border border-[#C8F542]/35 p-5 hover:bg-[#C8F542]/[0.18] transition-all">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-[#5B9E00] opacity-60 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#5B9E00]" />
                    </span>
                    <p className="font-bold text-[#16181A] truncate">Právě na směně ({onShift.length})</p>
                  </div>
                  <span className="text-sm text-[#5B7A08] shrink-0">Docházka →</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {onShift.map((r: any) => (
                    <PersonLink key={r.id} id={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 border border-black/[0.06] px-3 py-1.5 text-sm font-medium text-[#16181A] max-w-full">
                      <span className="shrink-0">{r.avatar ?? '👤'}</span>
                      <span className="truncate">{r.name}</span>
                      <span className="text-xs text-[#5B7A08] tabular-nums shrink-0 whitespace-nowrap">
                        od {new Date(r.openSince).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </PersonLink>
                  ))}
                </div>
              </button>
    ) : null,
    rateShifts: anyWorked ? (
              <div className="glass-card p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#C8F542]/12 text-[#5B7A08] shrink-0"><Icon name="award" size={17} /></span>
                    <div className="min-w-0">
                      <h3 className="font-bold tracking-tight text-[#16181A]">Ohodnotit směny</h3>
                      <p className="text-xs text-black/45">Projdi, co kdo udělal, a dej hodnocení.</p>
                    </div>
                  </div>
                  <button onClick={() => onNavigate('rewards')} className="text-sm text-[#5B7A08] hover:brightness-110 shrink-0">Kalendář hodnocení →</button>
                </div>

                <div className="grid grid-cols-2 gap-1 rounded-full glass border border-black/[0.07] p-1 mb-3">
                  {([[yesterday, 'Včera'], [today, 'Dnes']] as [string, string][]).map(([d, label]) => {
                    const pending = (rosters[d] ?? []).filter(r => r.worked && !r.reviewed).length;
                    return (
                      <button key={d} onClick={() => setReviewDate(d)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeDate === d ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'}`}>
                        {label}
                        {pending > 0 && (
                          <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${activeDate === d ? 'bg-white/20 text-white' : 'bg-orange-500/15 text-orange-600'}`}>{pending}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {dayRoster.length === 0 ? (
                  <p className="text-sm text-black/45">{activeDate === today ? 'Dnes zatím nikdo nepracoval.' : 'Včera nikdo nepracoval.'}</p>
                ) : (
                  <div className="space-y-2">
                    {pendingActive === 0 && (
                      <div className="flex items-center gap-2 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/30 px-3.5 py-2.5">
                        <Icon name="check" size={15} className="text-[#5B7A08] shrink-0" />
                        <p className="text-sm font-medium text-[#5B7A08]">Vše ohodnoceno ✓</p>
                      </div>
                    )}
                    {dayRoster.map(r => {
                      const meta = rosterMeta(r);
                      return (
                        <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-2xl ${r.flagged ? 'bg-amber-500/[0.1]' : 'bg-black/[0.03]'}`}>
                          <PersonLink id={r.id} className="text-lg flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60 shrink-0">{r.avatar ?? '👤'}</PersonLink>
                          <div className="flex-1 min-w-0">
                            <PersonLink id={r.id}><p className="text-sm font-medium text-[#16181A] truncate">{r.name}</p></PersonLink>
                            {meta && <p className="text-[11px] text-black/45 truncate">{meta}</p>}
                          </div>
                          {r.flagged && <Icon name="warning" size={14} className="text-amber-600 shrink-0" />}
                          {r.reviewed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-2.5 py-1 text-xs font-medium shrink-0">
                              {r.rating > 0 ? `${r.rating}★` : ''} Hodnoceno
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/12 text-orange-600 px-2.5 py-1 text-[11px] font-medium shrink-0">Čeká</span>
                          )}
                          <button onClick={() => setRating(r)} className="rounded-full bg-[#16181A] text-white px-3.5 py-1.5 text-xs font-semibold hover:brightness-125 transition shrink-0">
                            {r.reviewed ? 'Upravit' : 'Ohodnotit'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
    ) : null,
    announcements: <AnnouncementsManager />,
    availability: (
            <div className="glass-card p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div className="min-w-0">
                  <h3 className="font-bold tracking-tight text-[#16181A]">Dostupnost — {monthLabel}</h3>
                  <p className="text-sm text-black/45">{submittedIds.size} z {members.length} zaměstnanců zadalo dostupnost</p>
                </div>
                <button onClick={() => onNavigate('shifts')} className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2 text-sm hover:brightness-110 whitespace-nowrap shrink-0">Sestavit rozvrh</button>
              </div>
              {notSubmitted.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-wider text-black/45 mb-2">Ještě nezadali</p>
                  <div className="flex flex-wrap gap-2">
                    {notSubmitted.map(m => (
                      <PersonLink key={m.id} id={m.id} className="rounded-full px-3 py-1 text-xs font-medium bg-black/[0.05] text-black/60">{m.avatar} {m.name}</PersonLink>
                    ))}
                  </div>
                </div>
              ) : members.length > 0 ? (
                <p className="text-sm text-[#5B7A08]">Všichni zadali dostupnost — můžete sestavit rozvrh.</p>
              ) : (
                <p className="text-sm text-black/45">Zatím žádní zaměstnanci. Pozvěte tým v sekci Nastavení.</p>
              )}
            </div>
    ),
    lowStock: (
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold tracking-tight text-[#16181A]">Nízké zásoby</h3>
                  <button onClick={() => onNavigate('inventory')} className="text-sm text-[#5B7A08] hover:brightness-110">Sklad →</button>
                </div>
                {lowStock.length === 0 ? (
                  <p className="text-sm text-black/45">Zásoby jsou v pořádku.</p>
                ) : (
                  <div className="space-y-2">
                    {lowStock.slice(0, 5).map(i => {
                      const isCritical = i.quantity <= (i.criticalQuantity ?? i.critical_quantity ?? 0);
                      return (
                        <div key={i.id} className="flex items-center justify-between p-3 rounded-2xl bg-black/[0.04]">
                          <span className="text-sm text-[#16181A]">{i.name}</span>
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${isCritical ? 'bg-red-500/15 text-red-600' : 'bg-orange-500/15 text-orange-600'}`}>{i.quantity} {i.unit}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
    ),
    todayShifts: (
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold tracking-tight text-[#16181A]">Dnešní směny</h3>
                  <button onClick={() => onNavigate('shifts')} className="text-sm text-[#5B7A08] hover:brightness-110">Rozvrh →</button>
                </div>
                {todayShifts.length === 0 ? (
                  <p className="text-sm text-black/45">Dnes nejsou naplánované žádné směny.</p>
                ) : (
                  <div className="space-y-2">
                    {todayShifts.map(s => (
                      <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl bg-black/[0.04]">
                        <span className="text-lg"><Icon name={s.type === 'morning' ? 'sun' : 'moon'} size={16} className={s.type === 'morning' ? 'text-orange-500' : 'text-[#0A6FE0]'} /></span>
                        <div>
                          <PersonLink id={s.employeeId ?? s.employee_id}><p className="text-sm font-medium text-[#16181A]">{s.employeeName ?? s.employee_name ?? 'Zaměstnanec'}</p></PersonLink>
                          <p className="text-xs text-black/45">{(s.startTime ?? s.start_time)} – {(s.endTime ?? s.end_time)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
    ),
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-black/45 text-sm">Přehled podniku</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#16181A]">Vítejte zpět, {user.name}</h1>
        </div>
        <button
          onClick={() => setEditing(v => !v)}
          title="Upravit přehled"
          className={`shrink-0 rounded-full w-10 h-10 flex items-center justify-center transition ${
            editing ? 'bg-[#16181A] text-white' : 'glass text-black/45 hover:text-black'
          }`}
        >
          <Icon name="settings" size={18} />
        </button>
      </div>

      {editing && (
        <DashboardEditor
          role={editRole}
          layout={editRole === 'employer' ? layout : employeeLayout}
          widgets={editRole === 'employer' ? EMPLOYER_WIDGETS : EMPLOYEE_WIDGETS}
          onChange={next => saveLayout(editRole, next)}
          onClose={() => setEditing(false)}
          canSwitchRole
          onSwitchRole={setEditRole}
        />
      )}

      {layout.map((e, i) =>
        e.type === 'link'
          ? <LinkTile key={`l-${e.target}-${i}`} entry={e} onNavigate={onNavigate} />
          : <Fragment key={`w-${e.id}-${i}`}>{blocks[e.id] ?? null}</Fragment>,
      )}


      {rating && (
        <ShiftReviewModal
          employee={{ id: rating.id, name: rating.name, avatar: rating.avatar }}
          initialDate={activeDate}
          onClose={() => setRating(null)}
          onSaved={() => { setRating(null); loadRoster(); }}
        />
      )}
    </div>
  );
}
