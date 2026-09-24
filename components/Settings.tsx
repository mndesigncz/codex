'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { planInfoOf, type PlanInfo } from '@/lib/plan';
import Billing from './Billing';
import { Icon } from './Icons';
import { EmptyState, Button, Hint, hintsEnabled, setHintsEnabled, resetHints, dismissedCount } from './ui';
import { useTheme } from './ThemeProvider';
import TeamManagement from './TeamManagement';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { okJson } from '@/lib/api';
import { useOpravneni } from './role/useOpravneni';
import { useStrazRole, CO_SE_ZAHODI_ROLE } from './role/rozepsano';
import { DiscardGuard } from './ui/DiscardGuard';
import dynamic from 'next/dynamic';

// Editor rolí nese celý katalog oprávnění (přes sto šedesát položek
// s popisy) — stahuje se, až když ho někdo otevře, ne s každým Nastavením.
const RoleEditor = dynamic(() => import('./role/RoleEditor'), { loading: () => <div className="flex items-center justify-center h-48"><div className="spinner" /></div> });

type SectionId = 'account' | 'app' | 'notifications' | 'security' | 'team' | 'billing' | 'audit' | 'pos' | 'roles';

interface Props {
  user: { id: number; name: string; role: string; avatar?: string };
  initialTab?: SectionId;
}

interface Account {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  jobTitle?: string;
  shiftPreference?: string;
  theme?: 'light' | 'dark';
  role: string;
}

interface Notif {
  id: number;
  title: string;
  body?: string;
  type: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

const AVATARS = ['👤', '👩‍💼', '👨‍🍳', '🧑‍🍳', '👩‍🍳', '🧑‍💼', '🙂', '😎', '🌿', '🍵', '🧋', '☕'];

const inputClass =
  'w-full field border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm';
const labelClass = 'field-label';
const primaryBtn = 'rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition disabled:opacity-50';
const cardTitle = 'font-bold tracking-tight text-[#16181A]';

const typeIcon: Record<string, string> = {
  chat: 'chat', inventory: 'box', shift: 'calendar', invite: 'users', info: 'bell',
};

const NOTIF_PREFS_KEY = 'managero-notif-prefs';
const DEFAULT_PREFS = { push: false, messages: true, lowStock: true, shifts: true };
type NotifPrefs = typeof DEFAULT_PREFS;

function relativeCzech(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 45) return 'právě teď';
  const m = Math.floor(s / 60);
  if (m < 60) return `před ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `před ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'včera';
  if (d < 7) return `před ${d} dny`;
  return new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors duration-300 disabled:opacity-40 ${
        on ? 'bg-[#C8F542]' : 'bg-black/[0.12]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-[#FDFDFB] shadow-sm transition-transform duration-300 ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export default function Settings({ user, initialTab }: Props) {
  const { update } = useSession();
  const { theme, setTheme } = useTheme();
  const [zvolena, setZvolena] = useState<SectionId>(initialTab ?? 'account');
  // Přepnutí záložky odmontuje editor rolí — u rozepsané role se nejdřív zeptá.
  const straz = useStrazRole();
  const setSection = (id: SectionId) => { if (id !== zvolena) straz.pokus(() => setZvolena(id)); };
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const isEmployer = (account?.role ?? user.role) === 'employer';
  // Záložky podniku podle oprávnění (kolo 67). Vedení má všechno, takže
  // vidí totéž co dřív; Provozní nebo Účetní jen to, co mu server dovolí.
  const { ma } = useOpravneni();
  const sections: { id: SectionId; label: string; icon: string; desc: string }[] = [
    { id: 'account', label: 'Účet', icon: 'settings', desc: 'Profil a osobní údaje' },
    { id: 'app', label: 'Vzhled', icon: 'sun', desc: 'Světlý/tmavý režim a jazyk' },
    { id: 'notifications', label: 'Notifikace', icon: 'bell', desc: 'Centrum oznámení' },
    { id: 'security', label: 'Zabezpečení', icon: 'check', desc: 'Heslo' },
    ...(isEmployer && ma('predplatne.zobrazit') ? [{ id: 'billing' as SectionId, label: 'Předplatné', icon: 'award', desc: 'Plán a fakturace' }] : []),
    ...(isEmployer && ma('pokladna.stav') ? [{ id: 'pos' as SectionId, label: 'Pokladna', icon: 'trend', desc: 'Napojení Storyous' }] : []),
    ...(isEmployer && ma(['tym.role_spravovat', 'tym.role_prirazovat']) ? [{ id: 'roles' as SectionId, label: 'Role a oprávnění', icon: 'lock', desc: 'Kdo co v podniku smí' }] : []),
    ...(isEmployer && ma('audit.zobrazit') ? [{ id: 'audit' as SectionId, label: 'Historie změn', icon: 'clock', desc: 'Kdo co kdy změnil' }] : []),
  ];
  // Záložka, na kterou role nemá, se nevykreslí, ani když na ni vede odkaz
  // (Receptury → „Nastavit pokladnu", banner předplatného) nebo když se
  // oprávnění načetla až po otevření. Obsah by jinak ukázal formulář
  // a jeho dotazy by skončily 403. Místo toho Účet — ten má každý.
  // 'team' v seznamu není, ale obsah má (správa týmu); pouští se se stejným
  // klíčem jako pohled Nastavení týmu, ať se jeho chování nemění.
  const povolena = sections.some(s => s.id === zvolena) || (zvolena === 'team' && isEmployer && ma('tym.zobrazit'));
  const section: SectionId = povolena ? zvolena : 'account';
  const [interestSent, setInterestSent] = useState(false);
  // Stav nápověd se čte až v prohlížeči — server localStorage nezná.
  const [hintsOn, setHintsOn] = useState(true);
  const [hintsHidden, setHintsHidden] = useState(0);
  useEffect(() => { setHintsOn(hintsEnabled()); setHintsHidden(dismissedCount()); }, [section]);
  const [auditEntries, setAuditEntries] = useState<any[] | null>(null);
  // POS (Storyous) connection form.
  const [posStatus, setPosStatus] = useState<any | null>(null);
  const [posForm, setPosForm] = useState({ clientId: '', clientSecret: '', merchantId: '', placeId: '' });
  const [posBusy, setPosBusy] = useState(false);
  const [posMsg, setPosMsg] = useState('');
  // Zdraví zrcadla pokladny (od kdy máme data, poslední synchronizace, chyby).
  const [posHealth, setPosHealth] = useState<any | null>(null);
  const [posAction, setPosAction] = useState<string>('');
  const loadPosHealth = () =>
    fetch('/api/pos/status').then(okJson).then(setPosHealth).catch(() => setPosHealth(null));
  useEffect(() => {
    if (section !== 'pos' || posStatus) return;
    fetch('/api/pos').then(okJson).then(setPosStatus).catch(() => setPosStatus({ connected: false }));
    loadPosHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
  const posDo = async (action: string, extra: Record<string, any> = {}) => {
    setPosAction(action); setPosMsg('');
    const res = await fetch('/api/pos/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setPosAction('');
    if (!res?.ok || d?.error) { setPosMsg(d?.error || 'Akce se nepodařila.'); return; }
    if (action === 'sync') {
      const b = d.bills ?? {};
      setPosMsg(b.skipped === 'throttled'
        ? 'Synchronizace běžela před chvílí — pokladna se ptá nejvýš jednou za pár minut. ✓'
        : `Synchronizováno ✓ ${b.billsSeen ?? 0} účtenek prošlo, ${b.billsChanged ?? 0} nových či změněných${b.itemsPending ? `, ${b.itemsPending} položek se dotáhne příště` : ''}.`);
    } else if (action === 'backfill') {
      setPosMsg(`Historie načtena ✓ ${d.bills?.billsSeen ?? 0} účtenek.`);
    } else if (action === 'webhook-secret') {
      setPosMsg('Nové tajemství pro DataSync vygenerováno ✓ Pošli URL i tajemství podpoře Storyous.');
    }
    loadPosHealth();
  };
  const posConnect = async () => {
    setPosBusy(true); setPosMsg('');
    const res = await fetch('/api/pos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(posForm),
    }).catch(() => null);
    setPosBusy(false);
    if (res?.ok) {
      const d = await res.json();
      setPosMsg(`Připojeno k provozovně ${d.placeName ?? ''} ✓`);
      setPosStatus(null); setPosForm({ clientId: '', clientSecret: '', merchantId: '', placeId: '' });
      fetch('/api/pos').then(okJson).then(setPosStatus).catch(() => {});
      loadPosHealth();
    } else {
      const d = res ? await res.json().catch(() => ({})) : {};
      setPosMsg(d.error || 'Připojení se nepodařilo.');
    }
  };
  useEffect(() => {
    if (section !== 'audit' || auditEntries) return;
    fetch('/api/audit').then(okJson)
      .then(d => setAuditEntries(Array.isArray(d.entries) ? d.entries : []))
      .catch(() => setAuditEntries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // Account form
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('👤');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [shiftPreference, setShiftPreference] = useState('flexible');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  // Security form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  // Notification preferences (localStorage)
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);

  // Notification center
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const [notifsLoaded, setNotifsLoaded] = useState(false);

  // Plan & trial for the billing section (employer only).
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  useEffect(() => {
    if (section !== 'billing' || plan) return;
    fetch('/api/teams').then(okJson)
      .then(d => setPlan(d.planInfo ?? planInfoOf(null)))
      .catch(() => setPlan(planInfoOf(null)));
  }, [section, plan]);

  useEffect(() => {
    fetch('/api/account')
      .then(okJson)
      .then(data => {
        if (data.user) {
          const u: Account = data.user;
          setAccount(u);
          setName(u.name ?? '');
          setAvatar(u.avatar ?? '👤');
          setPhone(u.phone ?? '');
          setJobTitle(u.jobTitle ?? '');
          setShiftPreference(u.shiftPreference ?? 'flexible');
          // Category prefs live on the server (synced across devices); push
          // stays a per-browser toggle tied to the actual subscription.
          if ((u as any).notifPrefs) setPrefs(p => ({ ...p, ...(u as any).notifPrefs }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_PREFS_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);

  const loadNotifs = () => {
    setNotifsLoading(true);
    fetch('/api/notifications')
      .then(okJson)
      .then(data => setNotifs(data.notifications || []))
      .catch(() => {})
      .finally(() => { setNotifsLoading(false); setNotifsLoaded(true); });
  };

  useEffect(() => {
    if (section === 'notifications' && !notifsLoaded) loadNotifs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const setPref = (key: keyof NotifPrefs, value: boolean) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    // Category prefs (not the browser-only push toggle) persist to the server.
    if (key !== 'push') {
      fetch('/api/account', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifPrefs: { [key]: value } }),
      }).catch(() => { /* best-effort; localStorage keeps the optimistic value */ });
    }
  };

  const togglePush = async (value: boolean) => {
    if (value && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
        setPref('push', perm === 'granted');
        return;
      } catch { /* ignore */ }
    }
    setPref('push', value);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErr('');
    setProfileMsg('');
    if (!name.trim()) { setProfileErr('Jméno nesmí být prázdné.'); return; }
    setSavingProfile(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          avatar,
          phone,
          jobTitle,
          ...(isEmployer ? {} : { shiftPreference }),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAccount(data.user);
        await update({ user: { name: name.trim(), avatar } });
        setProfileMsg('Profil byl uložen.');
        setTimeout(() => setProfileMsg(''), 4000);
      } else {
        setProfileErr(data.error || 'Profil se nepodařilo uložit.');
      }
    } catch {
      setProfileErr('Nastala chyba při ukládání.');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdErr('');
    setPwdMsg('');
    if (!currentPassword || !newPassword) { setPwdErr('Vyplňte všechna pole.'); return; }
    if (newPassword.length < 8) { setPwdErr('Nové heslo musí mít alespoň 8 znaků.'); return; }
    if (newPassword !== confirmPassword) { setPwdErr('Nová hesla se neshodují.'); return; }
    setSavingPwd(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwdMsg(data.message || 'Heslo bylo změněno.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPwdMsg(''), 4000);
      } else {
        setPwdErr(data.error || 'Heslo se nepodařilo změnit.');
      }
    } catch {
      setPwdErr('Nastala chyba při změně hesla.');
    } finally {
      setSavingPwd(false);
    }
  };

  const markAllRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    } catch { /* ignore */ }
  };

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="t-page">Nastavení</h1>
        <p className="text-black/45 text-sm mt-1">Spravujte svůj profil, aplikaci, oznámení a zabezpečení.</p>
      </div>
      <DiscardGuard guard={straz.guard} what={CO_SE_ZAHODI_ROLE} />

      {/* Mobile: top pills */}
      <div className="md:hidden -mx-1 flex gap-1 overflow-x-auto scrollbar-thin pb-1 px-1">
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} aria-pressed={section === s.id}
            className={`whitespace-nowrap flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition duration-300 flex items-center gap-2 ${
              section === s.id ? 'bg-[#16181A] text-white font-semibold' : 'glass text-black/60 hover:text-black'
            }`}>
            <Icon name={s.icon} size={16} /> {s.label}
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Desktop: left vertical section list */}
        <nav className="hidden md:flex flex-col gap-1 w-60 flex-shrink-0">
          {sections.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)} aria-pressed={section === s.id}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-2xl transition duration-200 ${
                section === s.id ? 'seg-on' : 'seg-off'
              }`}>
              <Icon name={s.icon} size={20} className="flex-shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold truncate">{s.label}</span>
                <span className={`block text-[11px] truncate ${section === s.id ? 'text-white/50' : 'text-black/40'}`}>{s.desc}</span>
              </span>
              {s.id === 'notifications' && unreadCount > 0 && (
                <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                  section === s.id ? 'bg-[#C8F542] text-black' : 'bg-[#C8F542] text-black'
                }`}>{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="spinner" />
            </div>
          ) : section === 'account' ? (
            <form onSubmit={saveProfile} className="glass-card p-6 space-y-6">
              {profileMsg && (
                <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#5B7A08] text-sm flex items-center gap-2">
                  <Icon name="check" size={16} /> {profileMsg}
                </div>
              )}
              {profileErr && (
                <div className="note note-danger p-4 text-sm flex items-center gap-2">
                  <Icon name="warning" size={16} /> {profileErr}
                </div>
              )}

              <div>
                <label className={labelClass}>Avatar</label>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="w-16 h-16 rounded-full bg-[#C8F542]/15 border border-[#C8F542]/20 flex items-center justify-center text-3xl flex-shrink-0">
                    {avatar}
                  </div>
                  <div className="flex flex-wrap gap-2 min-w-0 max-w-full">
                    {AVATARS.map(a => (
                      <button key={a} type="button" onClick={() => setAvatar(a)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition ${
                          avatar === a ? 'bg-[#C8F542]/20 border border-[#C8F542]/40' : 'bg-black/[0.04] border border-black/[0.08] hover:bg-black/[0.06]'
                        }`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Jméno</label>
                  <input value={name} aria-label="Jméno" onChange={e => setName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input value={account?.email ?? ''} aria-label="E-mail" disabled
                    className={inputClass + ' opacity-60 cursor-not-allowed'} />
                </div>
                <div>
                  <label className={labelClass}>Telefon</label>
                  <input value={phone} aria-label="Telefon" onChange={e => setPhone(e.target.value)} placeholder="+420…" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Pozice</label>
                  <input value={jobTitle} aria-label="Pozice" onChange={e => setJobTitle(e.target.value)} placeholder="Barista" className={inputClass} />
                </div>
                {!isEmployer && (
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Preference směn</label>
                    <select value={shiftPreference} onChange={e => setShiftPreference(e.target.value)}
                      className={inputClass + ' appearance-none'}>
                      <option value="morning">🌅 Ranní</option>
                      <option value="afternoon">🌆 Odpolední</option>
                      <option value="flexible">🔄 Flexibilní</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-end">
                <button type="submit" disabled={savingProfile} className={`${primaryBtn} w-full sm:w-auto justify-center`}>
                  {savingProfile ? 'Ukládám…' : 'Uložit změny'}
                </button>
              </div>
            </form>
          ) : section === 'app' ? (
            <div className="space-y-6">
              {/* Appearance */}
              <div className="glass-card p-6 space-y-4">
                <div>
                  <h3 className={cardTitle}>Vzhled</h3>
                  <p className="text-black/45 text-sm mt-1">Vyberte světlý nebo tmavý motiv aplikace.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 well border border-black/[0.08] p-1.5 max-w-sm">
                  {([
                    { id: 'light', label: 'Světlý', icon: 'sun' },
                    { id: 'dark', label: 'Tmavý', icon: 'moon' },
                  ] as const).map(opt => (
                    <button key={opt.id} type="button" onClick={() => setTheme(opt.id)}
                      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
                        theme === opt.id ? 'bg-[#C8F542] text-black shadow-sm' : 'text-black/55 hover:text-black hover:bg-black/[0.04]'
                      }`}>
                      <Icon name={opt.icon} size={17} /> {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nápovědy */}
              <div className="glass-card p-6 space-y-4">
                <div>
                  <h3 className={cardTitle}>Nápovědy</h3>
                  <p className="text-black/45 text-sm mt-1">
                    Krátké rady u obrazovek. Jednotlivou radu zavřeš křížkem a už se neukáže — tady je můžeš všechny vrátit nebo vypnout úplně.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 well border border-black/[0.08] p-1.5 max-w-sm">
                  {([
                    { on: true, label: 'Zobrazovat', icon: 'bulb' },
                    { on: false, label: 'Nezobrazovat', icon: 'close' },
                  ] as const).map(opt => (
                    <button key={String(opt.on)} type="button"
                      onClick={() => { setHintsEnabled(opt.on); setHintsOn(opt.on); }}
                      aria-pressed={hintsOn === opt.on}
                      className={`tap-target-sm flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
                        hintsOn === opt.on ? 'bg-[#C8F542] text-black shadow-sm' : 'text-black/55 hover:text-black hover:bg-black/[0.04]'
                      }`}>
                      <Icon name={opt.icon} size={17} /> {opt.label}
                    </button>
                  ))}
                </div>
                {hintsHidden > 0 && (
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <p className="text-xs text-black/45">
                      Zavřených rad: <span className="tabular-nums font-semibold">{hintsHidden}</span>
                    </p>
                    <Button variant="secondary" size="sm" icon="refresh"
                      onClick={() => { resetHints(); setHintsHidden(0); setHintsOn(true); }}>
                      Zobrazit znovu všechny
                    </Button>
                  </div>
                )}
              </div>

              {/* Language */}
              <div className="glass-card p-6 space-y-4">
                <div>
                  <h3 className={cardTitle}>Jazyk</h3>
                  <p className="text-black/45 text-sm mt-1">Jazyk rozhraní aplikace.</p>
                </div>
                <div className="flex items-center justify-between gap-4 well border border-black/[0.08] px-4 py-3 opacity-70">
                  <span className="text-sm font-medium text-[#16181A] flex items-center gap-2">🇨🇿 Čeština</span>
                  <span className="text-xs text-black/45">Výchozí</span>
                </div>
                <p className="text-xs text-black/40">Další jazyky připravujeme.</p>
              </div>
            </div>
          ) : section === 'notifications' ? (
            <div className="space-y-6">
            {/* Notification preferences */}
            <div className="glass-card p-6 space-y-1">
              <div className="pb-2">
                <h3 className={cardTitle}>Předvolby notifikací</h3>
                <p className="text-black/45 text-sm mt-1">Nastavte, o čem chcete být informováni.</p>
              </div>
              <div className="divide-y divide-black/[0.06]">
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#16181A]">Push notifikace</p>
                    <p className="text-xs text-black/45 mt-0.5">Povolte oznámení v tomto prohlížeči.</p>
                  </div>
                  <Toggle on={prefs.push} onChange={togglePush} />
                </div>
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#16181A]">Nové zprávy</p>
                    <p className="text-xs text-black/45 mt-0.5">Upozornění na nové zprávy v chatu.</p>
                  </div>
                  <Toggle on={prefs.messages} onChange={v => setPref('messages', v)} />
                </div>
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#16181A]">Nízké zásoby</p>
                    <p className="text-xs text-black/45 mt-0.5">Když skladová položka klesne pod limit.</p>
                  </div>
                  <Toggle on={prefs.lowStock} onChange={v => setPref('lowStock', v)} />
                </div>
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#16181A]">Směny</p>
                    <p className="text-xs text-black/45 mt-0.5">Změny v rozvrhu a nové směny.</p>
                  </div>
                  <Toggle on={prefs.shifts} onChange={v => setPref('shifts', v)} />
                </div>
              </div>
            </div>

            {/* Notification center */}
            <div className="glass-card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
                <div className="min-w-0">
                  <h3 className={cardTitle}>Centrum oznámení</h3>
                  <p className="text-black/45 text-sm mt-1">
                    {unreadCount > 0 ? `${unreadCount} nepřečtených oznámení` : 'Vše přečteno'}
                  </p>
                </div>
                {unreadCount > 0 && (
                  <button onClick={markAllRead}
                    className="rounded-full glass border border-black/10 hover:bg-black/[0.05] text-[#16181A] px-4 py-2 text-sm font-medium transition whitespace-nowrap">
                    Označit vše jako přečtené
                  </button>
                )}
              </div>

              {notifsLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="spinner" />
                </div>
              ) : notifs.length === 0 ? (
                <div className="py-14 text-center">
                  <div className="w-14 h-14 rounded-full bg-black/[0.04] border border-black/[0.08] flex items-center justify-center text-black/30 mx-auto mb-3">
                    <Icon name="bell" size={24} />
                  </div>
                  <p className="text-sm font-medium text-[#16181A]">Žádná oznámení</p>
                  <p className="text-xs text-black/45 mt-1">Až se něco stane, zobrazí se to tady.</p>
                </div>
              ) : (
                <div className="divide-y divide-black/[0.06] -mx-2">
                  {notifs.map(n => (
                    <div key={n.id}
                      className={`flex gap-3 px-2 py-3.5 rounded-xl ${!n.is_read ? 'bg-[#C8F542]/[0.05]' : ''}`}>
                      <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#C8F542]/15 text-[#5B7A08]">
                        <Icon name={typeIcon[n.type] || 'bell'} size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className={`text-sm truncate ${!n.is_read ? 'font-bold text-[#16181A]' : 'font-semibold text-[#16181A]'}`}>{n.title}</p>
                          {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-[#C8F542] flex-shrink-0" />}
                        </div>
                        {n.body && <p className="text-xs text-black/55 mt-0.5 break-words">{n.body}</p>}
                        <p className="text-[11px] text-black/35 mt-1">{relativeCzech(n.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          ) : section === 'security' ? (
            <form onSubmit={savePassword} className="glass-card p-6 space-y-6">
              <div>
                <h3 className={cardTitle}>Změna hesla</h3>
                <p className="text-black/45 text-sm mt-1">Nové heslo musí mít alespoň 8 znaků.</p>
              </div>

              {pwdMsg && (
                <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#5B7A08] text-sm flex items-center gap-2">
                  <Icon name="check" size={16} /> {pwdMsg}
                </div>
              )}
              {pwdErr && (
                <div className="note note-danger p-4 text-sm flex items-center gap-2">
                  <Icon name="warning" size={16} /> {pwdErr}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Současné heslo</label>
                  <input type="password" value={currentPassword} aria-label="Stávající heslo" onChange={e => setCurrentPassword(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Nové heslo</label>
                  <input type="password" value={newPassword} aria-label="Nové heslo" onChange={e => setNewPassword(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Potvrdit nové heslo</label>
                  <input type="password" value={confirmPassword} aria-label="Nové heslo znovu" onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" disabled={savingPwd} className={primaryBtn}>
                  {savingPwd ? 'Ukládám…' : 'Změnit heslo'}
                </button>
              </div>
            </form>
          ) : section === 'billing' ? (
            <Billing />
          ) : section === 'pos' ? (
            <div className="glass-card p-6">
              <h3 className={cardTitle}>Napojení pokladny Storyous</h3>
              <p className="text-black/45 text-sm mt-1 mb-4">
                Jen čtení: appka si bere tržby z účtenek — nic do pokladny nezapisuje. Klíče se ukládají bezpečně na serveru.
              </p>
              {posMsg && <p className={`text-sm rounded-2xl px-4 py-2.5 mb-3 ${posMsg.includes('✓') ? 'bg-[#C8F542]/10 text-[#5B7A08] border border-[#C8F542]/25' : 'bg-bad/10 text-bad-ink border border-bad/25'}`}>{posMsg}</p>}
              {posStatus?.connected ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/25 px-4 py-3">
                    <p className="text-sm font-semibold text-[#16181A]"><Icon name="check" size={15} className="inline -mt-0.5 mr-1.5 shrink-0" /> Připojeno: {posStatus.placeName ?? posStatus.merchantId}</p>
                    <p className="text-xs text-black/55 mt-0.5">Client ID {posStatus.clientIdMasked} · účtenky, položky i katalog se zrcadlí do aplikace samy.</p>
                  </div>

                  {/* Zdraví: aplikace se synchronizuje sama, tady je vidět, že to opravdu dělá. */}
                  {posHealth?.connected && (
                    <div className="rounded-2xl border border-black/[0.07] bg-black/[0.02] p-4 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {([
                          ['Účtenek u nás', posHealth.billsCount.toLocaleString('cs-CZ')],
                          ['Data od', posHealth.firstDay ? new Date(posHealth.firstDay + 'T12:00:00').toLocaleDateString('cs-CZ') : '—'],
                          ['Produktů s cenou', `${posHealth.productsWithPrice} / ${posHealth.productsCount}`],
                          ['Poslední sync', posHealth.lastSyncAt ? dbTimeDayHM(posHealth.lastSyncAt) : 'zatím ne'],
                        ] as const).map(([k, v]) => (
                          <div key={k} className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wider text-black/55 truncate">{k}</p>
                            <p className="text-sm font-bold text-[#16181A] tabular-nums truncate">{v}</p>
                          </div>
                        ))}
                      </div>
                      {posHealth.lastError && (
                        <p className="text-xs note note-danger px-3 py-2">
                          Poslední chyba{posHealth.lastErrorAt ? ` (${dbTimeDayHM(posHealth.lastErrorAt)})` : ''}: {posHealth.lastError}
                        </p>
                      )}
                      {posHealth.itemsPending > 0 && (
                        <p className="text-xs text-black/60">U {posHealth.itemsPending} účtenek se položky ještě dotahují — každý běh jich vezme sto padesát.</p>
                      )}
                      {/* Historie se u většího podniku stahuje po týdnech na pozadí. Bez
                          téhle věty vypadá „Data od" jako chyba, přitom se to jen plní. */}
                      {!posHealth.historyComplete && posHealth.backfillUntil && (
                        <p className="text-xs text-black/60">
                          Historie se ještě dotahuje na pozadí — po týdnech zpátky až k{' '}
                          {new Date(posHealth.backfillUntil + 'T12:00:00').toLocaleDateString('cs-CZ')}. Dnešní tržby to nezdržuje.
                        </p>
                      )}
                      <p className="text-xs text-black/60">
                        Synchronizuje se při každém otevření aplikace i kiosku (nejvýš jednou za pár minut), ráno cronem a večer před souhrnem. Ručně jen když nechceš čekat.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => posDo('sync')} disabled={!!posAction}
                          className="btn btn-accent btn-sm hover:brightness-105 disabled:opacity-50 transition inline-flex items-center gap-1.5">
                          <Icon name="refresh" size={15} /> {posAction === 'sync' ? 'Synchronizuji…' : 'Synchronizovat teď'}
                        </button>
                        <button onClick={() => { if (confirm('Načíst účtenky za posledních 180 dní? Trvá to pár desítek sekund.')) posDo('backfill', { days: 180 }); }} disabled={!!posAction}
                          className="rounded-full glass border border-black/10 text-[#16181A] px-4 py-2 text-sm font-medium hover:bg-black/[0.05] disabled:opacity-50 transition">
                          {posAction === 'backfill' ? 'Načítám…' : 'Načíst historii (180 dní)'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* DataSync: Storyous umí změny posílat sám — zapíná to jejich podpora. */}
                  {posHealth?.connected && (
                    <div className="rounded-2xl border border-black/[0.07] p-4 space-y-2.5">
                      <p className="text-sm font-semibold text-[#16181A]">Okamžité změny z pokladny (DataSync)</p>
                      <p className="text-xs text-black/60">
                        Storyous umí každou změnu poslat rovnou sem, bez čekání na další otevření aplikace. Zapíná to podpora Storyous/Teya pro tvoji provozovnu — pošli jim adresu a tajemství níže.
                        {posHealth.lastWebhookAt && <> Naposledy přišlo <strong>{dbTimeDayHM(posHealth.lastWebhookAt)}</strong>.</>}
                      </p>
                      {posHealth.webhookSecret ? (
                        <div className="space-y-1.5">
                          {([['Adresa (URL)', posHealth.webhookUrl], ['Tajemství (Authorization)', posHealth.webhookSecret]] as const).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] uppercase tracking-wider text-black/55 w-28 shrink-0">{k}</span>
                              <code className="flex-1 min-w-0 truncate well rounded-xl px-3 py-1.5 text-xs">{v}</code>
                              <button onClick={() => { navigator.clipboard?.writeText(String(v)); setPosMsg('Zkopírováno ✓'); }}
                                className="tap-target-sm shrink-0 rounded-full glass px-3 py-1.5 text-xs font-medium text-black/60 hover:text-black">Kopírovat</button>
                            </div>
                          ))}
                          <p className="text-[11px] text-black/55">Metoda POST, data od dneška. Bez tajemství v hlavičce se požadavek zahodí.</p>
                          <button onClick={() => { if (confirm('Vypnout příjem změn? Staré tajemství přestane platit.')) posDo('webhook-off'); }}
                            className="text-xs text-black/55 hover:text-bad-ink">Vypnout</button>
                        </div>
                      ) : (
                        <button onClick={() => posDo('webhook-secret')} disabled={!!posAction}
                          className="rounded-full glass border border-black/10 text-[#16181A] px-4 py-2 text-sm font-medium hover:bg-black/[0.05] disabled:opacity-50 transition">
                          Vygenerovat adresu a tajemství
                        </button>
                      )}
                    </div>
                  )}

                  <button onClick={async () => {
                    if (!confirm('Odpojit pokladnu? Tržby se přestanou načítat.')) return;
                    await fetch('/api/pos', { method: 'DELETE' }).catch(() => null);
                    setPosStatus({ connected: false }); setPosHealth(null); setPosMsg('Pokladna odpojena.');
                  }} className="rounded-full glass text-black/55 hover:text-bad-ink px-4 py-2.5 text-sm font-medium transition">
                    Odpojit pokladnu
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {([['clientId', 'Client ID'], ['clientSecret', 'Client Secret'], ['merchantId', 'Merchant ID'], ['placeId', 'Place ID']] as const).map(([k, lbl]) => (
                    <div key={k}>
                      <label className="block text-xs uppercase tracking-wider text-black/45 mb-1">{lbl}</label>
                      <input value={(posForm as any)[k]} onChange={e => setPosForm(f => ({ ...f, [k]: e.target.value }))}
                        type={k === 'clientSecret' ? 'password' : 'text'} autoComplete="off"
                        className="w-full field border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] font-mono focus:border-[#C8F542]/50 focus:outline-none" />
                    </div>
                  ))}
                  <button onClick={posConnect} disabled={posBusy || Object.values(posForm).some(v => !v.trim())}
                    className="w-full sm:w-auto rounded-full bg-[#16181A] text-white font-semibold px-6 py-3 text-sm hover:bg-black disabled:opacity-50 transition">
                    {posBusy ? 'Ověřuji…' : 'Připojit a ověřit'}
                  </button>
                  <p className="text-[11px] text-black/35">Klíče získáš v back-office Storyous/Teya (API přístup).</p>
                </div>
              )}
            </div>
          ) : section === 'roles' ? (
            <RoleEditor />
          ) : section === 'audit' ? (
            <div className="glass-card p-6">
              <h3 className={cardTitle}>Historie změn</h3>
              <p className="text-black/45 text-sm mt-1 mb-4">Důležité zásahy v týmu — mazání, nastavení, odměny. Posledních 100 záznamů.</p>
              {auditEntries === null ? (
                <div className="flex items-center justify-center h-24">
                  <div className="spinner" />
                </div>
              ) : auditEntries.length === 0 ? (
                <EmptyState icon="clock" title="Zatím žádný záznam" hint="Kdo co změnil, se sem zapisuje samo — smazání, schválení, úpravy cen." compact />
              ) : (
                <div className="divide-y divide-black/[0.05]">
                  {auditEntries.map(e => (
                    <div key={e.id} className="flex items-start gap-3 py-2.5">
                      <span className="shrink-0 text-lg">{e.userAvatar}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[#16181A]">
                          <strong>{e.userName}</strong> · {e.label}
                          {e.detail && <span className="text-black/50"> — {e.detail}</span>}
                        </p>
                        <p className="text-[11px] text-black/35 tabular-nums">
                          {dbTimeDayHM(e.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <TeamManagement user={user} />
          )}
        </div>
      </div>
    </div>
  );
}
