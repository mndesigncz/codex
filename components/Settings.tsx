'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { PLAN_FEATURES, PRO_PRICE, planInfoOf, planLabel, czDays, type PlanInfo } from '@/lib/plan';
import { Icon } from './Icons';
import { useTheme } from './ThemeProvider';
import TeamManagement from './TeamManagement';
import { dbTimeDayHM } from '@/lib/pragueTime';

type SectionId = 'account' | 'app' | 'notifications' | 'security' | 'team' | 'billing' | 'audit' | 'pos';

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
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';
const labelClass = 'block text-xs uppercase tracking-wider text-black/45 mb-2';
const primaryBtn = 'rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all disabled:opacity-50';
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
  const [section, setSection] = useState<SectionId>(initialTab ?? 'account');
  const [interestSent, setInterestSent] = useState(false);
  const [auditEntries, setAuditEntries] = useState<any[] | null>(null);
  // POS (Storyous) connection form.
  const [posStatus, setPosStatus] = useState<any | null>(null);
  const [posForm, setPosForm] = useState({ clientId: '', clientSecret: '', merchantId: '', placeId: '' });
  const [posBusy, setPosBusy] = useState(false);
  const [posMsg, setPosMsg] = useState('');
  useEffect(() => {
    if (section !== 'pos' || posStatus) return;
    fetch('/api/pos').then(r => r.json()).then(setPosStatus).catch(() => setPosStatus({ connected: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
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
      fetch('/api/pos').then(r => r.json()).then(setPosStatus).catch(() => {});
    } else {
      const d = res ? await res.json().catch(() => ({})) : {};
      setPosMsg(d.error || 'Připojení se nepodařilo.');
    }
  };
  useEffect(() => {
    if (section !== 'audit' || auditEntries) return;
    fetch('/api/audit').then(r => r.json())
      .then(d => setAuditEntries(Array.isArray(d.entries) ? d.entries : []))
      .catch(() => setAuditEntries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

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

  const isEmployer = (account?.role ?? user.role) === 'employer';

  // Plan & trial for the billing section (employer only).
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  useEffect(() => {
    if (section !== 'billing' || plan) return;
    fetch('/api/teams').then(r => r.json())
      .then(d => setPlan(d.planInfo ?? planInfoOf(null)))
      .catch(() => setPlan(planInfoOf(null)));
  }, [section, plan]);

  useEffect(() => {
    fetch('/api/account')
      .then(r => r.json())
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
      .then(r => r.json())
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

  const sections: { id: SectionId; label: string; icon: string; desc: string }[] = [
    { id: 'account', label: 'Účet', icon: 'settings', desc: 'Profil a osobní údaje' },
    { id: 'app', label: 'Vzhled', icon: 'sun', desc: 'Světlý/tmavý režim a jazyk' },
    { id: 'notifications', label: 'Notifikace', icon: 'bell', desc: 'Centrum oznámení' },
    { id: 'security', label: 'Zabezpečení', icon: 'check', desc: 'Heslo' },
    ...(isEmployer ? [{ id: 'billing' as SectionId, label: 'Předplatné', icon: 'award', desc: 'Plán a fakturace' }] : []),
    ...(isEmployer ? [{ id: 'pos' as SectionId, label: 'Pokladna', icon: 'trend', desc: 'Napojení Storyous' }] : []),
    ...(isEmployer ? [{ id: 'audit' as SectionId, label: 'Historie změn', icon: 'clock', desc: 'Kdo co kdy změnil' }] : []),
  ];

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A]">Nastavení</h2>
        <p className="text-black/45 text-sm mt-1">Spravujte svůj profil, aplikaci, oznámení a zabezpečení.</p>
      </div>

      {/* Mobile: top pills */}
      <div className="md:hidden -mx-1 flex gap-1 overflow-x-auto scrollbar-thin pb-1 px-1">
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`whitespace-nowrap flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
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
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${
                section === s.id ? 'bg-[#16181A] text-white shadow-sm' : 'text-black/60 hover:text-black hover:bg-black/[0.05]'
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
              <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
            </div>
          ) : section === 'account' ? (
            <form onSubmit={saveProfile} className="glass-card p-6 space-y-6">
              {profileMsg && (
                <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#5B7A08] text-sm flex items-center gap-2">
                  <Icon name="check" size={16} /> {profileMsg}
                </div>
              )}
              {profileErr && (
                <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-red-600 text-sm flex items-center gap-2">
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
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${
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
                  <input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input value={account?.email ?? ''} disabled
                    className={inputClass + ' opacity-60 cursor-not-allowed'} />
                </div>
                <div>
                  <label className={labelClass}>Telefon</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+420…" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Pozice</label>
                  <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Barista" className={inputClass} />
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

              <div className="flex justify-end">
                <button type="submit" disabled={savingProfile} className={primaryBtn}>
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
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/[0.04] border border-black/[0.08] p-1.5 max-w-sm">
                  {([
                    { id: 'light', label: 'Světlý', icon: 'sun' },
                    { id: 'dark', label: 'Tmavý', icon: 'moon' },
                  ] as const).map(opt => (
                    <button key={opt.id} type="button" onClick={() => setTheme(opt.id)}
                      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                        theme === opt.id ? 'bg-[#C8F542] text-black shadow-sm' : 'text-black/55 hover:text-black hover:bg-black/[0.04]'
                      }`}>
                      <Icon name={opt.icon} size={17} /> {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className="glass-card p-6 space-y-4">
                <div>
                  <h3 className={cardTitle}>Jazyk</h3>
                  <p className="text-black/45 text-sm mt-1">Jazyk rozhraní aplikace.</p>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 opacity-70">
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
                    className="rounded-full glass border border-black/10 hover:bg-black/[0.05] text-[#16181A] px-4 py-2 text-sm font-medium transition-all whitespace-nowrap">
                    Označit vše jako přečtené
                  </button>
                )}
              </div>

              {notifsLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
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
                <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-red-600 text-sm flex items-center gap-2">
                  <Icon name="warning" size={16} /> {pwdErr}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Současné heslo</label>
                  <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Nové heslo</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Potvrdit nové heslo</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" disabled={savingPwd} className={primaryBtn}>
                  {savingPwd ? 'Ukládám…' : 'Změnit heslo'}
                </button>
              </div>
            </form>
          ) : section === 'billing' ? (
            <div className="space-y-4">
              {/* Current plan */}
              <div className="glass-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className={cardTitle}>Váš plán</h3>
                    <p className="text-black/45 text-sm mt-1">Co váš podnik v Managero aktuálně má.</p>
                  </div>
                  {plan && (
                    <span className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                      plan.effective === 'pro' ? 'bg-[#C8F542]/20 text-[#5B7A08]' : 'bg-black/[0.06] text-black/60'
                    }`}>
                      {planLabel(plan)}
                    </span>
                  )}
                </div>
                {plan?.trialing && (
                  <p className="mt-4 text-sm text-black/55 rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/25 px-4 py-3">
                    Zkušební období končí za <strong className="text-[#16181A]">{czDays(plan.trialDaysLeft)}</strong>.
                    Potom se podnik přepne na plán Zdarma — o data nepřijdete.
                  </p>
                )}
                <p className="mt-4 text-sm text-black/55 rounded-2xl bg-black/[0.03] border border-black/[0.07] px-4 py-3">
                  Plán <strong className="text-[#16181A]">Zdarma platí napořád</strong> — směny, uzávěrky, úkoly, chat i sklad
                  v něm fungují bez omezení času. Pro odemyká větší tým, kiosk, odměny, exporty, měsíční přehled a vlastní
                  vzhled sdílených stránek. Online platby teprve připravujeme.
                </p>
                {plan?.effective !== 'pro' || plan?.trialing ? (
                  <button
                    onClick={async () => {
                      if (interestSent) return;
                      const res = await fetch('/api/billing/interest', { method: 'POST' }).catch(() => null);
                      if (res?.ok) setInterestSent(true);
                    }}
                    className={`mt-3 w-full sm:w-auto rounded-full px-6 py-3 text-sm font-semibold transition ${
                      interestSent ? 'bg-[#C8F542]/20 text-[#5B7A08] cursor-default' : 'bg-[#16181A] text-white hover:bg-black'
                    }`}>
                    {interestSent ? 'Díky! Ozveme se, až půjde Pro zaplatit ✓' : 'Mám zájem o Pro — dejte mi vědět'}
                  </button>
                ) : null}
              </div>

              {/* Plan comparison */}
              <div className="glass-card p-6">
                <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                  <h3 className={cardTitle}>Zdarma vs. Pro</h3>
                  <p className="text-sm text-black/45">
                    Pro: <strong className="text-[#16181A]">{PRO_PRICE.monthly} {PRO_PRICE.currency}</strong> {PRO_PRICE.per}
                  </p>
                </div>
                <div className="overflow-x-auto -mx-2 px-2">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-black/40">
                        <th className="py-2 pr-3 font-semibold">Funkce</th>
                        <th className="py-2 px-3 font-semibold w-28">Zdarma</th>
                        <th className="py-2 pl-3 font-semibold w-40 text-[#5B7A08]">Pro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                      {PLAN_FEATURES.map(f => (
                        <tr key={f.label}>
                          <td className="py-2.5 pr-3 text-[#16181A]">{f.label}</td>
                          <td className="py-2.5 px-3 text-black/55">
                            {f.free === true ? <Icon name="check" size={16} className="text-[#5B7A08]" /> : f.free === false ? <span className="text-black/25">—</span> : f.free}
                          </td>
                          <td className="py-2.5 pl-3 text-black/70">
                            {f.pro === true ? <Icon name="check" size={16} className="text-[#5B7A08]" /> : f.pro === false ? <span className="text-black/25">—</span> : f.pro}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : section === 'pos' ? (
            <div className="glass-card p-6">
              <h3 className={cardTitle}>Napojení pokladny Storyous</h3>
              <p className="text-black/45 text-sm mt-1 mb-4">
                Jen čtení: appka si bere tržby z účtenek — nic do pokladny nezapisuje. Klíče se ukládají bezpečně na serveru.
              </p>
              {posMsg && <p className={`text-sm rounded-2xl px-4 py-2.5 mb-3 ${posMsg.includes('✓') ? 'bg-[#C8F542]/10 text-[#5B7A08] border border-[#C8F542]/25' : 'bg-red-500/10 text-red-600 border border-red-500/25'}`}>{posMsg}</p>}
              {posStatus?.connected ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/25 px-4 py-3">
                    <p className="text-sm font-semibold text-[#16181A]">✅ Připojeno: {posStatus.placeName ?? posStatus.merchantId}</p>
                    <p className="text-xs text-black/45 mt-0.5">Client ID {posStatus.clientIdMasked} · tržby se předvyplňují v uzávěrce a večerním souhrnu.</p>
                  </div>
                  <button onClick={async () => {
                    if (!confirm('Odpojit pokladnu? Tržby se přestanou načítat.')) return;
                    await fetch('/api/pos', { method: 'DELETE' }).catch(() => null);
                    setPosStatus({ connected: false }); setPosMsg('Pokladna odpojena.');
                  }} className="rounded-full glass text-black/50 hover:text-red-600 px-4 py-2.5 text-sm font-medium transition">
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
                        className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] font-mono focus:border-[#C8F542]/50 focus:outline-none" />
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
          ) : section === 'audit' ? (
            <div className="glass-card p-6">
              <h3 className={cardTitle}>Historie změn</h3>
              <p className="text-black/45 text-sm mt-1 mb-4">Důležité zásahy v týmu — mazání, nastavení, odměny. Posledních 100 záznamů.</p>
              {auditEntries === null ? (
                <div className="flex items-center justify-center h-24">
                  <div className="h-7 w-7 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
                </div>
              ) : auditEntries.length === 0 ? (
                <p className="text-sm text-black/40">Zatím žádné záznamy.</p>
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
