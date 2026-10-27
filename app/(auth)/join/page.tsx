'use client';

import { Suspense, useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogoMark } from '@/components/Icons';
import { okJson } from '@/lib/api';
import JazykMenu from '@/components/ui/JazykMenu';
import { useT } from '@/lib/i18n/client';
import SouhlasPodminek from '@/components/pravni/SouhlasPodminek';

// Jedna podoba pole pro celou aplikaci (v3: šedá jamka, při psaní zbělá s limetkovým prstencem).
const inputClass = 'field';

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
  // Click-wrap (spuštění, balík P): zaměstnanec souhlasí s podmínkami sám; server bez `terms: true` účet nezaloží.
  const [souhlas, setSouhlas] = useState(false);
  const [chybaSouhlasu, setChybaSouhlasu] = useState<string | null>(null);

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
    if (!souhlas) { setChybaSouhlasu(t('Bez souhlasu s podmínkami účet založit nejde.')); return; }
    setIsLoading(true);

    try {
      let res;
      if (token) {
        res = await fetch('/api/invitations/accept', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, name, password, terms: souhlas }),
        });
      } else {
        res = await fetch('/api/teams/join', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, joinCode, terms: souhlas }),
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
    // v3: na telefonu formulář přímo na plátně (nadpis, věta, pole, tlačítko přes šířku), karta až od sm.
    <div className="relative min-h-[100dvh] flex items-start sm:items-center justify-center px-5 pt-5 pb-10 sm:p-6">
      {/* Přepínač jazyka: malá pilulka v rohu stránky. */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6"><JazykMenu /></div>
      <div className="w-full max-w-md">
        <div className="mb-8 pt-1 sm:pt-0 sm:text-center">
          <div className="flex sm:justify-center mb-8 sm:mb-5"><LogoMark size={44} /></div>
          <h1 className="t-page mb-2 text-balance">
            {token ? t('Přijmout pozvánku') : t('Připojit se k týmu')}
          </h1>
          <p className="text-[15px] text-black/60 text-pretty">
            {token && teamName ? t('Máš pozvánku do týmu {tym}.', { tym: teamName }) : t('Zadej kód týmu od svého zaměstnavatele.')}
          </p>
        </div>

        <div className="sm:bg-[var(--surface)] sm:border sm:border-[var(--surface-line)] sm:rounded-3xl sm:p-8 sm:shadow-[shadow:var(--shadow-card)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!token && (
              <div>
                <label htmlFor="join-kod" className="field-label">{t('Kód týmu')}</label>
                <input id="join-kod" autoComplete="one-time-code" type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder={t('Např. K7QP2M')} required
                  className={`${inputClass} font-mono tracking-[0.2em] font-semibold text-center uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:font-normal`} maxLength={6} />
              </div>
            )}
            <div>
              <label htmlFor="join-jmeno" className="field-label">{t('Tvoje jméno')}</label>
              <input id="join-jmeno" autoComplete="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('Jana Nováková')} required className={inputClass} />
            </div>
            <div>
              <label htmlFor="join-email" className="field-label">{t('E-mail')}</label>
              <input id="join-email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('jmeno@email.cz')} required disabled={!!token}
                className={`${inputClass} ${token ? 'opacity-60' : ''}`} />
            </div>
            <div>
              <label htmlFor="join-heslo" className="field-label">{t('Heslo')}</label>
              <input id="join-heslo" autoComplete="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('Minimálně 8 znaků')} required className={inputClass} />
            </div>

            <SouhlasPodminek id="join-souhlas" checked={souhlas} chyba={chybaSouhlasu}
              onChange={v => { setSouhlas(v); if (v) setChybaSouhlasu(null); }} />

            {error && <p role="alert" className="note note-danger">{error}</p>}

            <button type="submit" disabled={isLoading} className="tap-target btn btn-accent btn-lg w-full disabled:opacity-50">
              {isLoading ? t('Připojování…') : t('Připojit se')}
            </button>
          </form>

          <p className="text-center text-black/60 text-sm mt-6">
            {t('Už máš účet?')} <Link href="/login" className="tap-target-sm inline-flex items-center text-[#16181A] underline-offset-2 hover:underline font-semibold">{t('Přihlásit se')}</Link>
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
