'use client';

import { Suspense, useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogoMark } from '@/components/Icons';

const inputClass =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

function JoinForm() {
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
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setEmail(data.email);
        setTeamName(data.teamName);
      })
      .catch(() => setError('Nepodařilo se načíst pozvánku.'));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Heslo musí mít alespoň 8 znaků.'); return; }
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
      if (!res.ok) { setError(data.error || 'Chyba při připojení.'); setIsLoading(false); return; }
      await signIn('credentials', { email, password, redirect: false });
      router.push('/'); router.refresh();
    } catch {
      setError('Chyba serveru.'); setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5"><LogoMark size={64} /></div>
          <h1 className="text-3xl font-bold tracking-tight text-[#16181A] mb-2">
            {token ? 'Přijmout pozvánku' : 'Připojit se k týmu'}
          </h1>
          <p className="text-black/45 text-sm">
            {token && teamName ? `Byli jste pozváni do týmu ${teamName}.` : 'Zadejte kód týmu od svého zaměstnavatele.'}
          </p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!token && (
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Kód týmu</label>
                <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Např. K7QP2M" required
                  className={`${inputClass} tracking-[0.25em] font-semibold text-center uppercase`} maxLength={6} />
              </div>
            )}
            <div>
              <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Vaše jméno</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jana Nováková" required className={inputClass} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vas@email.cz" required disabled={!!token}
                className={`${inputClass} ${token ? 'opacity-60' : ''}`} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Heslo</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimálně 8 znaků" required className={inputClass} />
            </div>

            {error && <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">{error}</div>}

            <button type="submit" disabled={isLoading} className="w-full py-3 rounded-full bg-[#C8F542] hover:brightness-110 disabled:opacity-50 text-black font-semibold transition-all text-sm active:scale-[0.98]">
              {isLoading ? 'Připojování…' : 'Připojit se'}
            </button>
          </form>

          <p className="text-center text-black/45 text-sm mt-6">
            Už máte účet? <Link href="/login" className="text-[#5B7A08] hover:underline font-medium">Přihlásit se</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-black/45 text-sm">Načítání…</div>}>
      <JoinForm />
    </Suspense>
  );
}
