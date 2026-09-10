'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../Icons';
import { Button } from '../ui';
import { parseDbTime, dbTimeDayHM } from '@/lib/pragueTime';

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
  // Čas z databáze nemá značku zóny; `new Date()` by ho vzal jako místní a
  // časovač by o posun (v létě dvě hodiny) přestřelil.
  const zacatekMs = on ? (parseDbTime(openSince)?.getTime() ?? now) : now;
  const secs = on ? Math.max(0, Math.round((now - zacatekMs) / 1000)) : 0;
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const timer = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  // Nikdo nedělá šestnáct hodin v kuse. Když časovač přeteče, není to běžící
  // směna, ale zapomenutý odchod — a widget to má říct, ne odpočítávat dál
  // „304:15:12", jako by se nic nedělo.
  const zapomenuty = on && secs > 16 * 3600;
  const dnu = Math.floor(secs / 86400);
  const dlouho = dnu >= 1
    ? `${dnu} ${dnu === 1 ? 'den' : dnu < 5 ? 'dny' : 'dnů'} a ${h - dnu * 24} h`
    : `${h} h ${String(m).padStart(2, '0')} min`;
  const zacatek = on ? dbTimeDayHM(openSince) : '';

  return (
    <div className={`rounded-3xl p-5 flex items-center justify-between gap-3 flex-wrap border ${
      zapomenuty ? 'bg-orange-500/[0.10] border-orange-500/40' : on ? 'bg-[#C8F542]/[0.12] border-[#C8F542]/40' : 'glass-card'
    }`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full shrink-0 ${
          zapomenuty ? 'bg-orange-500/15 text-orange-700' : on ? 'bg-[#16181A] text-[#C8F542]' : 'bg-[#C8F542]/15 text-[#5B7A08]'
        }`}>
          <Icon name={zapomenuty ? 'warning' : 'clock'} size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-[#16181A] truncate">
            {zapomenuty ? 'Zapomenutý odchod' : on ? 'Jsi na směně' : 'Můžeš být na směně'}
          </p>
          {zapomenuty
            ? <p className="text-sm text-orange-700">Běží od {zacatek} — to je {dlouho}. Odpíchni odchod, ať docházka sedí.</p>
            : on
              ? <p className="text-sm text-[#5B7A08] tabular-nums">{timer}</p>
              : <p className="text-sm text-black/45">Odpíchni si příchod, když jdeš pracovat.</p>}
        </div>
      </div>
      <Button onClick={punch} loading={busy} variant={on ? 'danger-solid' : 'accent'} icon={on ? 'logout' : 'clock'} className="shrink-0">
        {on ? 'Odpíchnout odchod' : 'Odpíchnout příchod'}
      </Button>
    </div>
  );
}
