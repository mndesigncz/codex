'use client';

// Zapomenuté heslo: žádost o odkaz a nastavení nového hesla. Stejné formuláře
// pro hosty (/client/…) i provoz (/…); liší se jen obal a kam se vrátit po
// dokončení. Odpověď na žádost je vždy stejná, ať e-mail existuje, nebo ne.

import { useState } from 'react';
import Link from 'next/link';
import { LogoMark } from '../Icons';
import { useT } from '@/lib/i18n/client';
import { tg } from '@/lib/i18n/stav';
import Pole from '../client/host/ucet/Pole';

// v3: „Přihlásit" v hlavičce hosta (ClientShell) je inkoustová pilulka, limetka patří hlavní
// akci obrazovky — tady tlačítku formuláře, vysokému a přes šířku (jako v inspiracích).
// Host (směr A „Peněženka“): limetková pilulka .hp-btn-limetka přes šířku.
const hlavniTlacitko = (klient: boolean) => klient ? 'hp-btn hp-btn-limetka hp-btn-blok' : 'btn btn-accent btn-lg w-full';

// Host: titulek .hp-titulek 32, věta .hp-text tlumeně; provoz beze změny.
const nadpis = (klient: boolean) => klient ? 'hp-titulek' : 't-page';
const veta = (klient: boolean) => klient ? 'hp-text mt-2.5 text-[color:var(--hp-muted)] text-pretty' : 't-meta mt-2 text-pretty';
const odkazZpet = (klient: boolean) => klient
  ? 'tap-target-sm inline-flex items-center min-h-[44px] font-semibold text-[color:var(--hp-fg)] underline-offset-2 hover:underline'
  : 'tap-target-sm inline-flex items-center font-semibold underline-offset-2 hover:underline';

function Obal({ klient, children }: { klient: boolean; children: React.ReactNode }) {
  const karta = <div className="card p-6 sm:p-8 max-w-md w-full">{children}</div>;
  // Host (směr A): formulář leží na plátně (titulek, věta, pole, tlačítko) i na počítači, úzký sloupec uprostřed.
  if (klient) return (
    <div className="mx-auto w-full max-w-[420px] pt-2 md:pt-12">{children}</div>
  );
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <div className="flex items-center gap-2.5"><LogoMark size={34} /><span className="font-bold tracking-tight">Managero</span></div>
      {karta}
    </main>
  );
}

export function ZapomenuteHesloForm({ klient }: { klient: boolean }) {
  const t = useT('spolecne');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const [hotovo, setHotovo] = useState('');
  const login = klient ? '/client/login' : '/login';

  const odeslat = async (e: React.FormEvent) => {
    e.preventDefault();
    setChyba(''); setBusy(true);
    try {
      const r = await fetch('/api/account/heslo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, strana: klient ? 'host' : 'podnik' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setChyba(d.error ? tg(d.error) : t('Žádost se nepodařilo odeslat.'));
      else setHotovo(t('Pokud je e-mail v aplikaci, poslali jsme na něj odkaz pro nové heslo.'));
    } catch {
      setChyba(t('Žádost se nepodařilo odeslat. Zkontroluj připojení.'));
    } finally { setBusy(false); }
  };

  return (
    <Obal klient={klient}>
      <h1 className={nadpis(klient)}>{t('Zapomenuté heslo')}</h1>
      <p className={veta(klient)}>{t('Napiš e-mail účtu. Pošleme odkaz, kterým si nastavíš nové heslo.')}</p>
      {hotovo ? (
        <p role="status" className="note note-ok mt-5">{hotovo}</p>
      ) : (
        <form onSubmit={odeslat} className={`grid gap-4 ${klient ? 'mt-6' : 'mt-5'}`} noValidate>
          {klient ? (
            <Pole id="zh-email" popis={t('E-mail')} ikona="mail">
              <input id="zh-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </Pole>
          ) : (
            <div>
              <label htmlFor="zh-email" className="field-label">{t('E-mail')}</label>
              <input id="zh-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={e => setEmail(e.target.value)} className="field" />
            </div>
          )}
          {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
          <button type="submit" disabled={busy || !email.trim()} className={`${hlavniTlacitko(klient)} tap-target disabled:opacity-50`}>{busy ? t('Posílám…') : t('Poslat odkaz')}</button>
        </form>
      )}
      <p className={`text-center ${klient ? 'mt-4 hp-text' : 'mt-5 text-sm'}`}><Link href={login} className={odkazZpet(klient)}>{t('Zpět na přihlášení')}</Link></p>
    </Obal>
  );
}

export function NoveHesloForm({ klient, token }: { klient: boolean; token: string }) {
  const t = useT('spolecne');
  const [heslo, setHeslo] = useState('');
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const [hotovo, setHotovo] = useState(false);
  const login = klient ? '/client/login' : '/login';

  const odeslat = async (e: React.FormEvent) => {
    e.preventDefault();
    setChyba('');
    if (heslo.length < 8) { setChyba(t('Heslo musí mít alespoň 8 znaků.')); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/account/heslo/obnovit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: heslo }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setChyba(d.error ? tg(d.error) : t('Heslo se nepodařilo změnit.'));
      else setHotovo(true);
    } catch {
      setChyba(t('Heslo se nepodařilo změnit. Zkontroluj připojení.'));
    } finally { setBusy(false); }
  };

  return (
    <Obal klient={klient}>
      <h1 className={nadpis(klient)}>{t('Nové heslo')}</h1>
      {hotovo ? (
        <>
          <p role="status" className="note note-ok mt-5">{t('Heslo je změněné. Můžeš se přihlásit.')}</p>
          <Link href={login} className={`${hlavniTlacitko(klient)} tap-target mt-5 w-full`}>{t('Přihlásit se')}</Link>
        </>
      ) : (
        <form onSubmit={odeslat} className={`grid gap-4 ${klient ? 'mt-6' : 'mt-5'}`} noValidate>
          {klient ? (
            <Pole id="nh-heslo" popis={t('Nové heslo')} ikona="lock" napoveda={t('Aspoň 8 znaků.')}>
              <input id="nh-heslo" type="password" autoComplete="new-password" required value={heslo} onChange={e => setHeslo(e.target.value)} aria-describedby="nh-heslo-napoveda" />
            </Pole>
          ) : (
            <div>
              <label htmlFor="nh-heslo" className="field-label">{t('Nové heslo')}</label>
              <input id="nh-heslo" type="password" autoComplete="new-password" required value={heslo} onChange={e => setHeslo(e.target.value)} className="field" />
              <p className="mt-1.5 t-meta">{t('Aspoň 8 znaků.')}</p>
            </div>
          )}
          {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
          <button type="submit" disabled={busy || !heslo} className={`${hlavniTlacitko(klient)} tap-target disabled:opacity-50`}>{busy ? t('Ukládám…') : t('Nastavit heslo')}</button>
        </form>
      )}
    </Obal>
  );
}
