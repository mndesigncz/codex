'use client';

// Registrace a přihlášení hosta. Popisek nad polem, chyba pod ním.

import { useState } from 'react';
import { signIn, signOut, getSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '../Icons';
import { mistniCesta } from '@/lib/bezpecnaUrl';
import { useObal } from '../ObalProvider';
import { HLASKA_ROLE_V_CLIENTU } from '@/lib/obal';
import PravniOdkazy from '../pravni/PravniOdkazy';
import SouhlasPodminek from '../pravni/SouhlasPodminek';
import { useT, useJazyk } from '@/lib/i18n/client';

const input = 'field text-sm';
const label = 'field-label';

function Field({ id, label: l, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className={label}>{l}</label>
      {children}
      {error ? <p className="text-xs text-bad-ink">{error}</p> : hint ? <p className="t-meta text-pretty">{hint}</p> : null}
    </div>
  );
}

export function RegisterForm() {
  const t = useT('klient-host');
  const router = useRouter();
  const params = useSearchParams();
  const next = mistniCesta(params.get('next'), '/client/me');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  // Kód z pozvánky (?ref=…) se předvyplní; jde přepsat i vyplnit ručně.
  const [ref, setRef] = useState(() => (params.get('ref') ?? '').toUpperCase());
  // Souhlas s rozesíláním podniků je dobrovolný a výchozí je NE (Apple 4.5.4, zákon 480/2004).
  const [novinky, setNovinky] = useState(false);
  // Click-wrap (spuštění, balík P): souhlas s podmínkami a věk aspoň 15 let výslovně. Dřív se posílalo
  // `terms: true` natvrdo a server ho ignoroval.
  const [souhlas, setSouhlas] = useState(false);
  const [vek, setVek] = useState(false);
  const [chybaSouhlasu, setChybaSouhlasu] = useState<string | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (pw.length < 8) { setErr(t('Heslo musí mít alespoň 8 znaků.')); return; }
    if (!souhlas) { setChybaSouhlasu(t('Bez souhlasu s podmínkami účet založit nejde.')); return; }
    if (!vek) { setChybaSouhlasu(t('Účet hosta si můžeš založit od 15 let.')); return; }
    setChybaSouhlasu(null);
    setBusy(true);
    const r = await fetch('/api/client/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password: pw, ref: ref.trim() || undefined, novinky, terms: souhlas, vek15: vek }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error ? t(d.error) : t('Registrace se nepovedla.')); setBusy(false); return; }
    const s = await signIn('credentials', { email, password: pw, redirect: false });
    if (s?.error) { setErr(t('Účet vznikl, ale přihlášení selhalo. Zkus se přihlásit.')); setBusy(false); return; }
    router.push(next); router.refresh();
  };
  return (
    <AuthCard title={t('Založit účet hosta')} lead={t('Jeden účet pro všechny podniky, kam chodíš.')}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field id="r-name" label={t('Jméno')}><input id="r-name" className={input} value={name} onChange={e => setName(e.target.value)} autoComplete="name" required /></Field>
        <Field id="r-email" label={t('E-mail')}><input id="r-email" type="email" className={input} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field id="r-pw" label={t('Heslo')} hint={t('Aspoň 8 znaků.')}><input id="r-pw" type="password" className={input} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" required /></Field>
        <Field id="r-ref" label={t('Kód od kamaráda')} hint={t('Nepovinné. Až se přidáš do podniku, kde je členem, dostanete oba body.')}><input id="r-ref" className={`${input} font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal`} value={ref} onChange={e => setRef(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoComplete="off" /></Field>
        <label className="flex items-start gap-3 text-sm text-black/70 cursor-pointer">
          <input type="checkbox" checked={novinky} onChange={e => setNovinky(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#16181A]" />
          <span>{t('Chci dostávat novinky a akce od podniků, kde jsem členem. Nepovinné, půjde to kdykoli vypnout v profilu.')}</span>
        </label>
        <SouhlasPodminek id="r-souhlas" checked={souhlas} chyba={chybaSouhlasu}
          onChange={v => { setSouhlas(v); if (v && vek) setChybaSouhlasu(null); }}
          vek={{ checked: vek, onChange: v => { setVek(v); if (v && souhlas) setChybaSouhlasu(null); } }} />
        {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
        <button type="submit" disabled={busy} className="tap-target btn btn-accent btn-lg w-full mt-1 disabled:opacity-50">
          {busy ? t('Zakládám…') : <><Icon name="plus" size={16} /> {t('Založit účet')}</>}
        </button>
        <p className="text-sm text-black/55 text-center">{t('Už účet máš?')} <Link href={`/client/login?next=${encodeURIComponent(next)}`} className="tap-target-sm inline-flex items-center font-semibold text-[#16181A] underline-offset-2 hover:underline">{t('Přihlas se')}</Link></p>
      </form>
    </AuthCard>
  );
}

export function LoginForm() {
  const t = useT('klient-host');
  // Právní stránky existují česky a anglicky; ostatní jazyky dostanou anglické.
  const jazykPravni = useJazyk().jazyk === 'cs' ? 'cs' : 'en';
  const router = useRouter();
  const { jeObal } = useObal();
  const params = useSearchParams();
  const next = mistniCesta(params.get('next'), '/client/me');
  // Výchozí je kód e-mailem (u kasy nikdo heslo nepamatuje); heslo zůstává jako druhá cesta.
  const [zpusob, setZpusob] = useState<'kod' | 'heslo'>('kod');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [kod, setKod] = useState(''); const [poslano, setPoslano] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const poPrihlaseni = async (error: string | null | undefined, zprava: string) => {
    if (error) {
      // Server v obalu vrací OBAL_ROLE jen po správném hesle/kódu: účet podniku v aplikaci pro hosty.
      setErr(error === 'OBAL_ROLE' ? HLASKA_ROLE_V_CLIENTU : zprava);
      setBusy(false); return;
    }
    // Kdo není host (vedení, zaměstnanec), v hostovské části nic nemá: na webu ho pošleme domů
    // do jeho aplikace, v obalu by ho server stejně odmítl (pojistka, kdyby prošel).
    const sess = await getSession();
    const role = (sess?.user as any)?.role;
    if (role && role !== 'customer') {
      if (jeObal) { await signOut({ redirect: false }); setErr(HLASKA_ROLE_V_CLIENTU); setBusy(false); return; }
      router.push('/'); router.refresh(); return;
    }
    router.push(next); router.refresh();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const s = await signIn('credentials', { email, password: pw, redirect: false });
    await poPrihlaseni(s?.error, t('E-mail nebo heslo nesedí.'));
  };
  const poslatKod = async (e?: React.FormEvent) => {
    e?.preventDefault(); setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr(t('Napiš e-mail, se kterým máš účet.')); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/client/login-kod', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(x.error ? t(x.error) : t('Kód se teď nepodařilo poslat. Zkus to za chvíli, nebo se přihlas heslem.')); return; }
      setPoslano(true); setKod('');
    } catch { setErr(t('Kód se teď nepodařilo poslat. Zkus to za chvíli, nebo se přihlas heslem.')); }
    finally { setBusy(false); }
  };
  const overit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!/^\d{6}$/.test(kod)) { setErr(t('Kód má šest číslic.')); return; }
    setBusy(true);
    const s = await signIn('host-kod', { email, kod, redirect: false });
    await poPrihlaseni(s?.error, t('Kód nesedí nebo už neplatí. Pošli si nový.'));
  };
  return (
    <AuthCard title={t('Přihlásit se')} lead={t('Tvoje podniky, rezervace a body na jednom místě.')}>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-black/[0.05] mb-5" role="tablist" aria-label={t('Způsob přihlášení')}>
        {(['kod', 'heslo'] as const).map(z => (
          <button key={z} type="button" role="tab" aria-selected={zpusob === z} onClick={() => { setZpusob(z); setErr(''); }}
            className={`h-9 rounded-full text-sm font-medium transition ${zpusob === z ? 'seg-jezdec seg-vybrano' : 'seg-off'}`}>{z === 'kod' ? t('Kód e-mailem') : t('Heslo')}</button>
        ))}
      </div>
      {zpusob === 'kod' ? (
        poslano ? (
          <form onSubmit={overit} className="grid gap-4" noValidate>
            <p className="text-sm text-black/70 text-pretty">{t('Poslali jsme šestimístný kód na {email}. Platí 10 minut.', { email: email.trim() })}</p>
            <Field id="l-kod" label={t('Kód z e-mailu')}>
              <input id="l-kod" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={`${input} h-kod !text-[22px] !tracking-[0.4em] text-center`} value={kod}
                onChange={e => setKod(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus required />
            </Field>
            {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
            <button type="submit" disabled={busy || kod.length !== 6} className="tap-target btn btn-accent btn-lg w-full mt-1 disabled:opacity-50">{busy ? t('Přihlašuji…') : t('Přihlásit se')}</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setPoslano(false); setErr(''); }} className="btn btn-secondary min-w-0">{t('Jiný e-mail')}</button>
              <button type="button" onClick={() => void poslatKod()} disabled={busy} className="btn btn-secondary min-w-0">{t('Poslat znovu')}</button>
            </div>
            <p className="t-meta text-center text-pretty">{t('Kód nepřišel? Mrkni do spamu, nebo se přihlas heslem.')}</p>
          </form>
        ) : (
          <form onSubmit={poslatKod} className="grid gap-4" noValidate>
            <Field id="l-email" label={t('E-mail')} hint={t('Pošleme ti kód. Heslo si pamatovat nemusíš.')}><input id="l-email" type="email" className={input} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
            {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
            <button type="submit" disabled={busy} className="tap-target btn btn-accent btn-lg w-full mt-1 disabled:opacity-50">{busy ? t('Posílám…') : t('Poslat kód')}</button>
            <PravniOdkazy jazyk={jazykPravni} jen={['soukromi', 'podminky', 'podpora']} className="justify-center text-xs text-black/50" />
            <p className="text-sm text-black/55 text-center">{t('Ještě účet nemáš?')} <Link href={`/client/register?next=${encodeURIComponent(next)}`} className="tap-target-sm inline-flex items-center font-semibold text-[#16181A] underline-offset-2 hover:underline">{t('Založ si ho')}</Link></p>
          </form>
        )
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="l-email" label={t('E-mail')}><input id="l-email" type="email" className={input} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
          <Field id="l-pw" label={t('Heslo')}><input id="l-pw" type="password" className={input} value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" required /></Field>
          <p className="-mt-2 text-sm"><Link href="/client/zapomenute-heslo" className="tap-target-sm inline-flex items-center font-semibold text-[#16181A] underline-offset-2 hover:underline">{t('Zapomenuté heslo')}</Link></p>
          {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
          <button type="submit" disabled={busy} className="tap-target btn btn-accent btn-lg w-full mt-1 disabled:opacity-50">
            {busy ? t('Přihlašuji…') : t('Přihlásit se')}
          </button>
          <PravniOdkazy jazyk={jazykPravni} jen={['soukromi', 'podminky', 'podpora']} className="justify-center text-xs text-black/50" />
          <p className="text-sm text-black/55 text-center">{t('Ještě účet nemáš?')} <Link href={`/client/register?next=${encodeURIComponent(next)}`} className="tap-target-sm inline-flex items-center font-semibold text-[#16181A] underline-offset-2 hover:underline">{t('Založ si ho')}</Link></p>
        </form>
      )}
    </AuthCard>
  );
}

export function AuthCard({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    // v3 (jako přihlášení ve World App / [untitled]): na telefonu formulář leží přímo na plátně —
    // velký nadpis, jedna věta, pole a hlavní tlačítko přes šířku. Karta s linkou až od md, vedle nadpisu.
    <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-7 md:gap-14 items-start">
      <div className="md:pt-8">
        <h1 className="t-page sm:text-[2.5rem] sm:leading-[1.05] text-balance">{title}</h1>
        <p className="mt-2 text-[15px] sm:text-base text-black/60 leading-relaxed max-w-[40ch] text-pretty">{lead}</p>
      </div>
      <div className="w-full max-w-md karta-od-md md:p-8">{children}</div>
    </div>
  );
}
