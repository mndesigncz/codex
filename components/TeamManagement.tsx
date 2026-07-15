'use client';

import { useState, useEffect } from 'react';
import { Icon } from './Icons';

interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  phone?: string;
  job_title?: string;
  shift_preference?: string;
}

interface Team {
  id: number;
  name: string;
  owner_id: number;
  join_code: string;
}

interface Invitation {
  id: number;
  email: string;
  job_title?: string;
  status: string;
  created_at: string;
}

const inputClass =
  'w-full rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

function roleChip(role: string) {
  return role === 'employer'
    ? 'bg-[#C8F542]/15 text-[#C8F542]'
    : 'bg-blue-500/15 text-blue-400';
}
function roleLabel(role: string) {
  return role === 'employer' ? 'Vedoucí' : 'Zaměstnanec';
}

function statusChip(status: string) {
  if (status === 'accepted') return 'bg-[#C8F542]/15 text-[#C8F542]';
  if (status === 'expired' || status === 'declined') return 'bg-red-500/15 text-red-400';
  return 'bg-blue-500/15 text-blue-400';
}
function statusLabel(status: string) {
  if (status === 'accepted') return 'Přijato';
  if (status === 'expired') return 'Vypršelo';
  if (status === 'declined') return 'Odmítnuto';
  return 'Čeká';
}

export default function TeamManagement({ user }: { user: { id: number; name: string; role: string; avatar?: string } }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [teamName, setTeamName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteJob, setInviteJob] = useState('Barista');
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Per-member editing
  const [editMemberId, setEditMemberId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<string>('employee');
  const [editJob, setEditJob] = useState<string>('');
  const [savingMember, setSavingMember] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 4000); };

  const loadTeam = async () => {
    const res = await fetch('/api/teams');
    const data = await res.json();
    if (data.team) {
      setTeam(data.team);
      setTeamName(data.team.name);
      setMembers(data.members ?? []);
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
        body: JSON.stringify({ email: inviteEmail.trim(), jobTitle: inviteJob.trim() || 'Barista' }),
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
    setError('');
  };

  const saveMember = async () => {
    if (editMemberId == null) return;
    setSavingMember(true);
    try {
      const res = await fetch('/api/teams/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editMemberId, role: editRole, jobTitle: editJob }),
      });
      const data = await res.json();
      if (res.ok) {
        setMembers(ms => ms.map(m => (m.id === editMemberId ? { ...m, role: editRole, job_title: editJob } : m)));
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
        <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-[#C8F542] animate-spin" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-white/40">Zatím nemáte žádný tým.</p>
      </div>
    );
  }

  const isOwner = team.owner_id === user.id;
  const pending = invitations.filter(i => i.status === 'pending');

  return (
    <div className="space-y-6">
      {notice && (
        <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#C8F542] text-sm flex items-center gap-2">
          <Icon name="check" size={16} /> {notice}
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm flex items-center gap-2">
          <Icon name="warning" size={16} /> {error}
        </div>
      )}

      {/* Team name */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-white/40 text-xs uppercase tracking-wider">
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
                className="rounded-full glass border border-white/15 hover:bg-white/10 text-white px-5 py-2.5 text-sm font-medium transition-all">
                Zrušit
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-2xl font-bold tracking-tight text-white">{team.name}</p>
            <button onClick={() => setEditingName(true)}
              className="rounded-full glass border border-white/15 hover:bg-white/10 text-white px-5 py-2.5 text-sm font-medium transition-all">
              Přejmenovat
            </button>
          </div>
        )}
      </div>

      {/* Join code */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-white/40 text-xs uppercase tracking-wider">
          <Icon name="check" size={16} /> Připojovací kód
        </div>
        <p className="text-sm text-white/40">Sdílejte tento kód s novými členy, aby se mohli připojit k týmu.</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 rounded-2xl bg-white/[0.06] border border-white/10 px-6 py-5 flex items-center justify-between">
            <span className="text-3xl md:text-4xl font-bold tracking-[0.3em] text-[#C8F542]">{team.join_code}</span>
            <button onClick={copyCode} title="Kopírovat"
              className="rounded-full glass border border-white/15 hover:bg-white/10 text-white px-4 py-2 text-sm font-medium transition-all whitespace-nowrap">
              {copied ? 'Zkopírováno ✓' : 'Kopírovat'}
            </button>
          </div>
          <button onClick={regenerate} disabled={regenerating}
            className="rounded-full glass border border-white/15 hover:bg-white/10 text-white px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-50 whitespace-nowrap">
            {regenerating ? 'Generuji…' : 'Vygenerovat nový'}
          </button>
        </div>
      </div>

      {/* Invite */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-white/40 text-xs uppercase tracking-wider">
          <Icon name="plus" size={16} /> Pozvat nového člena
        </div>
        <form onSubmit={sendInvite} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-3">
          <input type="email" required placeholder="email@priklad.cz" value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)} className={inputClass} />
          <input placeholder="Pozice" value={inviteJob}
            onChange={e => setInviteJob(e.target.value)} className={inputClass} />
          <button type="submit" disabled={inviting}
            className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all disabled:opacity-50 whitespace-nowrap">
            {inviting ? 'Odesílám…' : 'Odeslat pozvánku'}
          </button>
        </form>

        <div className="pt-2">
          <p className="text-xs uppercase tracking-wider text-white/40 mb-3">Odeslané pozvánky ({pending.length})</p>
          {invitations.length === 0 ? (
            <p className="text-sm text-white/40">Zatím žádné pozvánky.</p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{inv.email}</p>
                    <p className="text-xs text-white/40">{inv.job_title || 'Barista'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusChip(inv.status)}`}>
                    {statusLabel(inv.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Members */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-white/40 text-xs uppercase tracking-wider">
          <Icon name="users" size={16} /> Členové týmu ({members.length})
        </div>
        <div className="divide-y divide-white/[0.06]">
          {members.map(m => {
            const owner = m.id === team.owner_id;
            const editing = editMemberId === m.id;
            return (
              <div key={m.id} className="py-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-[#C8F542]/15 border border-[#C8F542]/20 flex items-center justify-center text-xl flex-shrink-0">
                    {m.avatar ?? '👤'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold tracking-tight text-white truncate">{m.name}</p>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${roleChip(m.role)}`}>{roleLabel(m.role)}</span>
                      {owner && <span className="rounded-full px-3 py-1 text-xs font-medium bg-white/10 text-white/60">Vlastník</span>}
                    </div>
                    <p className="text-sm text-white/40 truncate">{m.email}{m.job_title ? ` · ${m.job_title}` : ''}</p>
                  </div>
                  {!owner && !editing && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => startEdit(m)}
                        className="rounded-full glass border border-white/15 hover:bg-white/10 text-white px-4 py-2 text-sm font-medium transition-all">
                        Upravit
                      </button>
                      <button onClick={() => setRemoveTarget(m)}
                        className="rounded-full px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all">
                        Odebrat
                      </button>
                    </div>
                  )}
                </div>

                {editing && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 pl-0 sm:pl-15">
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Role</label>
                      <select value={editRole} onChange={e => setEditRole(e.target.value)}
                        className={inputClass + ' appearance-none'}>
                        <option value="employee" className="bg-neutral-900">Zaměstnanec</option>
                        <option value="employer" className="bg-neutral-900">Vedoucí</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Pozice</label>
                      <input value={editJob} onChange={e => setEditJob(e.target.value)} className={inputClass} />
                    </div>
                    <div className="sm:col-span-2 flex gap-2">
                      <button onClick={saveMember} disabled={savingMember}
                        className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all disabled:opacity-50">
                        {savingMember ? 'Ukládám…' : 'Uložit'}
                      </button>
                      <button onClick={() => setEditMemberId(null)}
                        className="rounded-full glass border border-white/15 hover:bg-white/10 text-white px-5 py-2.5 text-sm font-medium transition-all">
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

      {/* Remove confirm modal */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xl p-0 sm:p-4"
          onClick={() => !removing && setRemoveTarget(null)}>
          <div className="glass-strong rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-red-500/15 border border-red-500/20 flex items-center justify-center text-red-400">
                <Icon name="warning" size={20} />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-white">Odebrat člena</h3>
            </div>
            <p className="text-sm text-white/60">
              Opravdu chcete odebrat <span className="text-white font-medium">{removeTarget.name}</span> z týmu?
              Ztratí přístup k týmu.
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={confirmRemove} disabled={removing}
                className="rounded-full bg-red-500 text-white font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all disabled:opacity-50">
                {removing ? 'Odebírám…' : 'Odebrat'}
              </button>
              <button onClick={() => setRemoveTarget(null)} disabled={removing}
                className="rounded-full glass border border-white/15 hover:bg-white/10 text-white px-5 py-2.5 text-sm font-medium transition-all">
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
