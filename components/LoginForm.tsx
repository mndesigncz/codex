'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogoMark } from './Icons';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Nesprávný email nebo heslo.');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setError('Chyba při přihlášení.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5"><LogoMark size={64} /></div>
          <h1 className="text-3xl font-bold tracking-tight text-[#16181A] mb-2">Čajovna Zelená</h1>
          <p className="text-black/55 text-sm">Systém správy čajovny</p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-8">
          <h2 className="text-3xl font-bold tracking-tight text-[#16181A] mb-6">Přihlásit se</h2>

          {justRegistered && (
            <div className="p-4 rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 text-[#5B7A08] text-sm mb-6">
              Účet byl vytvořen. Nyní se můžete přihlásit.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wider text-black/45">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vas@email.cz"
                required
                className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wider text-black/45">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Zadejte heslo"
                required
                className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm"
              />
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-full bg-[#C8F542] text-black font-semibold py-3 hover:brightness-110 disabled:opacity-50 transition text-sm active:scale-95"
            >
              {isLoading ? 'Přihlašování...' : 'Přihlásit se'}
            </button>
          </form>

          {/* Register / join links */}
          <div className="mt-6 space-y-1.5 text-center text-sm">
            <p className="text-black/55">Provozujete podnik? <Link href="/register" className="text-[#5B7A08] hover:underline font-medium">Vytvořit účet →</Link></p>
            <p className="text-black/55">Máte kód týmu? <Link href="/join" className="text-[#5B7A08] hover:underline font-medium">Připojit se →</Link></p>
          </div>
        </div>

        <p className="text-center text-black/30 text-xs mt-6">
          © 2025 Čajovna Zelená · Interní systém
        </p>
      </div>
    </div>
  );
}
