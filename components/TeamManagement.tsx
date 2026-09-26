'use client';

import { useState, useEffect } from 'react';
import OrganizationSettings from './employer/OrganizationSettings';
import { Icon } from './Icons';
import { EmptyState, PageHeader, SearchField } from './ui';
import NoisiumConnect from './NoisiumConnect';
import KioskSettings from './KioskSettings';
import EmployeeProfile from './employer/EmployeeProfile';
import { CURRENCIES, LOCALES } from '@/lib/money';
import { useSymbol } from './CurrencyProvider';
import ShareSettings from './employer/ShareSettings';
import { useModal } from '@/lib/useModal';
import { clickable } from '@/lib/clickable';
import { czCount } from '@/lib/czech';
import { okJson } from '@/lib/api';
import { DiscardGuard } from './ui/DiscardGuard';
import { obsahuje, obsahujeNekde } from '@/lib/hledani';
import { useOpravneni, obnovOpravneni } from './role/useOpravneni';
import { Select } from './ui';

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
  /** Právě přepnutý do jiného podniku organizace (kolo 62) — je členem, jen tu teď nestojí. */
  aktivni_jinde?: boolean;
  /** Role s oprávněními (kolo 67): systémová podle klíče, vlastní podle id. `role` výš je jen typ účtu. */
  role_klic?: string | null;
  role_id?: number | null;
  role_nazev?: string | null;
}

/** Role, jak ji vrací /api/roles — pro výběr u člena. */
interface VolbaRole { klic: string | null; id: number | null; nazev: string; typ: 'vedeni' | 'zamestnanec' | 'kiosk'; opravneni: string[] }
const hodnotaRole = (r: { klic?: string | null; id?: number | null }) => (r.id != null ? `id:${r.id}` : r.klic ? `k:${r.klic}` : '');
/** Hodnota role člena pro <select>; prázdná, když server roli neposlal (starší odpověď). */
const roleClena = (m: Member) => hodnotaRole({ klic: m.role_klic ?? null, id: m.role_id ?? null });

interface Team {
  id: number;
  name: string;
  owner_id: number;
  join_code: string;
  pay_daily_cash?: boolean;
  drawer_float?: number | null;
  closing_requires_shift?: boolean;
  show_team_schedule?: boolean;
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
  /** Null, když pozvánku vytvořil někdo jiný a její roli bych dát nesměl (server token schová). */
  token?: string | null;
  created_at: string;
}

const inputClass =
  'w-full field border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm';

function roleChip(role: string) {
  return role === 'employer'
    ? 'bg-[#C8F542]/15 text-[#5B7A08]'
    : 'bg-info/15 text-[#0A5CC0]';
}
function roleLabel(role: string) {
  return role === 'employer' ? 'Vedoucí' : 'Zaměstnanec';
}
/**
 * Název role člena. Server posílá role_klic / role_id; dokud je nepošle
 * (nebo je role smazaná), zůstane starý popisek podle typu účtu — raději
 * méně přesně než vymyšlený název.
 */
function nazevRole(m: Member, role: VolbaRole[]): string {
  if (m.role_nazev) return m.role_nazev;
  const v = roleClena(m);
  const r = v ? role.find(x => hodnotaRole(x) === v) : null;
  return r?.nazev ?? roleLabel(m.role);
}

function statusChip(status: string) {
  if (status === 'accepted') return 'bg-[#C8F542]/15 text-[#5B7A08]';
  if (status === 'expired' || status === 'declined' || status === 'revoked') return 'bg-bad/15 text-bad-ink';
  return 'bg-info/15 text-[#0A5CC0]';
}
function statusLabel(status: string) {
  if (status === 'accepted') return 'Přijato';
  if (status === 'expired') return 'Vypršelo';
  if (status === 'declined') return 'Odmítnuto';
  if (status === 'revoked') return 'Zrušeno';
  return 'Čeká';
}

export default function TeamManagement({ user }: { user: { id: number; name: string; role: string; avatar?: string } }) {
  const symbol = useSymbol();
  // Co smí přihlášený v tomhle podniku (kolo 67). Akce, na které nemá,
  // se neukazují: tlačítko, které vždycky skončí 403, je jen past.
  const { ma, role: mojeRole } = useOpravneni();
  const smiPrirazovat = ma('tym.role_prirazovat');
  const smiPozici = ma('tym.upravit');
  const smiSazbu = ma('finance.sazby_upravit');
  const smiOdebrat = ma('tym.odebrat');
  const smiPozvat = ma('tym.pozvat');
  const [role, setRole] = useState<VolbaRole[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);
  // Stock categories power the "open this category" shortcut targets.
  const [invCategories, setInvCategories] = useState<{ id: number; name: string }[]>([]);

  const [teamName, setTeamName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteJob, setInviteJob] = useState('Barista');
  const [inviteRole, setInviteRole] = useState('employee');
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState<{ email: string; token?: string; emailSent: boolean; emailError?: string | null } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Per-member editing
  const [editMemberId, setEditMemberId] = useState<number | null>(null);
  const [memberQ, setMemberQ] = useState('');
  const shownMembers = (() => {
    const q = memberQ.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      obsahujeNekde(q, m.name, m.email, (m as any).jobTitle));
  })();
  // Hodnota výběru role: `k:barista` (přednastavená) nebo `id:12` (vlastní).
  const [editRole, setEditRole] = useState<string>('');
  const [editJob, setEditJob] = useState<string>('');
  const [editRate, setEditRate] = useState<string>('');
  const [savingMember, setSavingMember] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const removeModal = useModal(!!removeTarget, () => setRemoveTarget(null), 'Odebrat člena týmu');
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

  // Role pro výběr u člena. Selhání není důvod schovat tým — výběr role
  // se pak jen nenabídne a zbytek obrazovky funguje dál.
  const loadRoles = () => fetch('/api/roles').then(okJson)
    .then((d: any) => {
      const sys = Array.isArray(d?.system) ? d.system : [];
      const vl = Array.isArray(d?.vlastni) ? d.vlastni : [];
      setRole([
        ...sys.map((r: any) => ({ klic: r.klic, id: null, nazev: r.nazev, typ: r.typ, opravneni: r.opravneni ?? [] })),
        ...vl.map((r: any) => ({ klic: null, id: r.id, nazev: r.nazev, typ: r.typ, opravneni: r.opravneni ?? [] })),
      ]);
    })
    .catch(() => setRole([]));

  useEffect(() => {
    Promise.all([loadTeam(), loadInvites()]).finally(() => setLoading(false));
    loadRoles();
    fetch('/api/inventory/categories').then(okJson)
      .then(c => { if (Array.isArray(c)) setInvCategories(c); })
      .catch(() => { /* shortcuts just lose the category options */ });
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

  const [floatDraft, setFloatDraft] = useState<string | null>(null);
  const [savingFloat, setSavingFloat] = useState(false);
  const saveFloat = async () => {
    if (floatDraft === null) return;
    setSavingFloat(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawerFloat: floatDraft === '' ? null : parseInt(floatDraft) }),
      });
      if (res.ok) {
        setTeam(t => (t ? { ...t, drawer_float: floatDraft === '' ? null : parseInt(floatDraft) } : t));
        setFloatDraft(null);
        flash('Cílový stav kasy uložen.');
      } else setError('Nastavení se nepodařilo uložit.');
    } catch { setError('Nastavení se nepodařilo uložit.'); }
    setSavingFloat(false);
  };

  const [savingTeamSchedule, setSavingTeamSchedule] = useState(false);
  const toggleTeamSchedule = async (value: boolean) => {
    setSavingTeamSchedule(true);
    setTeam(t => (t ? { ...t, show_team_schedule: value } : t)); // optimisticky
    try {
      const res = await fetch('/api/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showTeamSchedule: value }),
      });
      if (res.ok) flash(value ? 'Tým teď vidí, kdo má kdy směnu.' : 'Zaměstnanci vidí jen svoje směny.');
      else { setTeam(t => (t ? { ...t, show_team_schedule: !value } : t)); setError('Nastavení se nepodařilo uložit.'); }
    } catch {
      setTeam(t => (t ? { ...t, show_team_schedule: !value } : t));
      setError('Nastavení se nepodařilo uložit.');
    } finally {
      setSavingTeamSchedule(false);
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

  // Build a working join link from a token, using the current origin so it's
  // correct regardless of any server-side APP_URL config.
  const inviteLink = (token?: string | null) =>
    token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join?token=${token}` : '';
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const copyInviteLink = async (token?: string | null) => {
    const link = inviteLink(token);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(token ?? null);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch { /* clipboard blocked */ }
  };

  const inviteOne = async (email: string) => {
    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, jobTitle: inviteJob.trim() || 'Barista', role: inviteRole }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Pozvánku se nepodařilo odeslat.');
    return data as { token?: string; emailSent?: boolean; emailError?: string | null };
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Nábor na sezónu znamená šest brigádníků naráz. Jedno pole na jeden
    // e-mail znamenalo šest kol formuláře a šest kopírování odkazu; teď jde
    // vložit celý seznam oddělený čárkou, středníkem, mezerou nebo řádky.
    const emails = Array.from(new Set(
      inviteEmail.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean)));
    if (emails.length === 0) return;
    setInviting(true);
    try {
      if (emails.length === 1) {
        const email = emails[0];
        try {
          const data = await inviteOne(email);
          setInviteEmail('');
          setInviteJob('Barista');
          setLastInvite({ email, token: data.token, emailSent: !!data.emailSent, emailError: data.emailError ?? null });
          flash(data.emailSent
            ? `Pozvánka odeslána na ${email}. Pro jistotu můžeš poslat i odkaz níže.`
            : `Pozvánka připravena — zkopíruj odkaz níže a pošli ho ${email}.`);
          loadInvites();
        } catch (err: any) {
          setError(err?.message || 'Pozvánku se nepodařilo odeslat.');
        }
        return;
      }

      // Server hlídá velikost týmu podle tarifu, takže část pozvánek může
      // projít a část ne. Kolik prošlo, se musí říct — „hotovo" by tu bylo
      // nepravdivé.
      const done: string[] = [];
      const failed: { email: string; why: string }[] = [];
      for (const email of emails) {
        try { await inviteOne(email); done.push(email); }
        catch (err: any) { failed.push({ email, why: err?.message ?? '' }); }
      }
      if (done.length > 0) {
        setInviteEmail(failed.map(f => f.email).join(', '));
        setLastInvite(null);
        flash(`Pozváno ${czCount(done.length, { one: 'člověk', few: 'lidi', many: 'lidí' })}. Odkazy najdeš níže v čekajících pozvánkách.`);
        loadInvites();
      }
      if (failed.length > 0) {
        setError(failed.length === emails.length
          ? (failed[0].why || 'Pozvánky se nepodařilo odeslat.')
          : `${czCount(failed.length, { one: 'pozvánka', few: 'pozvánky', many: 'pozvánek' })} neprošla: ${failed.map(f => f.email).join(', ')}${failed[0].why ? ` — ${failed[0].why}` : ''}`);
      }
    } finally {
      setInviting(false);
    }
  };

  const startEdit = (m: Member) => {
    setEditMemberId(m.id);
    setEditRole(roleClena(m));
    setEditJob(m.job_title ?? '');
    setEditRate(m.hourly_rate ? String(m.hourly_rate) : '');
    setError('');
  };

  const saveMember = async () => {
    if (editMemberId == null) return;
    const m = members.find(x => x.id === editMemberId);
    if (!m) return;
    // Posílá se jen to, co se změnilo A na co má přihlášený oprávnění.
    // Server odmítne celý požadavek, když chybí oprávnění k jedinému poli
    // (teams/members PATCH) — a sazba, kterou server neposlal (bez
    // finance.mzdy přijde null), by se jinak „uložila" jako nula.
    const telo: Record<string, unknown> = { userId: editMemberId };
    const vybrana = role.find(r => hodnotaRole(r) === editRole);
    if (smiPrirazovat && vybrana && editRole !== roleClena(m)) {
      if (vybrana.id != null) telo.roleId = vybrana.id; else telo.roleKlic = vybrana.klic;
    }
    if (smiPozici && editJob !== (m.job_title ?? '')) telo.jobTitle = editJob;
    const sazba = editRate === '' ? 0 : parseInt(editRate) || 0;
    if (smiSazbu && m.hourly_rate != null && sazba !== (m.hourly_rate ?? 0)) telo.hourlyRate = sazba;
    else if (smiSazbu && m.hourly_rate == null && editRate !== '') telo.hourlyRate = sazba;
    if (Object.keys(telo).length === 1) { setEditMemberId(null); return; }
    setSavingMember(true);
    try {
      const res = await fetch('/api/teams/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telo),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMembers(ms => ms.map(x => (x.id !== editMemberId ? x : {
          ...x,
          ...(telo.jobTitle !== undefined ? { job_title: editJob } : {}),
          ...(telo.hourlyRate !== undefined ? { hourly_rate: sazba } : {}),
          ...(vybrana && (telo.roleId !== undefined || telo.roleKlic !== undefined) ? {
            role_klic: vybrana.klic, role_id: vybrana.id, role_nazev: vybrana.nazev,
            // Typ účtu jde s rolí (rozhraní, rozvrh, žebříček) — stejně jako na serveru.
            role: vybrana.typ === 'vedeni' ? 'employer' : vybrana.typ === 'kiosk' ? 'kiosk' : 'employee',
          } : {}),
        })));
        setEditMemberId(null);
        flash('Změny člena byly uloženy.');
        if (telo.roleId !== undefined || telo.roleKlic !== undefined) loadRoles(); // počty lidí u rolí
      } else {
        // 403 říká server česky a přesně („Roli Vedení dává a bere jen vlastník…").
        setError(data.error || 'Změny se nepodařilo uložit.');
      }
    } catch {
      setError('Změny se nepodařilo uložit — spojení se serverem vypadlo.');
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
        <div className="spinner" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full">
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
      </div>
    );
  }

  if (!team) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full">
        <div className="glass-card p-8 text-center">
          <p className="text-black/45">Zatím nemáte žádný tým.</p>
        </div>
      </div>
    );
  }

  const isOwner = team.owner_id === user.id;
  // Role, které jde člověku přidělit: tablet (Kiosk) patří jen účtu tabletu.
  // Role s oprávněními navíc proti mým server odmítne — v nabídce zůstanou,
  // ale zamčené, ať je vidět proč.
  const vlastnik = isOwner || !!mojeRole?.jeVlastnik;
  const volbyRole = role.filter(r => r.typ !== 'kiosk');
  // Pravidlo proti eskalaci (lib/opravneni.ts): nepřidělíš roli, která má
  // něco navíc proti tvé, a nesáhneš na člena, který má víc než ty. Vedení
  // proti Vedení nemá nic navíc, takže vedoucí dál spravuje i jiné vedoucí
  // (jako před rolemi). Bez načtené vlastní role rozhoduje server.
  const vejdeSe = (sada: string[]) => mojeRole == null || sada.every(k => ma(k));
  const zamekRole = (r: VolbaRole): string | null => {
    if (vlastnik) return null;
    if (!vejdeSe(r.opravneni)) return 'víc než tvoje role';
    return null;
  };
  // Sada člena z výběru rolí (podle role_klic / role_id ze serveru); když ji
  // neznám (role se nenačetly), tlačítka nechám a rozhodne server.
  const sadaClena = (m: Member): string[] | null => {
    const v = roleClena(m);
    return v ? role.find(r => hodnotaRole(r) === v)?.opravneni ?? null : null;
  };
  const nadeMnou = (m: Member) => { const s = sadaClena(m); return !vlastnik && s != null && !vejdeSe(s); };
  const smiUpravitClena = smiPrirazovat || smiPozici || smiSazbu;
  // „Pozvat jako vedoucí" = přidělit Vedení: jen když se Vedení vejde do mé role.
  const sadaVedeni = role.find(r => r.klic === 'vedeni')?.opravneni;
  const smiPozvatVedeni = smiPrirazovat && (vlastnik || !sadaVedeni || vejdeSe(sadaVedeni));
  const pending = invitations.filter(i => i.status === 'pending');

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto w-full">
      <PageHeader hintId="teammanagement" title="Nastavení týmu" subtitle="Lidé, role, pozvánky a pravidla podniku." />
      <OrganizationSettings />
      {notice && (
        <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#5B7A08] text-sm flex items-center gap-2">
          <Icon name="check" size={16} /> {notice}
        </div>
      )}
      {error && (
        <div className="note note-danger p-4 text-sm flex items-center gap-2">
          <Icon name="warning" size={16} /> {error}
        </div>
      )}

      {/* Team name */}
      <div className="glass-card p-6 space-y-4">
        <div className="t-label flex items-center gap-2">
          <Icon name="users" size={16} /> Název týmu
        </div>
        {editingName ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <input value={teamName} onChange={e => setTeamName(e.target.value)} className={inputClass} />
            <div className="flex gap-2">
              <button onClick={saveName} disabled={savingName}
                className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition disabled:opacity-50 whitespace-nowrap">
                {savingName ? 'Ukládám…' : 'Uložit'}
              </button>
              <button onClick={() => { setEditingName(false); setTeamName(team.name); }}
                className="btn btn-secondary">
                Zrušit
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-2xl font-bold tracking-tight text-[#16181A] min-w-0 line-clamp-2">{team.name}</p>
            {ma('podnik.nastaveni') && (
            <button onClick={() => setEditingName(true)}
              className="btn btn-secondary flex-shrink-0 whitespace-nowrap">
              Přejmenovat
            </button>
            )}
          </div>
        )}
      </div>

      {/* Kód i pozvánky jsou vstupenka do podniku — jen s tym.pozvat
          (server bez něj kód ani nevrátí). */}
      {smiPozvat && (<>
      {/* Join code */}
      <div className="glass-card p-6 space-y-4">
        <div className="t-label flex items-center gap-2">
          <Icon name="check" size={16} /> Připojovací kód
        </div>
        <p className="text-sm text-black/45">Zaměstnanci se připojí zadáním tohoto kódu na stránce <span className="font-medium text-[#16181A]">/join</span>.</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 well border border-black/[0.08] px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-[0.25em] sm:tracking-[0.3em] text-[#5B7A08] break-all min-w-0">{team.join_code}</span>
            <button onClick={copyCode} title="Kopírovat"
              className="w-full sm:w-auto rounded-full glass border border-black/10 hover:bg-black/[0.06] text-[#16181A] px-4 py-2 text-sm font-medium transition whitespace-nowrap flex-shrink-0">
              {copied ? 'Zkopírováno ✓' : 'Kopírovat'}
            </button>
          </div>
          <button onClick={regenerate} disabled={regenerating}
            className="w-full sm:w-auto btn btn-secondary disabled:opacity-50 whitespace-nowrap flex-shrink-0">
            {regenerating ? 'Generuji…' : 'Vygenerovat nový'}
          </button>
        </div>
      </div>

      {/* Invite */}
      <div className="glass-card p-6 space-y-4">
        <div className="t-label flex items-center gap-2">
          <Icon name="plus" size={16} /> Pozvat nového člena
        </div>
        <form onSubmit={sendInvite} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="email@priklad.cz — nebo víc naráz" value={inviteEmail}
              aria-label="E-mail nebo víc e-mailů oddělených čárkou"
              onChange={e => setInviteEmail(e.target.value)} className={inputClass} />
            <input aria-label="Pozice nového člena (nepovinné)" placeholder="Pozice" value={inviteJob}
              onChange={e => setInviteJob(e.target.value)} className={inputClass} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 glass rounded-full p-1">
              {/* Pozvat jako vedení = přidělit roli; bez tym.role_prirazovat
                  jde pozvat jen do výchozí role podniku. */}
              {(smiPozvatVedeni ? [['employee', 'Zaměstnanec'], ['employer', 'Vedoucí']] : [['employee', 'Zaměstnanec']]).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setInviteRole(val)}
                  className={`filter-pill ${inviteRole === val ? 'seg-on' : 'seg-off'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button type="submit" disabled={inviting}
              className="w-full sm:w-auto justify-center rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition disabled:opacity-50 whitespace-nowrap sm:ml-auto">
              {inviting ? 'Odesílám…' : 'Odeslat pozvánku'}
            </button>
          </div>
          {inviteRole === 'employer' && (
            <p className="text-xs text-[#5B7A08] bg-[#C8F542]/10 border border-[#C8F542]/20 rounded-xl px-3 py-2">
              Vedoucí má plný přístup: správa týmu, rozvrhy, sklad, uzávěrky i docházka.
            </p>
          )}
        </form>

        {/* Freshly created invite — offer the join link for manual sharing. */}
        {lastInvite?.token && (
          <div className="rounded-2xl bg-[#C8F542]/[0.10] border border-[#C8F542]/30 p-4 space-y-2.5">
            <p className="text-sm font-semibold text-[#16181A] flex items-center gap-1.5">
              <Icon name="send" size={15} /> Pošli tento odkaz {lastInvite.email}
            </p>
            <p className="text-xs text-black/50">
              {lastInvite.emailSent
                ? 'E-mail jsme odeslali, ale nemusí vždy dorazit — nejjistější je poslat odkaz přímo (WhatsApp, SMS…).'
                : lastInvite.emailError
                  ? `E-mail neodešel (${lastInvite.emailError}), takže pozvánku doruč sám — zkopíruj odkaz a pošli ho.`
                  : 'E-mail není nastavený, takže pozvánku doruč sám — zkopíruj odkaz a pošli ho.'}
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={inviteLink(lastInvite.token)}
                onFocus={e => e.currentTarget.select()}
                className={`${inputClass} !py-2.5 text-xs font-mono`} />
              <button type="button" onClick={() => copyInviteLink(lastInvite.token)}
                className="shrink-0 rounded-full bg-[#16181A] text-white text-sm font-semibold px-4 py-2.5 hover:bg-black transition whitespace-nowrap">
                {copiedToken === lastInvite.token ? 'Zkopírováno ✓' : 'Kopírovat'}
              </button>
            </div>
          </div>
        )}

        <div className="pt-2">
          <p className="t-label mb-3">Odeslané pozvánky ({pending.length})</p>
          {invitations.length === 0 ? (
            <EmptyState illustration="tym" title="Zatím žádná pozvánka" hint="Pošli kód nebo odkaz — člověk se připojí za minutu a hned vidí rozvrh." compact />
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-[#16181A] line-clamp-2 break-all sm:break-normal">{inv.email}</p>
                    <p className="text-xs text-black/45">{inv.job_title || 'Barista'}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {inv.status === 'pending' && inv.token && (
                      <button type="button" onClick={() => copyInviteLink(inv.token)}
                        className="text-xs font-medium text-[#5B7A08] hover:underline whitespace-nowrap">
                        {copiedToken === inv.token ? 'Zkopírováno ✓' : 'Kopírovat odkaz'}
                      </button>
                    )}
                    {inv.status === 'pending' && (
                      <button type="button"
                        onClick={async () => {
                          if (!confirm(`Zrušit pozvánku pro ${inv.email}? Odkaz přestane platit.`)) return;
                          const res = await fetch(`/api/invitations?id=${inv.id}`, { method: 'DELETE' });
                          if (res.ok) setInvitations(prev => prev.map(x => x.id === inv.id ? { ...x, status: 'revoked' } : x));
                          else setError('Pozvánku se nepodařilo zrušit.');
                        }}
                        className="text-xs font-medium text-bad-ink/80 hover:text-bad-ink hover:underline whitespace-nowrap">
                        Zrušit
                      </button>
                    )}
                    <span className={`tap-target-sm rounded-full px-3 py-1 text-xs font-medium ${statusChip(inv.status)}`}>
                      {statusLabel(inv.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      </>)}

      {/* Members */}
      <div className="glass-card p-6 space-y-4">
        <div className="t-label flex items-center gap-2">
          <Icon name="users" size={16} /> Členové týmu ({members.length})
        </div>
        {/* Nad deset lidí se v seznamu hledalo Ctrl+F v prohlížeči — každý
            řádek přitom nese editaci role, pozice i sazby. */}
        {members.length > 8 && (
          <SearchField value={memberQ} onChange={setMemberQ} storageKey="tym"
            placeholder="Hledat člena — jméno, pozice…" ariaLabel="Hledat člena týmu" />
        )}
        <div className="divide-y divide-black/[0.06]">
          {shownMembers.length === 0 && (
            <p className="py-6 text-center text-sm text-black/45">Nikdo neodpovídá hledání.</p>
          )}
          {shownMembers.map(m => {
            const owner = m.id === team.owner_id;
            const editing = editMemberId === m.id;
            return (
              <div key={m.id} className="py-4">
                <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                  <div
                    {...clickable(() => setProfileId(m.id), { disabled: m.role !== 'employee', label: `Zobrazit profil — ${m.name}` })}
                    className={`w-11 h-11 rounded-full bg-[#C8F542]/15 border border-[#C8F542]/20 flex items-center justify-center text-xl flex-shrink-0 ${m.role === 'employee' ? 'cursor-pointer hover:brightness-105' : ''}`}
                    title={m.role === 'employee' ? 'Zobrazit profil' : undefined}
                  >
                    {m.avatar ?? '👤'}
                  </div>
                  {/* Na jeden řádek se jméno, role a tři tlačítka vejdou až od
                      640 px. Do té doby dostane jméno vlastní řádek — dřív se
                      od 420 px mačkalo do 39 px a „Eva Testová" byla „Eva…". */}
                  <div className="flex-1 min-w-0 basis-[calc(100%-3.5rem)] sm:basis-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        onClick={() => m.role === 'employee' && setProfileId(m.id)}
                        className={`font-bold tracking-tight text-[#16181A] truncate ${m.role === 'employee' ? 'cursor-pointer hover:underline decoration-black/25 underline-offset-2' : ''}`}
                        title={m.role === 'employee' ? 'Zobrazit profil' : undefined}
                      >{m.name}</p>
                      <span className={`tap-target-sm rounded-full px-3 py-1 text-xs font-medium ${roleChip(m.role)}`}>{nazevRole(m, role)}</span>
                      {owner && <span className="tap-target-sm rounded-full px-3 py-1 text-xs font-medium bg-black/[0.06] text-black/60">Vlastník</span>}
                      {m.aktivni_jinde && <span className="chip chip-sm chip-muted" title="Je členem i jiného podniku a je tam právě přepnutý. Tady zůstává v seznamu, rozvrhu i ve mzdách.">právě v jiném podniku</span>}
                    </div>
                    <p className="text-sm text-black/45 line-clamp-2 break-all sm:break-normal">{m.email}{m.job_title ? ` · ${m.job_title}` : ''}</p>
                  </div>
                  {!owner && !editing && (
                    <div className="flex items-center gap-2 flex-wrap min-w-0 basis-full sm:basis-auto sm:ml-auto">
                      {m.role === 'employee' && (
                        <button onClick={() => setProfileId(m.id)}
                          className="btn btn-primary transition whitespace-nowrap">
                          Profil
                        </button>
                      )}
                      {smiUpravitClena && !nadeMnou(m) && (
                      <button onClick={() => startEdit(m)}
                        className="rounded-full glass border border-black/10 hover:bg-black/[0.06] text-[#16181A] px-4 py-2 text-sm font-medium transition whitespace-nowrap">
                        Upravit
                      </button>
                      )}
                      {smiOdebrat && !nadeMnou(m) && m.id !== user.id && (
                      <button onClick={() => setRemoveTarget(m)}
                        className="rounded-full px-4 py-2 text-sm font-medium text-bad-ink hover:bg-bad/10 transition whitespace-nowrap">
                        Odebrat
                      </button>
                      )}
                    </div>
                  )}
                </div>

                {editing && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 pl-0 sm:pl-15">
                    <div className="min-w-0">
                      <label className="field-label" htmlFor={`clen-role-${m.id}`}>Role</label>
                      {/* Role = sada oprávnění (kolo 67). Přednastavené i vlastní
                          role podniku; co přidělit nesmím, je vidět, ale zamčené. */}
                      <Select id={`clen-role-${m.id}`} value={editRole} onChange={e => setEditRole(e.target.value)}
                        disabled={!smiPrirazovat || volbyRole.length === 0}>
                        {editRole === '' && <option value="">{nazevRole(m, role)} (beze změny)</option>}
                        <optgroup label="Přednastavené">
                          {volbyRole.filter(r => r.id == null).map(r => {
                            const z = zamekRole(r);
                            return <option key={hodnotaRole(r)} value={hodnotaRole(r)} disabled={!!z && hodnotaRole(r) !== roleClena(m)}>{r.nazev}{z ? ` — ${z}` : ''}</option>;
                          })}
                        </optgroup>
                        {volbyRole.some(r => r.id != null) && (
                          <optgroup label="Vlastní role">
                            {volbyRole.filter(r => r.id != null).map(r => {
                              const z = zamekRole(r);
                              return <option key={hodnotaRole(r)} value={hodnotaRole(r)} disabled={!!z && hodnotaRole(r) !== roleClena(m)}>{r.nazev}{z ? ` — ${z}` : ''}</option>;
                            })}
                          </optgroup>
                        )}
                      </Select>
                      <p className="text-[11px] text-black/40 mt-1.5">
                        {!smiPrirazovat ? 'Na přidělování rolí nemáš oprávnění.'
                          : volbyRole.length === 0 ? 'Role se nepodařilo načíst — zkus obrazovku otevřít znovu.'
                          : 'Co role smí, nastavíš v Nastavení → Role a oprávnění.'}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <label className="field-label" htmlFor={`clen-pozice-${m.id}`}>Pozice</label>
                      <input id={`clen-pozice-${m.id}`} value={editJob} onChange={e => setEditJob(e.target.value)} className={inputClass} disabled={!smiPozici} />
                      {!smiPozici && <p className="text-[11px] text-black/40 mt-1.5">Na úpravu pozice nemáš oprávnění.</p>}
                    </div>
                    <div className="min-w-0">
                      <label className="field-label" htmlFor={`clen-sazba-${m.id}`}>Hodinová sazba</label>
                      <div className="relative">
                        <input id={`clen-sazba-${m.id}`} value={editRate} inputMode="numeric" disabled={!smiSazbu}
                          onChange={e => setEditRate(e.target.value.replace(/\D/g, ''))}
                          placeholder={m.hourly_rate == null && !ma('finance.mzdy') ? 'skrytá' : '0'} className={`${inputClass} pr-14`} />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">{symbol}/h</span>
                      </div>
                      <p className="text-[11px] text-black/40 mt-1.5">{smiSazbu ? 'Použije se pro výpočet mezd v Docházce.' : 'Na úpravu sazeb nemáš oprávnění.'}</p>
                    </div>
                    <div className="sm:col-span-2 flex gap-2">
                      <button onClick={saveMember} disabled={savingMember}
                        className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition disabled:opacity-50">
                        {savingMember ? 'Ukládám…' : 'Uložit'}
                      </button>
                      <button onClick={() => setEditMemberId(null)}
                        className="btn btn-secondary">
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

      {/* Nastavení podniku podle oprávnění (kolo 67) — bez nich by každá
          změna skončila „nepodařilo se uložit". */}
      {ma(['podnik.nastaveni', 'finance.nastaveni']) && (
      /* Business / localization settings — makes the app fit any team */
      <div className="glass-card p-6 space-y-5">
        <div>
          <h3 className="t-card flex items-center gap-2">
            <Icon name="settings" size={18} /> Provoz podniku
          </h3>
          <p className="text-black/45 text-sm mt-1">Měna, formát čísel a cíle — přizpůsob appku svému podniku.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="min-w-0">
            <label className="field-label">Měna</label>
            <select value={team?.currency ?? 'CZK'} aria-label="Měna" disabled={savingBiz}
              onChange={e => saveBiz({ currency: e.target.value })}
              className={`${inputClass} appearance-none h-[46px]`} style={{ WebkitAppearance: 'none' }}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="field-label">Formát čísel (jazyk)</label>
            <select value={team?.locale ?? 'cs-CZ'} aria-label="Jazyk a formát" disabled={savingBiz}
              onChange={e => saveBiz({ locale: e.target.value })}
              className={`${inputClass} appearance-none h-[46px]`} style={{ WebkitAppearance: 'none' }}>
              {LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="field-label">Začátek týdne</label>
            <select value={String(team?.week_start ?? 1)} aria-label="Začátek týdne" disabled={savingBiz}
              onChange={e => saveBiz({ weekStart: Number(e.target.value) })}
              className={`${inputClass} appearance-none h-[46px]`} style={{ WebkitAppearance: 'none' }}>
              <option value="1">Pondělí</option>
              <option value="0">Neděle</option>
            </select>
          </div>
          <div className="min-w-0">
            <label className="field-label">Cíl mzdových nákladů</label>
            <div className="relative">
              <input type="number" inputMode="numeric" min={0} max={100} value={laborInput} disabled={savingBiz}
                onChange={e => setLaborInput(e.target.value)}
                onBlur={() => {
                  const v = laborInput.trim() === '' ? null : Math.max(0, Math.min(100, Math.round(Number(laborInput))));
                  if ((team?.labor_target_pct ?? null) !== v) saveBiz({ laborTargetPct: v });
                }}
                aria-label="Cílový podíl mzdových nákladů v procentech"
                placeholder="např. 30" className={`${inputClass} pr-10 h-[46px]`} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">%</span>
            </div>
            <p className="text-[11px] text-black/40 mt-1.5">Podíl mezd na tržbách — v Docházce se zvýrazní překročení.</p>
          </div>
        </div>
      </div>

      )}

      {/* Public share links + their look */}
      {/* Sdílené odkazy a Noisium jen s oprávněním — bez něj by seznam
          odkazů vypadal prázdný a „Odpojit" by potichu nic neudělalo. */}
      {ma('sdileni.spravovat') && <ShareSettings />}

      {/* Payout / cash settings */}
      {ma('uzaverky.nastaveni') && (
      <div className="glass-card p-6 space-y-4">
        <div>
          <h3 className="t-card flex items-center gap-2">
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
            className={`tap-target-sm relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${team?.pay_daily_cash ? 'bg-[#C8F542]' : 'bg-black/15'}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-[#FDFDFB] shadow transition-transform ${team?.pay_daily_cash ? 'translate-x-5' : ''}`} />
          </button>
        </label>

        <div className="h-px bg-black/[0.06]" />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm text-[#16181A]">Stav kasy po směně</p>
            <p className="text-xs text-black/45 mt-0.5">
              Kolik hotovosti má v kase zůstat pro další směnu. Uzávěrka pak sama spočítá,
              kolik odložit ven — počáteční stav, tržby a odvod se naklikají samy.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <input type="number" inputMode="numeric" min={0}
              value={floatDraft ?? (team?.drawer_float != null ? String(team.drawer_float) : '')}
              onChange={e => setFloatDraft(e.target.value)}
              aria-label="Kolik peněz zůstává v kase přes noc"
              placeholder="nenastaveno"
              className="w-32 field border border-black/[0.08] px-3.5 py-2 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none text-right tabular-nums" />
            {floatDraft !== null && (
              <button onClick={saveFloat} disabled={savingFloat}
                className="btn btn-primary btn-sm disabled:opacity-50 transition">
                {savingFloat ? '…' : 'Uložit'}
              </button>
            )}
          </div>
        </div>

        <div className="h-px bg-black/[0.06]" />

        <label className="flex items-start justify-between gap-4 cursor-pointer">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-[#16181A]">Tým vidí rozvrh ostatních</p>
            <p className="text-xs text-black/45 mt-0.5">Zaměstnanci uvidí, kdo má kdy směnu — jen jména a časy, žádné sazby. Když vypneš, uvidí každý jen sebe.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={team?.show_team_schedule !== false}
            disabled={savingTeamSchedule}
            onClick={() => toggleTeamSchedule(!(team?.show_team_schedule !== false))}
            className={`tap-target-sm relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${team?.show_team_schedule !== false ? 'bg-[#C8F542]' : 'bg-black/15'}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-[#FDFDFB] shadow transition-transform ${team?.show_team_schedule !== false ? 'translate-x-5' : ''}`} />
          </button>
        </label>

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
            className={`tap-target-sm relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${team?.closing_requires_shift !== false ? 'bg-[#C8F542]' : 'bg-black/15'}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-[#FDFDFB] shadow transition-transform ${team?.closing_requires_shift !== false ? 'translate-x-5' : ''}`} />
          </button>
        </label>
      </div>

      )}

      {/* Tablet: účet (kiosk.spravovat) a PINy lidí (dochazka.piny). */}
      {ma(['kiosk.spravovat', 'dochazka.piny']) && <KioskSettings />}

      {ma('integrace.spravovat') && <NoisiumConnect />}

      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4"
          onClick={() => !removing && setRemoveTarget(null)}>
          <div ref={removeModal.ref} {...removeModal.dialogProps} className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto scrollbar-thin"
            onClick={e => e.stopPropagation()}>
            <DiscardGuard guard={removeModal.guard} />
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-bad/15 border border-bad/20 flex items-center justify-center text-bad-ink">
                <Icon name="warning" size={20} />
              </div>
              <h3 className="t-card">Odebrat člena</h3>
            </div>
            <p className="text-sm text-black/60">
              Opravdu chcete odebrat <span className="text-[#16181A] font-medium">{removeTarget.name}</span> z týmu?
              Ztratí přístup k týmu.
            </p>
            <div className="flex flex-wrap gap-2 sm:gap-3 pt-2">
              <button onClick={confirmRemove} disabled={removing}
                className="rounded-full bg-bad text-[#16181A] font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition disabled:opacity-50">
                {removing ? 'Odebírám…' : 'Odebrat'}
              </button>
              <button onClick={() => setRemoveTarget(null)} disabled={removing}
                className="btn btn-secondary">
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}

      {profileId != null && (
        <EmployeeProfile employeeId={profileId} onClose={() => setProfileId(null)} />
      )}
    </div>
  );
}

