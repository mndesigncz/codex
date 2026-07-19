'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../Icons';

// Lets the employer clock themselves in/out — they can work a shift too.
export default function ClockWidget({ userId }: { userId: number }) {
  const [openSince, setOpenSince] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const d = await fetch('/api/attendance').then(r => r.json());
      const me = (d.roster ?? []).find((r: any) => Number(r.id) === userId);
      setOpenSince(me?.openSince ?? null);
    } catch { /* ignore */ }
    setLoaded(true);
  }, [userId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const punch = async () => {
    setBusy(true);
    try {
      await fetch('/api/attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: userId, action: openSince ? 'out' : 'in' }),
      });
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  };

  if (!loaded) return null;
  const on = !!openSince;
  const secs = on ? Math.max(0, Math.round((now - new Date(openSince).getTime()) / 1000)) : 0;
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const timer = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  return (
    <div className={`rounded-3xl p-5 flex items-center justify-between gap-3 flex-wrap border ${on ? 'bg-[#C8F542]/[0.12] border-[#C8F542]/40' : 'glass-card'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full shrink-0 ${on ? 'bg-[#16181A] text-[#C8F542]' : 'bg-[#C8F542]/15 text-[#5B7A08]'}`}>
          <Icon name="clock" size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-[#16181A] truncate">{on ? 'Jsi na směně' : 'Můžeš být na směně'}</p>
          {on
            ? <p className="text-sm text-[#5B7A08] tabular-nums">{timer}</p>
            : <p className="text-sm text-black/45">Odpíchni si příchod, když jdeš pracovat.</p>}
        </div>
      </div>
      <button onClick={punch} disabled={busy}
        className={`rounded-full font-semibold px-5 py-2.5 text-sm transition whitespace-nowrap shrink-0 disabled:opacity-50 ${
          on ? 'bg-red-500 text-white hover:brightness-110' : 'bg-[#16181A] text-white hover:bg-black'
        }`}>
        {busy ? '…' : on ? 'Odpíchnout odchod' : 'Odpíchnout příchod'}
      </button>
    </div>
  );
}
