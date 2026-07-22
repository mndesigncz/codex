'use client';

import { useState, useEffect } from 'react';
import { Icon } from './Icons';
import NoisiumConnect from './NoisiumConnect';
import KioskSettings from './KioskSettings';
import { CURRENCIES, LOCALES } from '@/lib/money';
import { useSymbol } from './CurrencyProvider';

interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  phone?: string;
  job_title?: string;
  shift_preference?: string;
  hourly_rate?: number | null;
}

interface Team {
  id: number;
  name: string;
  owner_id: number;
  join_code: string;
  pay_daily_cash?: boolean;
  closing_requires_shift?: boolean;
  payout_from_register?: boolean;
  currency?: string;
  locale?: string;
  week_start?: number;
  labor_target_pct?: number | null;
  business_type?: string | null;
}

interface Invitation {
  id: number;
  email: string;
  job_title?: string;
  status: string;
  created_at: string;
}

const inputClass =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

function roleChip(role: string) {
  return role === 'employer'
    ? 'bg-[#C8F542]/15 text-[#5B7A08]'
    : 'bg-blue-500/15 text-blue-600';
}
function roleLabel(role: string) {
  return role === 'employer' ? 'Vedoucí' : 'Zaměstnanec';
}

function statusChip(status: string) {
  if (status === 'accepted') return 'bg-[#C8F542]/15 text-[#5B7A08]';
  if (status === 'expired' || status === 'declined') return 'bg-red-500/15 text-red-600';
  return 'bg-blue-500/15 text-blue-600';
}
function statusLabel(status: string) {
  if (status === 'accepted') return 'Přijato';
  if (status === 'expired') return 'Vypršelo';
  if (status === 'declined') return 'Odmítnuto';
  return 'Čeká';
}

export default function TeamManagement({ user }: { user: { id: number; name: string; role: string; avatar?: string } }) {
  const symbol = useSymbol();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [teamName, setTeamName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteJob, setInviteJob] = useState('Barista');
  const [inviteRole, setInviteRole] = useState('employee');
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Per-member editing
  const [editMemberId, setEditMemberId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<string>('employee');
  const [editJob, setEditJob] = useState<string>('');
  const [editRate, setEditRate] = useState<string>('');
  const [savingMember, setSavingMember] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  // Labor-target input mirrors the saved value but stays editable while typing.
  const [laborInput, setLaborInput] = useState('');
  useEffect(() => {
    setLaborInput(team?.labor_target_pct != null ? String(team.labor_target_pct) : '');
  }, [team?.labor_target_pct]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 4000); };

  const loadTeam = async () => {
    try {
      const res = await fetch('/api/teams');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setLoadError(true); return; }
      setLoadError(false);
      if (data.team) {
        setTeam(data.team);
        setTeamName(data.team.name);
        setMembers(data.members ?? []);
      }
    } catch {
      setLoadError(true);
    }
  };
  const loadInvites = async () => {
    const res = await fetch('/api/invitations');
    const data = await res.json();
    setInvitations(data.invitations ?? []);
  };

  useEffect(() => {
    Promise.all([loadTeam(), loadInvites()]).finally(() => setLoading(false));
  }, []);

  const saveName = async () => {
    if (!teamName.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      if (res.ok) {
        setTeam(t => (t ? { ...t, name: teamName.trim() } : t));
        setEditingName(false);
        flash('Název týmu byl uložen.');
      } else {
        setError('Název se nepodařilo uložit.');
      }
    } finally {
      setSavingName(false);
    }
  };

  const [savingPayout, setSavingPayout] = useState(false);
  const togglePayDailyCash = async (value: boolean) => {
    setSavingPayout(true);
    setTeam(t => (t ? { ...t, pay_daily_cash: value } : t)); // optimistic
    try {
      const res = await fetch('/api/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payDailyCash: value }),
      });
      if (res.ok) flash(value ? 'Denní hotovostní výplata zapnuta.' : 'Denní hotovostní výplata vypnuta.');
      else { setTeam(t => (t ? { ...t, pay_daily_cash: !value } : t)); setError('Nastavení se nepodařilo uložit.'); }
    } catch {
      setTeam(t => (t ? { ...t, pay_daily_cash: !value } : t));
      setError('Nastavení se nepodařilo uložit.');
    } finally {
      setSavingPayout(false);
    }
  };

  const [savingRequiresShift, setSavingRequiresShift] = useState(false);
  const toggleRequiresShift = async (value: boolean) => {
    setSavingRequiresShift(true);
    setTeam(t => (t ? { ...t, closing_requires_shift: value } : t)); // optimistic
    try {
      const res = await fetch('/api/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingRequiresShift: value }),
      });
      if (res.ok) flash(value ? 'Uzávěrka je nyní vázaná na směnu.' : 'Uzávěrku může nyní vyplnit kdokoliv.');
      else { setTeam(t => (t ? { ...t, closing_requires_shift: !value } : t)); setError('Nastavení se nepodařilo uložit.'); }
    } catch {
      setTeam(t => (t ? { ...t, closing_requires_shift: !value } : t));
      setError('Nastavení se nepodařilo uložit.');
    } finally {
      setSavingRequiresShift(false);
    }
  };

  const [savingPayoutSrc, setSavingPayoutSrc] = useState(false);
  const togglePayoutFromRegister = async (value: boolean) => {
    setSavingPayoutSrc(true);
    setTeam(t => (t ? { ...t, payout_from_register: value } : t));
    try {
      const res = await fetch('/api/teams', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutFromRegister: value }),
      });
      if (res.ok) flash(value ? 'Výplata se bere z kasy.' : 'Výplata se bere bokem (mimo kasu).');
      else { setTeam(t => (t ? { ...t, payout_from_register: !value } : t)); setError('Nastavení se nepodařilo uložit.'); }
    } catch {
      setTeam(t => (t ? { ...t, payout_from_register: !value } : t));
      setError('Nastavení se nepodařilo uložit.');
    } finally { setSavingPayoutSrc(false); }
  };

  // Business / localization settings (currency, locale, week start, labor target).
  const [savingBiz, setSavingBiz] = useState(false);
  const saveBiz = async (patch: Record<string, unknown>) => {
    setSavingBiz(true);
    const prev = team;
    setTeam(t => (t ? { ...t, ...mapBizToTeam(patch) } : t)); // optimistic
    try {
      const res = await fetch('/api/teams', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) flash('Nastavení provozu uloženo.');
      else { setTeam(prev); setError('Nastavení se nepodařilo uložit.'); }
    } catch {
      setTeam(prev);
      setError('Nastavení se nepodařilo uložit.');
    } finally {
      setSavingBiz(false);
    }
  };
  // Map PATCH keys (camelCase) back onto the local Team shape (snake_case).
  const mapBizToTeam = (p: Record<string, unknown>) => ({
    ...(p.currency !== undefined ? { currency: p.currency as string } : {}),
    ...(p.locale !== undefined ? { locale: p.locale as string } : {}),
    ...(p.weekStart !== undefined ? { week_start: p.weekStart as number } : {}),
    ...(p.laborTargetPct !== undefined ? { labor_target_pct: p.laborTargetPct as number | null } : {}),
    ...(p.businessType !== undefined ? { business_type: p.businessType as string } : {}),
  });

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateCode: true }),
      });
      const data = await res.json();
      if (res.ok && data.team?.join_code) {
        setTeam(t => (t ? { ...t, join_code: data.team.join_code } : t));
        flash('Nový připojovací kód byl vygenerován.');
      }
    } finally {
      setRegenerating(false);
    }
  };

  const copyCode = async () => {
    if (!team?.join_code) return;
    try {
      await navigator.clipboard.writeText(team.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), jobTitle: inviteJob.trim() || 'Barista', role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteEmail('');
        setInviteJob('Barista');
        flash(data.warning || `Pozvánka byla odeslána na ${inviteEmail.trim()}.`);
        loadInvites();
      } else {
        setError(data.error || 'Pozvánku se nepodařilo odeslat.');
      }
    } finally {
      setInviting(false);
    }
  };

  const startEdit = (m: Member) => {
    setEditMemberId(m.id);
    setEditRole(m.role);
    setEditJob(m.job_title ?? '');
    setEditRate(m.hourly_rate ? String(m.hourly_rate) : '');
    setError('');
  };

  const saveMember = async () => {
    if (editMemberId == null) return;
    setSavingMember(true);
    try {
      const res = await fetch('/api/teams/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editMemberId, role: editRole, jobTitle: editJob, hourlyRate: editRate === '' ? 0 : parseInt(editRate) || 0 }),
      });
      const data = await res.json();
      if (res.ok) {
        setMembers(ms => ms.map(m => (m.id === editMemberId ? { ...m, role: editRole, job_title: editJob, hourly_rate: editRate === '' ? 0 : parseInt(editRate) || 0 } : m)));
        setEditMemberId(null);
        flash('Změny člena byly uloženy.');
      } else {
        setError(data.error || 'Změny se nepodařilo uložit.');
      }
    } finally {
      setSavingMember(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/teams/members?userId=${removeTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setMembers(ms => ms.filter(m => m.id !== removeTarget.id));
        flash(`${removeTarget.name} byl odebrán z týmu.`);
        setRemoveTarget(null);
      } else {
        setError(data.error || 'Člena se nepodařilo odebrat.');
        setRemoveTarget(null);
      }
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="glass-card p-8 text-center space-y-3">
        <p className="text-[#16181A] font-medium">Tým se nepodařilo načíst.</p>
        <p className="text-black/45 text-sm">Vaše data jsou v pořádku — jen se je nepodařilo teď načíst.</p>
        <button
          onClick={() => { setLoading(true); Promise.all([loadTeam(), loadInvites()]).finally(() => setLoading(false)); }}
          className="rounded-full bg-[#16181A] text-white font-semibold px-5 py-2.5 text-sm hover:bg-black transition"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-black/45">Zatím nemáte žádný tým.</p>
      </div>
    );
  }

  const isOwner = team.owner_id === user.id;
  const pending = invitations.filter(i => i.status === 'pending');

  return (
    <div className="space-y-6">
      {notice && (
        <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#5B7A08] text-sm flex items-center gap-2">
          <Icon name="check" size={16} /> {notice}
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-red-600 text-sm flex items-center gap-2">
          <Icon name="warning" size={16} /> {error}
        </div>
      )}

      {/* Team name */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-black/45 text-xs uppercase tracking-wider">
          <Icon name="users" size={16} /> Název týmu
        </div>
        {editingName ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <input value={teamName} onChange={e => setTeamName(e.target.value)} className={inputClass} />
            <div className="flex gap-2">
              <button onClick={saveName} disabled={savingName}
                className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all disabled:opacity-50 whitespace-nowrap">
                {savingName ? 'Ukládám…' : 'Uložit'}
              </button>
              <button onClick={() => { setEditingName(false); setTeamName(team.name); }}
                className="rounded-full glass border border-black/10 hover:bg-black/[0.06] text-[#16181A] px-5 py-2.5 text-sm font-medium transition-all">
                Zrušit
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-2xl font-bold tracking-tight text-[#16181A] min-w-0 truncate">{team.name}</p>
            <button onClick={() => setEditingName(true)}
              className="rounded-full glass border border-black/10 hover:bg-black/[0.06] text-[#16181A] px-5 py-2.5 text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap">
              Přejmenovat
            </button>
          </div>
        )}
      </div>

      {/* Join code */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-black/45 text-xs uppercase tracking-wider">
          <Icon name="check" size={16} /> Připojovací kód
        </div>
        <p className="text-sm text-black/45">Zaměstnanci se připojí zadáním tohoto kódu na stránce <span className="font-medium text-[#16181A]">/join</span>.</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-[0.25em] sm:tracking-[0.3em] text-[#5B7A08] break-all min-w-0">{team.join_code}</span>
            <button onClick={copyCode} title="Kopírovat"
              className="w-full sm:w-auto rounded-full glass border border-black/10 hover:bg-black/[0.06] text-[#16181A] px-4 py-2 text-sm font-medium transition-all whitespace-nowrap flex-shrink-0">
              {copied ? 'Zkopírováno ✓' : 'Kopírovat'}
            </button>
          </div>
          <button onClick={regenerate} disabled={regenerating}
            className="w-full sm:w-auto rounded-full glass border border-black/10 hover:bg-black/[0.06] text-[#16181A] px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-50 whitespace-nowrap flex-shrink-0">
            {regenerating ? 'Generuji…' : 'Vygenerovat nový'}
          </button>
        </div>
      </div>

      {/* Invite */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-black/45 text-xs uppercase tracking-wider">
          <Icon name="plus" size={16} /> Pozvat nového člena
        </div>
        <form onSubmit={sendInvite} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="email" required placeholder="email@priklad.cz" value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)} className={inputClass} />
            <input placeholder="Pozice" value={inviteJob}
              onChange={e => setInviteJob(e.target.value)} className={inputClass} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 glass rounded-full p-1">
              {[['employee', 'Zaměstnanec'], ['employer', 'Vedoucí']].map(([val, label]) => (
                <button key={val} type="button" onClick={() => setInviteRole(val)}
                  className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition ${inviteRole === val ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button type="submit" disabled={inviting}
              className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all disabled:opacity-50 whitespace-nowrap ml-auto">
              {inviting ? 'Odesílám…' : 'Odeslat pozvánku'}
            </button>
          </div>
          {inviteRole === 'employer' && (
            <p className="text-xs text-[#5B7A08] bg-[#C8F542]/10 border border-[#C8F542]/20 rounded-xl px-3 py-2">
              Vedoucí má plný přístup: správa týmu, rozvrhy, sklad, uzávěrky i docházka.
            </p>
          )}
        </form>

        <div className="pt-2">
          <p className="text-xs uppercase tracking-wider text-black/45 mb-3">Odeslané pozvánky ({pending.length})</p>
          {invitations.length === 0 ? (
            <p className="text-sm text-black/45">Zatím žádné pozvánky.</p>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-[#16181A] truncate">{inv.email}</p>
                    <p className="text-xs text-black/45">{inv.job_title || 'Barista'}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {inv.status === 'pending' && (
                      <button type="button" onClick={() => { setInviteEmail(inv.email); setInviteJob(inv.job_title || 'Barista'); }}
                        className="text-xs text-[#5B7A08] hover:underline whitespace-nowrap">
                        Odeslat znovu
                      </button>
                    )}
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusChip(inv.status)}`}>
                      {statusLabel(inv.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Members */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-black/45 text-xs uppercase tracking-wider">
          <Icon name="users" size={16} /> Členové týmu ({members.length})
        </div>
        <div className="divide-y divide-black/[0.06]">
          {members.map(m => {
            const owner = m.id === team.owner_id;
            const editing = editMemberId === m.id;
            return (
              <div key={m.id} className="py-4">
                <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                  <div className="w-11 h-11 rounded-full bg-[#C8F542]/15 border border-[#C8F542]/20 flex items-center justify-center text-xl flex-shrink-0">
                    {m.avatar ?? '👤'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold tracking-tight text-[#16181A] truncate">{m.name}</p>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${roleChip(m.role)}`}>{roleLabel(m.role)}</span>
                      {owner && <span className="rounded-full px-3 py-1 text-xs font-medium bg-black/[0.06] text-black/60">Vlastník</span>}
                    </div>
                    <p className="text-sm text-black/45 truncate">{m.email}{m.job_title ? ` · ${m.job_title}` : ''}</p>
                  </div>
                  {!owner && !editing && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => startEdit(m)}
                        className="rounded-full glass border border-black/10 hover:bg-black/[0.06] text-[#16181A] px-4 py-2 text-sm font-medium transition-all whitespace-nowrap">
                        Upravit
                      </button>
                      <button onClick={() => setRemoveTarget(m)}
                        className="rounded-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 transition-all whitespace-nowrap">
                        Odebrat
                      </button>
                    </div>
                  )}
                </div>

                {editing && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 pl-0 sm:pl-15">
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Role</label>
                      <select value={editRole} onChange={e => setEditRole(e.target.value)}
                        className={inputClass + ' appearance-none'}>
                        <option value="employee" className="bg-neutral-900">Zaměstnanec</option>
                        <option value="employer" className="bg-neutral-900">Vedoucí</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Pozice</label>
                      <input value={editJob} onChange={e => setEditJob(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Hodinová sazba</label>
                      <div className="relative">
                        <input value={editRate} inputMode="numeric"
                          onChange={e => setEditRate(e.target.value.replace(/\D/g, ''))}
                          placeholder="0" className={`${inputClass} pr-14`} />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">{symbol}/h</span>
                      </div>
                      <p className="text-[11px] text-black/40 mt-1.5">Použije se pro výpočet mezd v Docházce.</p>
                    </div>
                    <div className="sm:col-span-2 flex gap-2">
                      <button onClick={saveMember} disabled={savingMember}
                        className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all disabled:opacity-50">
                        {savingMember ? 'Ukládám…' : 'Uložit'}
                      </button>
                      <button onClick={() => setEditMemberId(null)}
                        className="rounded-full glass border border-black/10 hover:bg-black/[0.06] text-[#16181A] px-5 py-2.5 text-sm font-medium transition-all">
                        Zrušit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Business / localization settings — makes the app fit any team */}
      <div className="glass-card p-6 space-y-5">
        <div>
          <h3 className="font-bold tracking-tight text-[#16181A] flex items-center gap-2">
            <Icon name="settings" size={18} /> Provoz podniku
          </h3>
          <p className="text-black/45 text-sm mt-1">Měna, formát čísel a cíle — přizpůsob appku svému podniku.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="min-w-0">
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Měna</label>
            <select value={team?.currency ?? 'CZK'} disabled={savingBiz}
              onChange={e => saveBiz({ currency: e.target.value })}
              className={`${inputClass} appearance-none h-[46px]`} style={{ WebkitAppearance: 'none' }}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Formát čísel (jazyk)</label>
            <select value={team?.locale ?? 'cs-CZ'} disabled={savingBiz}
              onChange={e => saveBiz({ locale: e.target.value })}
              className={`${inputClass} appearance-none h-[46px]`} style={{ WebkitAppearance: 'none' }}>
              {LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Začátek týdne</label>
            <select value={String(team?.week_start ?? 1)} disabled={savingBiz}
              onChange={e => saveBiz({ weekStart: Number(e.target.value) })}
              className={`${inputClass} appearance-none h-[46px]`} style={{ WebkitAppearance: 'none' }}>
              <option value="1">Pondělí</option>
              <option value="0">Neděle</option>
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Cíl mzdových nákladů</label>
            <div className="relative">
              <input type="number" inputMode="numeric" min={0} max={100} value={laborInput} disabled={savingBiz}
                onChange={e => setLaborInput(e.target.value)}
                onBlur={() => {
                  const v = laborInput.trim() === '' ? null : Math.max(0, Math.min(100, Math.round(Number(laborInput))));
                  if ((team?.labor_target_pct ?? null) !== v) saveBiz({ laborTargetPct: v });
                }}
                placeholder="např. 30" className={`${inputClass} pr-10 h-[46px]`} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">%</span>
            </div>
            <p className="text-[11px] text-black/40 mt-1.5">Podíl mezd na tržbách — v Docházce se zvýrazní překročení.</p>
          </div>
        </div>
      </div>

      {/* Payout / cash settings */}
      <div className="glass-card p-6 space-y-4">
        <div>
          <h3 className="font-bold tracking-tight text-[#16181A] flex items-center gap-2">
            <Icon name="trend" size={18} /> Výplaty a uzávěrka
          </h3>
          <p className="text-black/45 text-sm mt-1">Nastavení, které ovlivňuje denní uzávěrku zaměstnanců.</p>
        </div>
        <label className="flex items-start justify-between gap-4 cursor-pointer">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-[#16181A]">Výplaty denně v hotovosti</p>
            <p className="text-xs text-black/45 mt-0.5">Když je zapnuto, zaměstnanci v uzávěrce vyplní i kolik si dnes vyplatili z kasy.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!team?.pay_daily_cash}
            disabled={savingPayout}
            onClick={() => togglePayDailyCash(!team?.pay_daily_cash)}
            className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${team?.pay_daily_cash ? 'bg-[#C8F542]' : 'bg-black/15'}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${team?.pay_daily_cash ? 'translate-x-5' : ''}`} />
          </button>
        </label>

        {/* Payout source — only relevant when daily cash payout is on. */}
        {team?.pay_daily_cash && (
          <>
            <div className="h-px bg-black/[0.06]" />
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-[#16181A]">Výplata se bere z kasy</p>
                <p className="text-xs text-black/45 mt-0.5">
                  {team?.payout_from_register !== false
                    ? 'Denní výplata se odečítá z očekávaného stavu kasy.'
                    : 'Denní výplata se bere bokem (mimo kasu) — očekávaný stav kasy neovlivní.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={team?.payout_from_register !== false}
                disabled={savingPayoutSrc}
                onClick={() => togglePayoutFromRegister(!(team?.payout_from_register !== false))}
                className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${team?.payout_from_register !== false ? 'bg-[#C8F542]' : 'bg-black/15'}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${team?.payout_from_register !== false ? 'translate-x-5' : ''}`} />
              </button>
            </label>
          </>
        )}

        <div className="h-px bg-black/[0.06]" />

        <label className="flex items-start justify-between gap-4 cursor-pointer">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-[#16181A]">Uzávěrka jen po směně</p>
            <p className="text-xs text-black/45 mt-0.5">Když je zapnuto, zaměstnanec může odeslat uzávěrku jen za den, kdy měl naplánovanou směnu.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={team?.closing_requires_shift !== false}
            disabled={savingRequiresShift}
            onClick={() => toggleRequiresShift(!(team?.closing_requires_shift !== false))}
            className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${team?.closing_requires_shift !== false ? 'bg-[#C8F542]' : 'bg-black/15'}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${team?.closing_requires_shift !== false ? 'translate-x-5' : ''}`} />
          </button>
        </label>
      </div>

      {/* Noisium integration */}
      <KioskSettings />

      <NoisiumConnect />

      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4"
          onClick={() => !removing && setRemoveTarget(null)}>
          <div className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-red-500/15 border border-red-500/20 flex items-center justify-center text-red-600">
                <Icon name="warning" size={20} />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-[#16181A]">Odebrat člena</h3>
            </div>
            <p className="text-sm text-black/60">
              Opravdu chcete odebrat <span className="text-[#16181A] font-medium">{removeTarget.name}</span> z týmu?
              Ztratí přístup k týmu.
            </p>
            <div className="flex flex-wrap gap-2 sm:gap-3 pt-2">
              <button onClick={confirmRemove} disabled={removing}
                className="rounded-full bg-red-500 text-[#16181A] font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all disabled:opacity-50">
                {removing ? 'Odebírám…' : 'Odebrat'}
              </button>
              <button onClick={() => setRemoveTarget(null)} disabled={removing}
                className="rounded-full glass border border-black/10 hover:bg-black/[0.06] text-[#16181A] px-5 py-2.5 text-sm font-medium transition-all">
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
