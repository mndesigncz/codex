'use client';

// Odeslání poukazu e-mailem obdarovanému (v detailu poukazu): adresa, volitelný vzkaz, tlačítko.
// E-mail nese kód, hodnotu, platnost a odkaz na stránku podniku. Adresa se uloží k poukazu, takže obdarovaný dostane
// i připomenutí, než poukaz propadne. Odeslat jde jen platný poukaz (to hlídá server). Texty česky natvrdo (správa).

import { useState } from 'react';
import { Button, Field, Input, Textarea } from '../../ui';
import { apiMessage } from '@/lib/api';
import { emailObdarovaneho, vzkazDarce, MAX_VZKAZ } from '@/lib/poukazyEmail';
import { dbTimeDayHM } from '@/lib/pragueTime';

export default function PoukazyOdeslani({ poukazId, ulozenyEmail, odeslano, toast, onHotovo }: {
  poukazId: number; ulozenyEmail: string | null; odeslano: string | null; toast: (m: string) => void; onHotovo: () => void;
}) {
  const [email, setEmail] = useState(ulozenyEmail ?? '');
  const [vzkaz, setVzkaz] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const posli = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailObdarovaneho(email)) { setErr('Zadej platný e-mail obdarovaného.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/client/admin/vouchers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: poukazId, action: 'send', email, message: vzkazDarce(vzkaz) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'E-mail se nepodařilo odeslat.');
      toast('Poukaz je odeslaný.');
      setVzkaz('');
      onHotovo();
    } catch (e2) { setErr(apiMessage(e2, 'E-mail se nepodařilo odeslat.')); }
    setBusy(false);
  };

  return (
    <form onSubmit={posli} className="space-y-3 border-t border-[var(--surface-line)] pt-4" aria-labelledby="pk-posli">
      <div>
        <h3 id="pk-posli" className="t-label">Poslat e-mailem</h3>
        <p className="t-meta mt-0.5">
          Obdarovaný dostane kód a platnost. {ulozenyEmail ? 'Adresa je uložená, před koncem platnosti mu přijde připomenutí.' : 'Uložíme adresu, ať mu můžeme před koncem platnosti poslat připomenutí.'}
          {odeslano ? ` Naposledy odesláno ${dbTimeDayHM(odeslano)}.` : ''}
        </p>
      </div>
      <Field id="pk-email" label="E-mail obdarovaného">
        <Input id="pk-email" type="email" inputMode="email" autoComplete="off" maxLength={120} value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} placeholder="jana@example.cz" />
      </Field>
      <Field id="pk-vzkaz" label="Vzkaz (nepovinný)" hint={`Nejvýš ${MAX_VZKAZ} znaků`}>
        <Textarea id="pk-vzkaz" rows={2} maxLength={MAX_VZKAZ} value={vzkaz} onChange={e => setVzkaz(e.target.value)} placeholder="Všechno nejlepší k narozeninám!" />
      </Field>
      {err && <p role="alert" className="note note-danger">{err}</p>}
      <Button type="submit" size="sm" variant="secondary" icon="send" loading={busy} disabled={!email.trim()}>{odeslano ? 'Poslat znovu' : 'Poslat poukaz'}</Button>
    </form>
  );
}
