'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

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
    <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🍵</div>
          <h1 className="text-2xl font-bold text-white mb-1">Čajovna Zelená</h1>
          <p className="text-[#8E8E93] text-sm">Systém správy čajovny</p>
        </div>

        {/* Login Card */}
        <div className="bg-[#1C1C1E] rounded-2xl p-6 border border-[#2C2C2E]">
          <h2 className="text-lg font-semibold text-white mb-5">Přihlásit se</h2>

          {justRegistered && (
            <div className="p-3 bg-[#30D158]/10 border border-[#30D158]/30 rounded-xl text-[#30D158] text-sm mb-4">
              Účet byl vytvořen. Nyní se můžete přihlásit.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#8E8E93] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vas@email.cz"
                required
                className="w-full px-4 py-3 bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl text-white placeholder:text-[#48484A] focus:outline-none focus:border-[#30D158] transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#8E8E93] mb-1.5">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Zadejte heslo"
                required
                className="w-full px-4 py-3 bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl text-white placeholder:text-[#48484A] focus:outline-none focus:border-[#30D158] transition-colors text-sm"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#30D158] hover:bg-[#28B84A] disabled:bg-[#30D158]/50 text-black font-semibold rounded-xl transition-all text-sm active:scale-95"
            >
              {isLoading ? 'Přihlašování...' : 'Přihlásit se'}
            </button>
          </form>

          {/* Register link */}
          <p className="text-center text-[#8E8E93] text-sm mt-5">
            Nemáte účet?{' '}
            <Link href="/register" className="text-[#30D158] hover:text-[#28B84A] font-medium transition-colors">
              Registrovat se →
            </Link>
          </p>
        </div>

        <p className="text-center text-[#48484A] text-xs mt-4">
          © 2025 Čajovna Zelená · Interní systém
        </p>
      </div>
    </div>
  );
}
