'use client';

// Registrace a přihlášení hosta. Popisek nad polem, chyba pod ním.

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '../Icons';

const input = 'w-full rounded-2xl bg-white/70 border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/60 focus:ring-2 focus:ring-[#C8F542]/25 focus:outline-none transition text-sm';
const label = 'block text-xs font-semibold text-black/55 mb-1.5';

function Field({ id, label: l, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className={label}>{l}</label>
      {children}
      {error ? <p className="text-xs text-red-700">{error}</p> : hint ? <p className="text-xs text-black/45">{hint}</p> : null}
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/client';
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (pw.length < 8) { setErr('Heslo musí mít alespoň 8 znaků.'); return; }
    setBusy(true);
    const r = await fetch('/api/client/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password: pw }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || 'Registrace se nepovedla.'); setBusy(false); return; }
    const s = await signIn('credentials', { email, password: pw, redirect: false });
    if (s?.error) { setErr('Účet vznikl, ale přihlášení selhalo. Zkus se přihlásit.'); setBusy(false); return; }
    router.push(next); router.refresh();
  };
  return (
    <AuthCard title="Založit účet hosta" lead="Jeden účet pro všechny podniky, kam chodíš.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field id="r-name" label="Jméno"><input id="r-name" className={input} value={name} onChange={e => setName(e.target.value)} autoComplete="name" required /></Field>
        <Field id="r-email" label="E-mail"><input id="r-email" type="email" className={input} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field id="r-pw" label="Heslo" hint="Aspoň 8 znaků."><input id="r-pw" type="password" className={input} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" required /></Field>
        {err && <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm px-3 py-2">{err}</p>}
        <button type="submit" disabled={busy} className="tap-target rounded-full bg-[#C8F542] text-[#16181A] px-5 py-3 text-sm font-semibold hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition inline-flex items-center justify-center gap-2">
          {busy ? 'Zakládám…' : <><Icon name="plus" size={16} /> Založit účet</>}
        </button>
        <p className="text-sm text-black/55 text-center">Už účet máš? <Link href={`/client/login?next=${encodeURIComponent(next)}`} className="font-semibold text-[#16181A] underline-offset-2 hover:underline">Přihlas se</Link></p>
      </form>
    </AuthCard>
  );
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/client';
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const s = await signIn('credentials', { email, password: pw, redirect: false });
    if (s?.error) { setErr('E-mail nebo heslo nesedí.'); setBusy(false); return; }
    router.push(next); router.refresh();
  };
  return (
    <AuthCard title="Přihlásit se" lead="Tvoje podniky, rezervace a body na jednom místě.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field id="l-email" label="E-mail"><input id="l-email" type="email" className={input} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field id="l-pw" label="Heslo"><input id="l-pw" type="password" className={input} value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" required /></Field>
        {err && <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm px-3 py-2">{err}</p>}
        <button type="submit" disabled={busy} className="tap-target rounded-full bg-[#C8F542] text-[#16181A] px-5 py-3 text-sm font-semibold hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition">
          {busy ? 'Přihlašuji…' : 'Přihlásit se'}
        </button>
        <p className="text-sm text-black/55 text-center">Ještě účet nemáš? <Link href={`/client/register?next=${encodeURIComponent(next)}`} className="font-semibold text-[#16181A] underline-offset-2 hover:underline">Založ si ho</Link></p>
      </form>
    </AuthCard>
  );
}

function AuthCard({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
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
