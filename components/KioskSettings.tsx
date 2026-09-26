'use client';

import { useState, useEffect } from 'react';
import { Icon } from './Icons';
import { Avatar, Button, Chip, EmptyState, Field, ListRow } from './ui';
import { okJson } from '@/lib/api';

const inputClass =
  'w-full field border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm';

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
        fetch('/api/kiosk').then(okJson).catch(() => ({})),
        fetch('/api/attendance').then(okJson).catch(() => ({})),
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
    <div className="card p-6 space-y-4">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <h3 className="t-card flex items-center gap-2">
            <Icon name="clipboard" size={17} className="shrink-0 text-black/40" /> Tabletový účet (píchačky)
          </h3>
          <p className="t-meta mt-1">
            {kiosk ? `Připojeno — ${kiosk.email}` : 'Sdílené zařízení na provozovně, kde se zaměstnanci odpíchávají na směnu.'}
          </p>
        </div>
        <Icon name="chevron" size={18} className={`text-black/35 shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-5 pt-1">
          {msg && <div role="status" className="p-3 note note-ok text-sm">{msg}</div>}
          {err && <div role="alert" className="p-3 note note-danger text-sm">{err}</div>}

          <form onSubmit={saveAccount} className="space-y-3">
            <p className="t-label">Přihlášení tabletu</p>
            <p className="t-meta -mt-1">Na tabletu se přihlásíš tímto e-mailem a heslem. Otevře se režim píchaček.</p>
            {/* Pole s viditelným popiskem, ne jen placeholderem — ten zmizí,
                jakmile se začne psát (kolo 33). */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="kiosk-email" label="E-mail tabletu">
                <input id="kiosk-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tablet@mojekavarna.cz" required className={inputClass} />
              </Field>
              <Field id="kiosk-heslo" label={kiosk ? 'Nové heslo' : 'Heslo'} hint={kiosk ? 'Prázdné = heslo se nemění.' : 'Nejméně 4 znaky.'}>
                <input id="kiosk-heslo" type="text" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <Button type="submit" variant="primary" loading={busy}>
              {kiosk ? 'Uložit změny' : 'Vytvořit tabletový účet'}
            </Button>
          </form>

          <div className="h-px bg-black/[0.06]" />

          <div className="space-y-2.5">
            <p className="t-label">PIN pro odpíchnutí (nepovinné)</p>
            <p className="t-meta -mt-1">Když zaměstnanci nastavíš PIN, na tabletu ho zadá při příchodu — nikdo se nepodepíše za něj.</p>
            {members.length === 0 ? (
              <EmptyState icon="users" compact title="Zatím nikdo v týmu"
                hint="Na tabletu se odpíchnou lidé, které pozveš v Nastavení týmu." />
            ) : (
              // Lidé v .list (DP §3.9), avatar přes Avatar místo emoji 👤 v textu,
              // „PIN nastaven" jako stavový chip.
              <ul className="list">
                {members.map(m => (
                  <ListRow key={m.id}
                    lead={<Avatar emoji={m.avatar} size="sm" ring={false} />}
                    title={m.name}
                    right={m.hasPin ? <Chip tone="ok" size="sm" icon="lock">PIN</Chip> : undefined}
                    actions={<>
                      <input
                        value={pins[m.id] ?? ''} onChange={e => setPins(p => ({ ...p, [m.id]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                        inputMode="numeric" aria-label={`PIN pro ${m.name}`} placeholder={m.hasPin ? '••••' : 'PIN'}
                        className="w-24 field rounded-xl border border-black/[0.08] px-3 py-2 text-sm tabular-nums text-center focus:border-[#C8F542]/50 focus:outline-none shrink-0" />
                      <Button variant="secondary" size="sm" onClick={() => savePin(m.id)}>
                        {(pins[m.id] ?? '') ? 'Uložit' : m.hasPin ? 'Zrušit PIN' : 'Uložit'}
                      </Button>
                    </>}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
