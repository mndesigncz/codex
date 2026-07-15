'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Icon } from './Icons';
import { useTheme } from './ThemeProvider';
import TeamManagement from './TeamManagement';

type SectionId = 'account' | 'app' | 'notifications' | 'security' | 'team';

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

const NOTIF_PREFS_KEY = 'pangea-notif-prefs';
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
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-300 ${
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
    { id: 'app', label: 'Aplikace', icon: 'leaf', desc: 'Vzhled, notifikace, jazyk' },
    { id: 'notifications', label: 'Notifikace', icon: 'bell', desc: 'Centrum oznámení' },
    { id: 'security', label: 'Zabezpečení', icon: 'check', desc: 'Heslo' },
    ...(isEmployer ? [{ id: 'team' as SectionId, label: 'Tým', icon: 'users', desc: 'Správa členů a pozvánek' }] : []),
  ];

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A]">Nastavení</h2>
        <p className="text-black/45 text-sm mt-1">Spravujte svůj profil, aplikaci, oznámení a zabezpečení.</p>
      </div>

      {/* Mobile: top pills */}
      <div className="md:hidden -mx-1 flex gap-1 overflow-x-auto scrollbar-thin pb-1 px-1">
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              section === s.id ? 'bg-[#C8F542] text-black font-semibold' : 'glass text-black/60 hover:text-black'
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
                  <div className="grid grid-cols-6 gap-2">
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

              {/* Notification preferences */}
              <div className="glass-card p-6 space-y-1">
                <div className="pb-2">
                  <h3 className={cardTitle}>Notifikace</h3>
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
            <div className="glass-card p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
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
                        {n.body && <p className="text-xs text-black/55 mt-0.5">{n.body}</p>}
                        <p className="text-[11px] text-black/35 mt-1">{relativeCzech(n.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
          ) : (
            <TeamManagement user={user} />
          )}
        </div>
      </div>
    </div>
  );
}
