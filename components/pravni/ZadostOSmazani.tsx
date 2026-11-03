'use client';

// Žádost o smazání účtu z webu bez přihlášení. Formulář nic nesmaže: pošle na
// e-mail účtu odkaz, a účet se smaže až po jeho potvrzení. Odpověď je vždy
// stejná (nejde zjistit, kdo je v aplikaci registrovaný). Tatáž adresa může mít
// účet hosta i účet v podniku (lib/dveStrany), proto se volí, který smazat.

import { useState } from 'react';

const TEXTY = {
  cs: { h: 'Požádat o smazání bez přihlášení', label: 'E-mail účtu', btn: 'Poslat odkaz pro potvrzení', busy: 'Posílám…', chyba: 'Žádost se nepodařilo odeslat.', hint: 'Pošleme odkaz pro potvrzení. Dokud ho neotevřete, nic se nesmaže.', ucet: 'Který účet smazat', host: 'Managero client (věrnostní karty a rezervace)', podnik: 'Účet v podniku (správa nebo zaměstnanec)' },
  en: { h: 'Request deletion without signing in', label: 'Account email', btn: 'Send confirmation link', busy: 'Sending…', chyba: 'The request could not be sent.', hint: 'We send a confirmation link. Nothing is deleted until you open it.', ucet: 'Which account to delete', host: 'Managero client (loyalty cards and bookings)', podnik: 'Business account (management or staff)' },
} as const;

export default function ZadostOSmazani({ jazyk }: { jazyk: 'cs' | 'en' }) {
  const t = TEXTY[jazyk];
  const [email, setEmail] = useState('');
  const [strana, setStrana] = useState<'host' | 'podnik'>('host');
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const [hotovo, setHotovo] = useState('');

  const odeslat = async (e: React.FormEvent) => {
    e.preventDefault();
    setChyba(''); setBusy(true);
    try {
      const r = await fetch('/api/account/delete-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, strana }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setChyba(d.error || t.chyba);
      else setHotovo(d.message || '');
    } catch {
      setChyba(t.chyba);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="h-zadost" className="card p-5 sm:p-6">
      <h2 id="h-zadost" className="t-section">{t.h}</h2>
      {hotovo ? (
        <p role="status" className="note note-ok mt-4">{hotovo}</p>
      ) : (
        <form onSubmit={odeslat} className="mt-4 grid gap-3" noValidate>
          <div>
            <label htmlFor="zs-email" className="field-label">{t.label}</label>
            <input id="zs-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={e => setEmail(e.target.value)} className="field" />
            <p className="mt-1.5 t-meta">{t.hint}</p>
          </div>
          <fieldset className="grid gap-2">
            <legend className="field-label">{t.ucet}</legend>
            {(['host', 'podnik'] as const).map(v => (
              <label key={v} className="flex items-center gap-3 min-h-[44px] rounded-xl border border-black/[0.1] px-3.5 cursor-pointer has-[:checked]:border-black/40 has-[:checked]:bg-black/[0.03]">
                <input type="radio" name="zs-strana" value={v} checked={strana === v} onChange={() => setStrana(v)} className="size-4 accent-[#16181A]" />
                <span className="text-sm">{t[v]}</span>
              </label>
            ))}
          </fieldset>
          {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
          <button type="submit" disabled={busy || !email.trim()} className="btn btn-primary tap-target disabled:opacity-50">{busy ? t.busy : t.btn}</button>
        </form>
      )}
    </section>
  );
}
