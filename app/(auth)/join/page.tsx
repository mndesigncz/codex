'use client';

import { Suspense, useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogoMark } from '@/components/Icons';
import { okJson } from '@/lib/api';
import JazykMenu from '@/components/ui/JazykMenu';
import { useT } from '@/lib/i18n/client';

const inputClass =
  'w-full field border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm';

// Připojení k týmu: vykání jako v originálu (německy „Sie“), veřejný vstup jako přihlášení.
function JoinForm() {
  const t = useT('auth');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Prefill from invitation token
  useEffect(() => {
    if (!token) return;
    fetch(`/api/invitations/accept?token=${token}`)
      .then(okJson)
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setEmail(data.email);
        setTeamName(data.teamName);
      })
      .catch(() => setError(t('Nepodařilo se načíst pozvánku.')));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError(t('Heslo musí mít alespoň 8 znaků.')); return; }
    setIsLoading(true);

    try {
      let res;
      if (token) {
        res = await fetch('/api/invitations/accept', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, name, password }),
        });
      } else {
        res = await fetch('/api/teams/join', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, joinCode }),
        });
      }
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('Chyba při připojení.')); setIsLoading(false); return; }
      await signIn('credentials', { email, password, redirect: false });
      router.push('/'); router.refresh();
    } catch {
      setError(t('Chyba serveru.')); setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center p-4">
      {/* Přepínač jazyka: malá pilulka v rohu stránky. */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6"><JazykMenu /></div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5"><LogoMark size={64} animace /></div>
          <h1 className="text-3xl font-bold tracking-tight text-[#16181A] mb-2">
            {token ? t('Přijmout pozvánku') : t('Připojit se k týmu')}
          </h1>
          <p className="text-black/45 text-sm">
            {token && teamName ? t('Byli jste pozváni do týmu {tym}.', { tym: teamName }) : t('Zadejte kód týmu od svého zaměstnavatele.')}
          </p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!token && (
              <div>
                <label htmlFor="join-kod" className="block text-xs uppercase tracking-wider text-black/45 mb-2">{t('Kód týmu')}</label>
                <input id="join-kod" autoComplete="one-time-code" type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder={t('Např. K7QP2M')} required
                  className={`${inputClass} tracking-[0.25em] font-semibold text-center uppercase`} maxLength={6} />
              </div>
            )}
            <div>
              <label htmlFor="join-jmeno" className="block text-xs uppercase tracking-wider text-black/45 mb-2">{t('Vaše jméno')}</label>
              <input id="join-jmeno" autoComplete="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('Jana Nováková')} required className={inputClass} />
            </div>
            <div>
              <label htmlFor="join-email" className="block text-xs uppercase tracking-wider text-black/45 mb-2">{t('Email')}</label>
              <input id="join-email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('vas@email.cz')} required disabled={!!token}
                className={`${inputClass} ${token ? 'opacity-60' : ''}`} />
            </div>
            <div>
              <label htmlFor="join-heslo" className="block text-xs uppercase tracking-wider text-black/45 mb-2">{t('Heslo')}</label>
              <input id="join-heslo" autoComplete="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('Minimálně 8 znaků')} required className={inputClass} />
            </div>

            {error && <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">{error}</div>}

            <button type="submit" disabled={isLoading} className="w-full py-3 rounded-full bg-[#C8F542] hover:brightness-110 disabled:opacity-50 text-black font-semibold transition text-sm active:scale-[0.98]">
              {isLoading ? t('Připojování…') : t('Připojit se')}
            </button>
          </form>

          <p className="mt-5 text-xs text-black/45 text-center text-pretty">Vytvořením účtu souhlasíte s <Link href="/podminky" className="underline underline-offset-2">Podmínkami užívání</Link> a berete na vědomí <Link href="/soukromi" className="underline underline-offset-2">Zásady ochrany osobních údajů</Link>.</p>{/* i18n-ok: právní věta zůstává česky */}
          <p className="text-center text-black/45 text-sm mt-6">
            {t('Už máte účet?')} <Link href="/login" className="tap-target-sm inline-flex items-center text-[#5B7A08] hover:underline font-medium">{t('Přihlásit se')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function NacitaniPripojeni() {
  const t = useT('auth');
  return <div className="min-h-[100dvh] flex items-center justify-center text-black/45 text-sm">{t('Načítání…')}</div>;
}

export default function JoinPage() {
  return (
    <Suspense fallback={<NacitaniPripojeni />}>
      <JoinForm />
    </Suspense>
  );
}
