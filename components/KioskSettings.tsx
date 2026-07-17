'use client';

import { useState, useEffect } from 'react';
import { Icon } from './Icons';

const inputClass =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

interface Member { id: number; name: string; avatar?: string; hasPin: boolean }

export default function KioskSettings() {
  const [kiosk, setKiosk] = useState<{ id: number; email: string } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [pins, setPins] = useState<Record<number, string>>({});

  const load = async () => {
    try {
      const [k, a] = await Promise.all([
        fetch('/api/kiosk').then(r => r.json()).catch(() => ({})),
        fetch('/api/attendance').then(r => r.json()).catch(() => ({})),
      ]);
      if (k?.kiosk) { setKiosk(k.kiosk); setEmail(k.kiosk.email); }
      setMembers(Array.isArray(a?.roster) ? a.roster : []);
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setMsg(m); setErr(''); setTimeout(() => setMsg(''), 3500); };

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/kiosk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const d = await res.json();
      if (res.ok) { setKiosk(d.kiosk); setPassword(''); flash('Tabletový účet uložen.'); }
      else setErr(d.error || 'Nepodařilo se uložit.');
    } catch { setErr('Chyba serveru.'); }
    setBusy(false);
  };

  const savePin = async (userId: number) => {
    const pin = (pins[userId] ?? '').replace(/\D/g, '');
    try {
      const res = await fetch('/api/kiosk', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pin: pin || null }),
      });
      const d = await res.json();
      if (res.ok) {
        setMembers(ms => ms.map(m => m.id === userId ? { ...m, hasPin: !!pin } : m));
        setPins(p => ({ ...p, [userId]: '' }));
        flash(pin ? 'PIN nastaven.' : 'PIN zrušen.');
      } else setErr(d.error || 'PIN se nepodařilo uložit.');
    } catch { setErr('Chyba serveru.'); }
  };

  return (
    <div className="glass-card p-6 space-y-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <h3 className="font-bold tracking-tight text-[#16181A] flex items-center gap-2">
            <span className="text-lg">📟</span> Tabletový účet (píchačky)
          </h3>
          <p className="text-black/45 text-sm mt-1">
            {kiosk ? `Připojeno — ${kiosk.email}` : 'Sdílené zařízení na provozovně, kde se zaměstnanci odpíchávají na směnu.'}
          </p>
        </div>
        <Icon name="chevron" size={18} className={`text-black/35 shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-5 pt-1">
          {msg && <div className="p-3 rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 text-[#5B7A08] text-sm">{msg}</div>}
          {err && <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">{err}</div>}

          <form onSubmit={saveAccount} className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-black/45">Přihlášení tabletu</p>
            <p className="text-xs text-black/45 -mt-1">Na tabletu se přihlásíš tímto e-mailem a heslem. Otevře se režim píchaček.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tablet@mojekavarna.cz" required className={inputClass} />
              <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder={kiosk ? 'Nové heslo…' : 'Heslo (min. 4 znaky)'} className={inputClass} />
            </div>
            <button type="submit" disabled={busy} className="rounded-full bg-[#16181A] text-white font-semibold px-5 py-2.5 text-sm hover:bg-black disabled:opacity-50 transition whitespace-nowrap">
              {busy ? 'Ukládám…' : kiosk ? 'Uložit změny' : 'Vytvořit tabletový účet'}
            </button>
          </form>

          <div className="h-px bg-black/[0.06]" />

          <div className="space-y-2.5">
            <p className="text-xs uppercase tracking-wider text-black/45">PIN pro odpíchnutí (nepovinné)</p>
            <p className="text-xs text-black/45 -mt-1">Když zaměstnanci nastavíš PIN, na tabletu ho zadá při příchodu — nikdo se nepodepíše za něj.</p>
            {members.length === 0 ? (
              <p className="text-sm text-black/40">Zatím žádní zaměstnanci.</p>
            ) : members.map(m => (
              <div key={m.id} className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-lg shrink-0">{m.avatar ?? '👤'}</span>
                  <span className="text-sm text-[#16181A] truncate">{m.name}</span>
                  {m.hasPin && <span className="text-[10px] rounded-full bg-[#C8F542]/20 text-[#5B7A08] px-2 py-0.5 font-medium shrink-0">PIN</span>}
                </span>
                <input
                  value={pins[m.id] ?? ''} onChange={e => setPins(p => ({ ...p, [m.id]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  inputMode="numeric" placeholder={m.hasPin ? '••••' : 'PIN'} className="w-24 rounded-xl bg-black/[0.04] border border-black/[0.08] px-3 py-2 text-sm tabular-nums text-center focus:border-[#C8F542]/50 focus:outline-none shrink-0" />
                <button onClick={() => savePin(m.id)} className="rounded-full glass border border-black/10 text-[#16181A] px-3 py-2 text-xs font-medium hover:bg-black/[0.05] transition whitespace-nowrap shrink-0">
                  {(pins[m.id] ?? '') ? 'Uložit' : m.hasPin ? 'Zrušit' : 'Uložit'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
