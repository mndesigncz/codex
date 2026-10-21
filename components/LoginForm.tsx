'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogoMark } from './Icons';
import PravniOdkazy from './pravni/PravniOdkazy';
import { HLASKA_ROLE_V_PROVOZU } from '@/lib/obal';
import { navratPoPrihlaseni } from '@/lib/navratPoPrihlaseni';

import { Button } from './ui';
import JazykMenu from './ui/JazykMenu';
import { useT, useJazyk } from '@/lib/i18n/client';
export default function LoginForm() {
  // Texty přihlášení: vykání jako v českém originálu (německy „Sie“), protože jde
  // o veřejný vstup do aplikace, stejně jako registrace.
  const t = useT('auth');
  // Právní stránky existují česky a anglicky; ostatní jazyky dostanou anglické.
  const jazykPravni = useJazyk().jazyk === 'cs' ? 'cs' : 'en';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get('registered') === '1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      // OBAL_ROLE vrací server jen po správném hesle: účet hosta v aplikaci pro podniky.
      if (result?.error) setError(result.error === 'OBAL_ROLE' ? HLASKA_ROLE_V_PROVOZU : t('Nesprávný email nebo heslo.'));
      else {
        // Návrat tam, odkud přihlášení přišlo (odkaz na zálohu, pozvánka, e-mail):
        // jen místní cesta, cizí adresa skončí na úvodu (lib/navratPoPrihlaseni).
        const kam = navratPoPrihlaseni(searchParams.get('callbackUrl') ?? searchParams.get('next'), window.location.origin);
        // Odkaz na zálohu je stránka z API (HTML ze serveru), ne stránka aplikace: plné načtení.
        if (kam.startsWith('/api/')) window.location.assign(kam);
        else { router.push(kam); router.refresh(); }
      }
    } catch {
      setError(t('Chyba při přihlášení.'));
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = 'field';

  return (
    // v3: na telefonu leží přihlášení přímo na plátně (žádná karta ani sklo — blur patří jen plovoucímu
    // chromu); od md karta s linkou: vlevo fotka baru, vpravo formulář.
    <div className="min-h-[100dvh] w-full flex items-center justify-center sm:p-6">
      <div className="w-full max-w-5xl grid md:grid-cols-2 karta-od-md md:overflow-hidden md:shadow-[shadow:var(--shadow-float)]">
        {/* Left — brand panel */}
        <div className="relative hidden md:flex flex-col justify-between p-10 min-h-[560px] overflow-hidden">
          {/* Místo přechodu limetka→tyrkys (nejčastější otisk generovaného
              designu) fotka baru, kde se aplikace opravdu používá. Limetkový
              závoj drží značku, tmavý spodek nese text. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/hero-counter.webp" alt="" aria-hidden
            className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(200,245,66,0.22)_0%,rgba(200,245,66,0.06)_40%,rgba(22,24,26,0.72)_100%)]" />
          <div className="relative flex items-center gap-2.5">
            <LogoMark size={38} />
            <span className="font-bold text-white tracking-tight drop-shadow">Managero</span>
          </div>
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight text-white leading-snug text-balance">
              {t('Směny, kasa a sklad na jednom místě.')}
            </h2>
            <p className="text-white/70 text-sm mt-2">{t('Pro kavárny, restaurace a malé podniky.')}</p>
          </div>
        </div>

        {/* Right — form */}
        <div className="relative px-5 pt-5 pb-10 min-[360px]:px-6 sm:p-12 flex flex-col justify-center">
          {/* Přepínač jazyka: na monitoru malá pilulka v rohu formuláře, na telefonu v řádku s logem
              (absolutně v rohu na telefonu vyčuhoval přes okraj karty). */}
          <div className="hidden md:block absolute top-6 right-6"><JazykMenu /></div>
          <div className="md:hidden flex items-center justify-between gap-3 mb-10">
            <span className="flex items-center gap-2.5">
              <LogoMark size={36} />
              <span className="font-bold text-[#16181A] tracking-tight">Managero</span>
            </span>
            <JazykMenu />
          </div>

          <h1 className="t-page">{t('Přihlásit se')}</h1>
          <p className="text-[15px] text-black/60 mt-2 mb-8">{t('Přihlas se e-mailem a heslem.')}</p>

          {justRegistered && (
            <p role="status" className="note note-ok mb-6">
              {t('Účet je založený. Teď se můžeš přihlásit.')}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="field-label">{t('Email')}</label>
              <input id="login-email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('vas@email.cz')} required className={inputClass} />
            </div>
            <div>
              <label htmlFor="login-heslo" className="field-label">{t('Heslo')}</label>
              <div className="relative">
                <input id="login-heslo" autoComplete="current-password" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('Zadej heslo')} required className={`${inputClass} pr-12`} />
                <button type="button" onClick={() => setShowPwd(v => !v)} aria-pressed={showPwd} className="tap-target absolute right-3 top-1/2 -translate-y-1/2 text-black/55 hover:text-[#16181A] text-sm font-medium">
                  {showPwd ? t('skrýt') : t('zobrazit')}
                </button>
              </div>
              <p className="mt-2 text-sm text-right"><Link href="/zapomenute-heslo" className="tap-target-sm inline-flex items-center text-[#16181A] underline-offset-2 hover:underline font-semibold">{t('Zapomenuté heslo')}</Link></p>
            </div>

            {error && <div className="p-3.5 note note-danger text-sm">{error}</div>}

            <Button type="submit" variant="accent" size="lg" loading={isLoading} className="w-full">
              {t('Přihlásit se')}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-black/[0.07] space-y-2 text-center text-sm">
            <p className="text-black/60">{t('Provozuješ podnik?')} <Link href="/register" className="tap-target-sm inline-flex items-center text-[#16181A] underline-offset-2 hover:underline font-semibold">{t('Vytvořit účet')}</Link></p>
            <PravniOdkazy jazyk={jazykPravni} className="justify-center text-xs text-black/55" />
            <p className="text-black/60">{t('Máš kód týmu nebo pozvánku?')} <Link href="/join" className="tap-target-sm inline-flex items-center text-[#16181A] underline-offset-2 hover:underline font-semibold">{t('Připojit se')}</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
