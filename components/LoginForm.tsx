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
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Čajovna Zelená</h1>
          <p className="text-white/50 text-sm">Systém správy čajovny</p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-8">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-6">Přihlásit se</h2>

          {justRegistered && (
            <div className="p-4 rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 text-[#C8F542] text-sm mb-6">
              Účet byl vytvořen. Nyní se můžete přihlásit.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wider text-white/40">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vas@email.cz"
                required
                className="w-full rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wider text-white/40">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Zadejte heslo"
                required
                className="w-full rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition text-sm"
              />
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
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

          {/* Register link */}
          <p className="text-center text-white/50 text-sm mt-6">
            Nemáte účet?{' '}
            <Link href="/register" className="text-[#C8F542] hover:underline font-medium">
              Registrovat se →
            </Link>
          </p>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          © 2025 Čajovna Zelená · Interní systém
        </p>
      </div>
    </div>
  );
}
