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
import { useT } from '@/lib/i18n/client';

const input = 'field text-sm';
const label = 'field-label';

function Field({ id, label: l, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className={label}>{l}</label>
      {children}
      {error ? <p className="text-xs text-bad-ink">{error}</p> : hint ? <p className="text-xs text-black/45">{hint}</p> : null}
    </div>
  );
}

export function RegisterForm() {
  const t = useT('klient-host');
  const router = useRouter();
  const params = useSearchParams();
  const next = mistniCesta(params.get('next'), '/client');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  // Kód z pozvánky (?ref=…) se předvyplní; jde přepsat i vyplnit ručně.
  const [ref, setRef] = useState(() => (params.get('ref') ?? '').toUpperCase());
  // Souhlas s rozesíláním podniků je dobrovolný a výchozí je NE (Apple 4.5.4, zákon 480/2004).
  const [novinky, setNovinky] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (pw.length < 8) { setErr(t('Heslo musí mít alespoň 8 znaků.')); return; }
    setBusy(true);
    const r = await fetch('/api/client/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password: pw, ref: ref.trim() || undefined, novinky, terms: true }) });
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
        <Field id="r-ref" label={t('Kód od kamaráda')} hint={t('Nepovinné. Až se přidáš do podniku, kde je členem, dostanete oba body.')}><input id="r-ref" className={`${input} font-mono tracking-widest`} value={ref} onChange={e => setRef(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoComplete="off" /></Field>
        <label className="flex items-start gap-3 text-sm text-black/70 cursor-pointer">
          <input type="checkbox" checked={novinky} onChange={e => setNovinky(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#16181A]" />
          <span>{t('Chci dostávat novinky a akce od podniků, kde jsem členem. Nepovinné, půjde to kdykoli vypnout v profilu.')}</span>
        </label>
        {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
        <button type="submit" disabled={busy} className="tap-target btn btn-accent hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition inline-flex items-center justify-center gap-2">
          {busy ? t('Zakládám…') : <><Icon name="plus" size={16} /> {t('Založit účet')}</>}
        </button>
        <p className="text-xs text-black/50 text-center text-pretty">Založením účtu souhlasíš s <Link href="/podminky" className="underline underline-offset-2">Podmínkami užívání</Link> a bereš na vědomí <Link href="/soukromi" className="underline underline-offset-2">Zásady ochrany osobních údajů</Link>.</p>{/* i18n-ok: právní věta zůstává česky */}
        <p className="text-sm text-black/55 text-center">{t('Už účet máš?')} <Link href={`/client/login?next=${encodeURIComponent(next)}`} className="tap-target-sm inline-flex items-center font-semibold text-[#16181A] underline-offset-2 hover:underline">{t('Přihlas se')}</Link></p>
      </form>
    </AuthCard>
  );
}

export function LoginForm() {
  const t = useT('klient-host');
  const router = useRouter();
  const { jeObal } = useObal();
  const params = useSearchParams();
  const next = mistniCesta(params.get('next'), '/client');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const s = await signIn('credentials', { email, password: pw, redirect: false });
    if (s?.error) {
      // Server v obalu vrací OBAL_ROLE jen po správném hesle: účet podniku v aplikaci pro hosty.
      setErr(s.error === 'OBAL_ROLE' ? HLASKA_ROLE_V_CLIENTU : t('E-mail nebo heslo nesedí.'));
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
  return (
    <AuthCard title={t('Přihlásit se')} lead={t('Tvoje podniky, rezervace a body na jednom místě.')}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field id="l-email" label={t('E-mail')}><input id="l-email" type="email" className={input} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field id="l-pw" label={t('Heslo')}><input id="l-pw" type="password" className={input} value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" required /></Field>
        <p className="-mt-2 text-sm"><Link href="/client/zapomenute-heslo" className="tap-target-sm inline-flex items-center font-semibold text-[#16181A] underline-offset-2 hover:underline">{t('Zapomenuté heslo')}</Link></p>
        {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
        <button type="submit" disabled={busy} className="tap-target btn btn-accent hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition">
          {busy ? t('Přihlašuji…') : t('Přihlásit se')}
        </button>
        <PravniOdkazy jen={['soukromi', 'podminky', 'podpora']} className="justify-center text-xs text-black/50" />
        <p className="text-sm text-black/55 text-center">{t('Ještě účet nemáš?')} <Link href={`/client/register?next=${encodeURIComponent(next)}`} className="tap-target-sm inline-flex items-center font-semibold text-[#16181A] underline-offset-2 hover:underline">{t('Založ si ho')}</Link></p>
      </form>
    </AuthCard>
  );
}

export function AuthCard({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-8 md:gap-14 items-start">
      <div className="md:pt-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter leading-[1.05] text-balance">{title}</h1>
        <p className="mt-3 text-black/60 leading-relaxed max-w-[40ch] text-pretty">{lead}</p>
      </div>
      <div className="glass-card p-6 sm:p-8 max-w-md w-full">{children}</div>
    </div>
  );
}
