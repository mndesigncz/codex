'use client';

// Ověření e-mailu vedení (spuštění, balík S): stránka z odkazu, banner
// v aplikaci a řádek v Nastavení. Nic neblokuje — neověřený e-mail je jen
// prosba (lib/overeniEmailu.ts). Bez nastaveného odesílání e-mailů se nic
// z toho neukáže (server vrací stav `nenabizi`).

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogoMark } from '../Icons';
import { Button } from '../ui';
import { useT } from '@/lib/i18n/client';
import { tg } from '@/lib/i18n/stav';
import { okJson } from '@/lib/api';
import type { StavOvereni } from '@/lib/overeniEmailu';

/** Stránka /overit-email?token=… — potvrdí hned po otevření, bez dalšího klepnutí. */
export function OvereniEmailuStranka({ token }: { token: string }) {
  const t = useT('spolecne');
  const [stav, setStav] = useState<'overuji' | 'hotovo' | 'chyba'>('overuji');
  const [chyba, setChyba] = useState('');
  const poslano = useRef(false);
  useEffect(() => {
    // Jednou i ve vývojovém dvojím spuštění efektu: token je jednorázový.
    if (poslano.current) return;
    poslano.current = true;
    fetch('/api/account/overeni-emailu/potvrdit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async r => {
        if (r.ok) { setStav('hotovo'); return; }
        const d = await r.json().catch(() => ({}));
        setChyba(d?.error ? tg(d.error) : t('E-mail se nepodařilo potvrdit.'));
        setStav('chyba');
      })
      .catch(() => { setChyba(t('E-mail se nepodařilo potvrdit. Zkontrolujte připojení.')); setStav('chyba'); });
  }, [token, t]);

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <div className="flex items-center gap-2.5"><LogoMark size={34} /><span className="font-bold tracking-tight">Managero</span></div>
      <div className="card p-6 sm:p-8 max-w-md w-full">
        <h1 className="t-page">{t('Potvrzení e-mailu')}</h1>
        {stav === 'overuji' && <p role="status" className="t-meta mt-4">{t('Potvrzuji…')}</p>}
        {stav === 'hotovo' && <p role="status" className="note note-ok mt-5">{t('Hotovo, e-mail je potvrzený. Díky!')}</p>}
        {stav === 'chyba' && <p role="alert" className="note note-danger mt-5">{chyba}</p>}
        {stav !== 'overuji' && <Link href="/" className="btn btn-accent tap-target mt-5 w-full">{t('Do aplikace')}</Link>}
      </div>
    </main>
  );
}

function useStavOvereni() {
  const [stav, setStav] = useState<StavOvereni | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let zivy = true;
    fetch('/api/account/overeni-emailu')
      .then(okJson)
      .then(d => { if (zivy && d) { setStav(d.stav ?? null); setEmail(d.email ?? null); } })
      .catch(() => { /* bez stavu se nic neukáže */ });
    return () => { zivy = false; };
  }, []);
  return { stav, email };
}

function useZnovu() {
  const t = useT('spolecne');
  const [busy, setBusy] = useState(false);
  const [zprava, setZprava] = useState<{ ok: boolean; text: string } | null>(null);
  const poslat = async () => {
    setBusy(true); setZprava(null);
    try {
      const r = await fetch('/api/account/overeni-emailu', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      setZprava(r.ok ? { ok: true, text: t('Poslali jsme nový odkaz. Platí 48 hodin.') } : { ok: false, text: d?.error ? tg(d.error) : t('Odkaz se nepodařilo poslat.') });
    } catch {
      setZprava({ ok: false, text: t('Odkaz se nepodařilo poslat. Zkontrolujte připojení.') });
    } finally { setBusy(false); }
  };
  return { busy, zprava, poslat };
}

/** Banner nad obsahem aplikace vedení: jen když účet dostal odkaz a ještě ho nepotvrdil. */
export function PotvrditEmailBanner() {
  const t = useT('spolecne');
  const { stav, email } = useStavOvereni();
  const { busy, zprava, poslat } = useZnovu();
  const [skryto, setSkryto] = useState(false);
  if (stav !== 'ceka' || skryto) return null;
  return (
    <div className="mx-4 mt-3 note note-info flex flex-wrap items-center gap-x-3 gap-y-2" role="status">
      <p className="flex-1 min-w-[14rem] text-sm text-pretty">
        <span className="font-semibold">{t('Potvrď e-mail.')}</span>{' '}
        {t('Na {email} jsme poslali odkaz — budou tam chodit faktury, zálohy a obnovení hesla.', { email: email ?? '' })}
        {zprava && <span className={`block mt-1 ${zprava.ok ? '' : 'text-bad-ink'}`}>{zprava.text}</span>}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" loading={busy} onClick={poslat}>{t('Poslat znovu')}</Button>
        <Button size="sm" variant="ghost" onClick={() => setSkryto(true)}>{t('Později')}</Button>
      </div>
    </div>
  );
}

/** Karta v Nastavení → Zabezpečení: stav ověření a odeslání odkazu (i pro účty z doby před ověřováním). */
export function OvereniEmailuNastaveni() {
  const t = useT('spolecne');
  const { stav } = useStavOvereni();
  const { busy, zprava, poslat } = useZnovu();
  if (stav == null || stav === 'nenabizi') return null;
  return (
    <section className="card p-6 mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="t-card">{t('Ověření e-mailu')}</h2>
        <p className="t-meta">{stav === 'overeno' ? t('E-mail je potvrzený.') : t('E-mail zatím není potvrzený.')}</p>
        {zprava && <p role={zprava.ok ? 'status' : 'alert'} className={`text-sm mt-1 ${zprava.ok ? 'text-ok-ink' : 'text-bad-ink'}`}>{zprava.text}</p>}
      </div>
      {stav !== 'overeno' && <Button size="sm" variant="secondary" loading={busy} onClick={poslat}>{stav === 'ceka' ? t('Poslat odkaz znovu') : t('Poslat odkaz')}</Button>}
    </section>
  );
}
