'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { planInfoOf, type PlanInfo } from '@/lib/plan';
import Billing from './Billing';
import { Icon } from './Icons';
import { EmptyState, Button, Skeleton, PageHeader, Segmented, SwitchRow, Badge, ListRow, Chip, Modal, Stat, StatRow, Label, hintsEnabled, setHintsEnabled, resetHints, dismissedCount } from './ui';
import { useTheme } from './ThemeProvider';
import TeamManagement from './TeamManagement';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { czCount } from '@/lib/czech';
import { okJson } from '@/lib/api';
import { useOpravneni } from './role/useOpravneni';
import { useStrazRole, CO_SE_ZAHODI_ROLE } from './role/rozepsano';
import { DiscardGuard } from './ui/DiscardGuard';
import dynamic from 'next/dynamic';

// Editor rolí nese celý katalog oprávnění (přes sto šedesát položek
// s popisy) — stahuje se, až když ho někdo otevře, ne s každým Nastavením.
const RoleEditor = dynamic(() => import('./role/RoleEditor'), { loading: () => <div className="flex items-center justify-center h-48"><div className="spinner" /></div> });
// Výchozí rozložení stránek (kolo 68) nese plochu s editorem úprav — taky až na otevření.
const VychoziRozlozeni = dynamic(() => import('./widgety/VychoziRozlozeni'), { loading: () => <Skeleton className="h-48 rounded-3xl" /> });

type SectionId = 'account' | 'app' | 'notifications' | 'security' | 'team' | 'billing' | 'audit' | 'pos' | 'roles' | 'stranky';

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
// Nadpis karty skupiny = h2.t-card (DP §3.3). Dřív ruční `font-bold
// tracking-tight` a hlavní akce formulářů ručně psanou limetkou.
const cardTitle = 't-card';

const typeIcon: Record<string, string> = {
  chat: 'chat', inventory: 'box', shift: 'calendar', invite: 'users', info: 'bell',
};

const UCTENKA = { one: 'účtenka', few: 'účtenky', many: 'účtenek' };
const POLOZKA = { one: 'položka', few: 'položky', many: 'položek' };

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
    // Výchozí plocha pro typ role nebo roli a zámky (spec §3.8); tablet stačí spravovat.
    ...(isEmployer && ma(['podnik.nastaveni', 'kiosk.spravovat']) ? [{ id: 'stranky' as SectionId, label: 'Stránky', icon: 'overview', desc: 'Výchozí plocha a zámky' }] : []),
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
  // Hláška u pokladny nese tón zvlášť. Dřív se úspěch poznal podle „✓"
  // v textu — znak místo ikony a křehké pravidlo (DP §3.7).
  const [posMsg, setPosMsgStav] = useState<{ text: string; ok: boolean } | null>(null);
  const setPosMsg = (text: string, ok = false) => setPosMsgStav(text ? { text, ok } : null);
  // Potvrzení nevratných kroků pokladny oknem, ne nativním confirm() (DP §3.10).
  const [potvrzeni, setPotvrzeni] = useState<null | { title: string; text: string; label: string; danger: boolean; akce: () => void | Promise<void> }>(null);
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
        ? 'Synchronizace běžela před chvílí — pokladna se ptá nejvýš jednou za pár minut.'
        : `Synchronizováno — účtenek prošlo ${b.billsSeen ?? 0}, nových či změněných ${b.billsChanged ?? 0}${b.itemsPending ? `, ${czCount(b.itemsPending, POLOZKA)} dotáhne příští běh` : ''}.`, true);
    } else if (action === 'backfill') {
      setPosMsg(`Historie načtena: ${czCount(d.bills?.billsSeen ?? 0, UCTENKA)}.`, true);
    } else if (action === 'webhook-secret') {
      setPosMsg('Nové tajemství pro DataSync vygenerováno. Pošli URL i tajemství podpoře Storyous.', true);
    } else if (action === 'webhook-off') {
      setPosMsg('Příjem změn z pokladny je vypnutý.', true);
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
      setPosMsg(`Připojeno k provozovně ${d.placeName ?? ''}.`, true);
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
      <PageHeader title="Nastavení" subtitle="Spravujte svůj profil, aplikaci, oznámení a zabezpečení." />
      <DiscardGuard guard={straz.guard} what={CO_SE_ZAHODI_ROLE} />

      {/* Telefon: sekce jako posuvný pás filtrových pilulek. Dřív ruční
          pilulky bez náznaku, že pás pokračuje — poslední byla useknutá.
          Segmented umí přetečení s měkkým okrajem sám. */}
      <div className="md:hidden">
        <Segmented ariaLabel="Sekce nastavení" value={section} onChange={id => setSection(id)}
          options={sections.map(s => ({ id: s.id, label: s.label, icon: s.icon, count: s.id === 'notifications' && unreadCount > 0 ? unreadCount : undefined }))} />
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
                <span className={`block text-xs truncate ${section === s.id ? 'text-white/60' : 'text-black/55'}`}>{s.desc}</span>
              </span>
              {s.id === 'notifications' && (
                <Badge count={unreadCount} label={`Nepřečtená oznámení: ${unreadCount}`} />
              )}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <Skeleton className="h-72 rounded-3xl" />
          ) : section === 'account' ? (
            <form onSubmit={saveProfile} className="card p-6 space-y-6">
              {profileMsg && (
                <div role="status" className="note note-ok p-4 text-sm flex items-center gap-2">
                  <Icon name="check" size={16} className="shrink-0" /> {profileMsg}
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
                  <div className="w-16 h-16 rounded-full bg-[var(--well)] border border-[var(--well-line)] flex items-center justify-center text-3xl flex-shrink-0" aria-hidden>
                    {avatar}
                  </div>
                  <div className="flex flex-wrap gap-2 min-w-0 max-w-full">
                    {AVATARS.map(a => (
                      // Vybraný avatar nese inkoustový prstenec, ne limetkový tón —
                      // limetka na obrazovce patří tlačítku Uložit.
                      <button key={a} type="button" onClick={() => setAvatar(a)} aria-pressed={avatar === a} aria-label={`Avatar ${a}`}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition ${
                          avatar === a ? 'bg-black/[0.04] ring-2 ring-[#16181A]' : 'bg-black/[0.04] border border-black/[0.08] hover:bg-black/[0.06]'
                        }`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="nast-jmeno" className={labelClass}>Jméno</label>
                  <input id="nast-jmeno" value={name} aria-label="Jméno" onChange={e => setName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="nast-email" className={labelClass}>E-mail</label>
                  <input id="nast-email" value={account?.email ?? ''} aria-label="E-mail" disabled
                    className={inputClass + ' opacity-60 cursor-not-allowed'} />
                </div>
                <div>
                  <label htmlFor="nast-telefon" className={labelClass}>Telefon</label>
                  <input id="nast-telefon" value={phone} aria-label="Telefon" onChange={e => setPhone(e.target.value)} placeholder="+420…" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="nast-pozice" className={labelClass}>Pozice</label>
                  <input id="nast-pozice" value={jobTitle} aria-label="Pozice" onChange={e => setJobTitle(e.target.value)} placeholder="Barista" className={inputClass} />
                </div>
                {!isEmployer && (
                  <div className="sm:col-span-2">
                    <label htmlFor="nast-preference" className={labelClass}>Preference směn</label>
                    <select id="nast-preference" value={shiftPreference} onChange={e => setShiftPreference(e.target.value)}
                      className={inputClass + ' appearance-none'}>
                      <option value="morning">Ranní</option>
                      <option value="afternoon">Odpolední</option>
                      <option value="flexible">Flexibilní</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-end">
                <Button type="submit" variant="accent" block loading={savingProfile}>Uložit změny</Button>
              </div>
            </form>
          ) : section === 'app' ? (
            <div className="space-y-6">
              {/* Vzhled: přepínač motivu je Segmented (vybráno = inkoust).
                  Dřív dvě ruční volby, kde vybraná byla plná limetka. */}
              <section className="card p-6 space-y-4">
                <div>
                  <h2 className={cardTitle}>Vzhled</h2>
                  <p className="t-meta mt-1">Vyberte světlý nebo tmavý motiv aplikace.</p>
                </div>
                <Segmented ariaLabel="Motiv aplikace" value={theme === 'dark' ? 'dark' : 'light'} onChange={id => setTheme(id)}
                  options={[{ id: 'light', label: 'Světlý', icon: 'sun' }, { id: 'dark', label: 'Tmavý', icon: 'moon' }]} />
              </section>

              {/* Nápovědy: zapnuto/vypnuto je přepínač, ne dvě limetkové volby. */}
              <section className="card p-6 space-y-4">
                <h2 className={cardTitle}>Nápovědy</h2>
                <ul className="list">
                  <SwitchRow title="Zobrazovat nápovědy"
                    hint="Krátké rady u obrazovek. Jednotlivou radu zavřeš křížkem a už se neukáže — tady je můžeš všechny vrátit nebo vypnout úplně."
                    checked={hintsOn} onChange={v => { setHintsEnabled(v); setHintsOn(v); }} />
                </ul>
                {hintsHidden > 0 && (
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <p className="t-meta">
                      Zavřených rad: <span className="tabular-nums font-semibold">{hintsHidden}</span>
                    </p>
                    <Button variant="secondary" size="sm" icon="refresh"
                      onClick={() => { resetHints(); setHintsHidden(0); setHintsOn(true); }}>
                      Zobrazit znovu všechny
                    </Button>
                  </div>
                )}
              </section>

              <section className="card p-6 space-y-4">
                <div>
                  <h2 className={cardTitle}>Jazyk</h2>
                  <p className="t-meta mt-1">Jazyk rozhraní aplikace.</p>
                </div>
                <ul className="list">
                  <ListRow title="Čeština" right={<Chip size="sm">Výchozí</Chip>} />
                </ul>
                <p className="t-meta">Další jazyky připravujeme.</p>
              </section>
            </div>
          ) : section === 'notifications' ? (
            <div className="space-y-6">
            {/* Předvolby: sdílený SwitchRow v jedné kartě s .list (DP §3.20).
                Starý ruční přepínač měl knoflík bez `left` — vypnutý
                vypadal jako zapnutý. */}
            <section className="card p-6 space-y-2">
              <div>
                <h2 className={cardTitle}>Předvolby notifikací</h2>
                <p className="t-meta mt-1">Nastavte, o čem chcete být informováni.</p>
              </div>
              <ul className="list">
                <SwitchRow title="Push notifikace" hint="Povolte oznámení v tomto prohlížeči." checked={prefs.push} onChange={togglePush} />
                <SwitchRow title="Nové zprávy" hint="Upozornění na nové zprávy v chatu." checked={prefs.messages} onChange={v => setPref('messages', v)} />
                <SwitchRow title="Nízké zásoby" hint="Když skladová položka klesne pod limit." checked={prefs.lowStock} onChange={v => setPref('lowStock', v)} />
                <SwitchRow title="Směny" hint="Změny v rozvrhu a nové směny." checked={prefs.shifts} onChange={v => setPref('shifts', v)} />
              </ul>
            </section>

            <section className="card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
                <div className="min-w-0">
                  <h2 className={cardTitle}>Centrum oznámení</h2>
                  <p className="t-meta mt-1">
                    {unreadCount > 0 ? `Nepřečtená oznámení: ${unreadCount}` : 'Vše přečteno'}
                  </p>
                </div>
                {unreadCount > 0 && (
                  <Button variant="secondary" size="sm" icon="check" onClick={markAllRead}>Označit vše jako přečtené</Button>
                )}
              </div>

              {notifsLoading ? (
                <div className="space-y-2" aria-busy="true" aria-label="Načítám oznámení">
                  {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : notifs.length === 0 ? (
                <EmptyState compact icon="bell" title="Žádná oznámení" hint="Až se něco stane, zobrazí se to tady." />
              ) : (
                <ul className="list">
                  {/* Řádek ručně v .list, ne ListRow: text oznámení se nesmí useknout
                      na jeden řádek (ListRow meta ořezává). Nepřečtené nese chip,
                      ne limetkový podklad. */}
                  {notifs.map(n => (
                    <li key={n.id} className="list-row !items-start">
                      <span className="well h-9 w-9 grid place-items-center text-black/55 shrink-0">
                        <Icon name={typeIcon[n.type] || 'bell'} size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[15px] leading-snug text-[#16181A] ${!n.is_read ? 'font-bold' : 'font-medium'}`}>{n.title}</span>
                        {n.body && <span className="block text-[13px] text-black/55 mt-0.5 break-words">{n.body}</span>}
                        <span className="block t-meta mt-1">{relativeCzech(n.created_at)}</span>
                      </span>
                      {!n.is_read && <Chip tone="info" size="sm" className="shrink-0">Nové</Chip>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            </div>
          ) : section === 'security' ? (
            <form onSubmit={savePassword} className="card p-6 space-y-6">
              <div>
                <h2 className={cardTitle}>Změna hesla</h2>
                <p className="t-meta mt-1">Nové heslo musí mít alespoň 8 znaků.</p>
              </div>

              {pwdMsg && (
                <div role="status" className="note note-ok p-4 text-sm flex items-center gap-2">
                  <Icon name="check" size={16} className="shrink-0" /> {pwdMsg}
                </div>
              )}
              {pwdErr && (
                <div className="note note-danger p-4 text-sm flex items-center gap-2">
                  <Icon name="warning" size={16} /> {pwdErr}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="nast-heslo" className={labelClass}>Současné heslo</label>
                  <input id="nast-heslo" type="password" value={currentPassword} aria-label="Stávající heslo" onChange={e => setCurrentPassword(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="nast-heslo-nove" className={labelClass}>Nové heslo</label>
                  <input id="nast-heslo-nove" type="password" value={newPassword} aria-label="Nové heslo" onChange={e => setNewPassword(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="nast-heslo-znovu" className={labelClass}>Potvrdit nové heslo</label>
                  <input id="nast-heslo-znovu" type="password" value={confirmPassword} aria-label="Nové heslo znovu" onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="accent" block loading={savingPwd}>Změnit heslo</Button>
              </div>
            </form>
          ) : section === 'billing' ? (
            <Billing />
          ) : section === 'pos' ? (
            <section className="card p-6">
              <h2 className={cardTitle}>Napojení pokladny Storyous</h2>
              <p className="t-meta mt-1 mb-4">
                Jen čtení: appka si bere tržby z účtenek — nic do pokladny nezapisuje. Klíče se ukládají bezpečně na serveru.
              </p>
              {posMsg && (
                <p role={posMsg.ok ? 'status' : 'alert'} className={`note ${posMsg.ok ? 'note-ok' : 'note-danger'} text-sm px-4 py-2.5 mb-3 flex items-start gap-2`}>
                  <Icon name={posMsg.ok ? 'check' : 'warning'} size={16} className="shrink-0 mt-0.5" /> <span className="min-w-0">{posMsg.text}</span>
                </p>
              )}
              {posStatus?.connected ? (
                <div className="space-y-4">
                  <div className="note note-ok px-4 py-3">
                    <p className="text-sm font-semibold"><Icon name="check" size={15} className="inline -mt-0.5 mr-1.5 shrink-0" /> Připojeno: {posStatus.placeName ?? posStatus.merchantId}</p>
                    <p className="text-xs text-black/55 mt-0.5">Client ID {posStatus.clientIdMasked} · účtenky, položky i katalog se zrcadlí do aplikace samy.</p>
                  </div>

                  {/* Zdraví: aplikace se synchronizuje sama, tady je vidět, že to opravdu dělá. */}
                  {posHealth?.connected && (
                    <div className="well p-4 space-y-3">
                      {/* Sdílené Stat/StatRow místo čtyř ručních statistik (DP §3.12). */}
                      <StatRow className="sm:grid-cols-4">
                        <Stat label="Účtenek u nás" value={posHealth.billsCount.toLocaleString('cs-CZ')} />
                        <Stat label="Data od" value={posHealth.firstDay ? new Date(posHealth.firstDay + 'T12:00:00').toLocaleDateString('cs-CZ') : '—'} />
                        <Stat label="Produktů s cenou" value={`${posHealth.productsWithPrice} / ${posHealth.productsCount}`} />
                        <Stat label="Poslední sync" value={posHealth.lastSyncAt ? dbTimeDayHM(posHealth.lastSyncAt) : 'zatím ne'} />
                      </StatRow>
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
                        {/* Ruční synchronizace je jen doplněk (appka se synchronizuje
                            sama) — vedlejší akce, ne limetka. */}
                        <Button variant="secondary" size="sm" icon="refresh" loading={posAction === 'sync'} disabled={!!posAction}
                          onClick={() => posDo('sync')}>
                          Synchronizovat teď
                        </Button>
                        <Button variant="secondary" size="sm" icon="download" loading={posAction === 'backfill'} disabled={!!posAction}
                          onClick={() => setPotvrzeni({
                            title: 'Načíst historii?', text: 'Načtou se účtenky za posledních 180 dní. Trvá to pár desítek sekund.',
                            label: 'Načíst historii', danger: false, akce: () => posDo('backfill', { days: 180 }),
                          })}>
                          Načíst historii (180 dní)
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* DataSync: Storyous umí změny posílat sám — zapíná to jejich podpora. */}
                  {posHealth?.connected && (
                    <div className="well p-4 space-y-2.5">
                      <h3 className="t-card">Okamžité změny z pokladny (DataSync)</h3>
                      <p className="text-xs text-black/60">
                        Storyous umí každou změnu poslat rovnou sem, bez čekání na další otevření aplikace. Zapíná to podpora Storyous/Teya pro tvoji provozovnu — pošli jim adresu a tajemství níže.
                        {posHealth.lastWebhookAt && <> Naposledy přišlo <strong>{dbTimeDayHM(posHealth.lastWebhookAt)}</strong>.</>}
                      </p>
                      {posHealth.webhookSecret ? (
                        <div className="space-y-1.5">
                          {([['Adresa (URL)', posHealth.webhookUrl], ['Tajemství (Authorization)', posHealth.webhookSecret]] as const).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2 min-w-0">
                              <span className="t-label w-28 shrink-0">{k}</span>
                              <code className="flex-1 min-w-0 truncate rounded-xl bg-[var(--surface)] border border-[var(--well-line)] px-3 py-1.5 text-xs">{v}</code>
                              <Button variant="secondary" size="sm" icon="copy" className="shrink-0"
                                onClick={() => { navigator.clipboard?.writeText(String(v)); setPosMsg('Zkopírováno.', true); }}>
                                Kopírovat
                              </Button>
                            </div>
                          ))}
                          <p className="t-meta">Metoda POST, data od dneška. Bez tajemství v hlavičce se požadavek zahodí.</p>
                          <Button variant="danger" size="sm" onClick={() => setPotvrzeni({
                            title: 'Vypnout příjem změn?', text: 'Staré tajemství přestane platit. Znovu zapnout půjde jen s novým tajemstvím přes podporu Storyous.',
                            label: 'Vypnout příjem', danger: true, akce: () => posDo('webhook-off'),
                          })}>Vypnout</Button>
                        </div>
                      ) : (
                        <Button variant="secondary" size="sm" icon="key" loading={posAction === 'webhook-secret'} disabled={!!posAction}
                          onClick={() => posDo('webhook-secret')}>
                          Vygenerovat adresu a tajemství
                        </Button>
                      )}
                    </div>
                  )}

                  <Button variant="danger" onClick={() => setPotvrzeni({
                    title: 'Odpojit pokladnu?', text: 'Tržby se přestanou načítat. Účtenky, které už v aplikaci jsou, zůstanou.',
                    label: 'Odpojit pokladnu', danger: true,
                    akce: async () => {
                      await fetch('/api/pos', { method: 'DELETE' }).catch(() => null);
                      setPosStatus({ connected: false }); setPosHealth(null); setPosMsg('Pokladna odpojena.', true);
                    },
                  })}>
                    Odpojit pokladnu
                  </Button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {([['clientId', 'Client ID'], ['clientSecret', 'Client Secret'], ['merchantId', 'Merchant ID'], ['placeId', 'Place ID']] as const).map(([k, lbl]) => (
                    <div key={k}>
                      <Label htmlFor={`pos-${k}`}>{lbl}</Label>
                      <input id={`pos-${k}`} value={(posForm as any)[k]} onChange={e => setPosForm(f => ({ ...f, [k]: e.target.value }))}
                        type={k === 'clientSecret' ? 'password' : 'text'} autoComplete="off"
                        className="w-full field border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] font-mono focus:border-[#C8F542]/50 focus:outline-none" />
                    </div>
                  ))}
                  {/* Jediná akce sekce → limetka (DP §3.1). */}
                  <Button variant="accent" block loading={posBusy} disabled={Object.values(posForm).some(v => !v.trim())} onClick={posConnect}>
                    Připojit a ověřit
                  </Button>
                  <p className="t-meta">Klíče získáš v back-office Storyous/Teya (API přístup).</p>
                </div>
              )}
            </section>
          ) : section === 'roles' ? (
            <RoleEditor />
          ) : section === 'stranky' ? (
            <VychoziRozlozeni />
          ) : section === 'audit' ? (
            <section className="card p-6">
              <h2 className={cardTitle}>Historie změn</h2>
              <p className="t-meta mt-1 mb-4">Důležité zásahy v týmu — mazání, nastavení, odměny. Posledních 100 záznamů.</p>
              {auditEntries === null ? (
                <div className="space-y-2" aria-busy="true" aria-label="Načítám historii">
                  {[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
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
                        <p className="t-meta tabular-nums">
                          {dbTimeDayHM(e.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <TeamManagement user={user} />
          )}
        </div>
      </div>

      <Modal open={!!potvrzeni} onClose={() => setPotvrzeni(null)} size="sm" title={potvrzeni?.title ?? ''}
        footer={<>
          <Button variant="secondary" onClick={() => setPotvrzeni(null)}>Zrušit</Button>
          <Button variant={potvrzeni?.danger ? 'danger-solid' : 'primary'} onClick={() => {
            const p = potvrzeni; setPotvrzeni(null); void p?.akce();
          }}>{potvrzeni?.label}</Button>
        </>}>
        <p className="t-meta text-pretty">{potvrzeni?.text}</p>
      </Modal>
    </div>
  );
}
