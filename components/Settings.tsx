'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Icon } from './Icons';
import TeamManagement from './TeamManagement';

interface Props {
  user: { id: number; name: string; role: string; avatar?: string };
}

interface Account {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  jobTitle?: string;
  shiftPreference?: string;
  role: string;
}

const AVATARS = ['👤', '👩‍💼', '👨‍🍳', '🧑‍🍳', '👩‍🍳', '🧑‍💼', '🙂', '😎', '🌿', '🍵'];

const inputClass =
  'w-full rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';
const labelClass = 'block text-xs uppercase tracking-wider text-white/40 mb-2';
const primaryBtn = 'rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 transition-all disabled:opacity-50';

type Tab = 'account' | 'security' | 'team';

export default function Settings({ user }: Props) {
  const { update } = useSession();
  const [tab, setTab] = useState<Tab>('account');

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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'account', label: 'Účet' },
    { id: 'security', label: 'Zabezpečení' },
    ...(isEmployer ? [{ id: 'team' as Tab, label: 'Tým' }] : []),
  ];

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Nastavení</h2>
        <p className="text-white/40 text-sm mt-1">Spravujte svůj profil, zabezpečení a tým.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-full p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              tab === t.id ? 'bg-[#C8F542] text-black font-semibold' : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-[#C8F542] animate-spin" />
        </div>
      ) : tab === 'account' ? (
        <form onSubmit={saveProfile} className="glass-card p-6 space-y-6">
          {profileMsg && (
            <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#C8F542] text-sm flex items-center gap-2">
              <Icon name="check" size={16} /> {profileMsg}
            </div>
          )}
          {profileErr && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm flex items-center gap-2">
              <Icon name="warning" size={16} /> {profileErr}
            </div>
          )}

          {/* Avatar picker */}
          <div>
            <label className={labelClass}>Avatar</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#C8F542]/15 border border-[#C8F542]/20 flex items-center justify-center text-3xl flex-shrink-0">
                {avatar}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {AVATARS.map(a => (
                  <button key={a} type="button" onClick={() => setAvatar(a)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${
                      avatar === a ? 'bg-[#C8F542]/20 border border-[#C8F542]/40' : 'bg-white/[0.06] border border-white/10 hover:bg-white/10'
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
                  <option value="morning" className="bg-neutral-900">🌅 Ranní</option>
                  <option value="afternoon" className="bg-neutral-900">🌆 Odpolední</option>
                  <option value="flexible" className="bg-neutral-900">🔄 Flexibilní</option>
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
      ) : tab === 'security' ? (
        <form onSubmit={savePassword} className="glass-card p-6 space-y-6">
          <div>
            <h3 className="font-bold tracking-tight text-white">Změna hesla</h3>
            <p className="text-white/40 text-sm mt-1">Nové heslo musí mít alespoň 8 znaků.</p>
          </div>

          {pwdMsg && (
            <div className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#C8F542] text-sm flex items-center gap-2">
              <Icon name="check" size={16} /> {pwdMsg}
            </div>
          )}
          {pwdErr && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm flex items-center gap-2">
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
  );
}
