'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const inputClass =
  'w-full rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'employer' | 'employee' | ''>('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!role) {
      setError('Vyberte prosím typ účtu.');
      return;
    }

    if (password.length < 8) {
      setError('Heslo musí mít alespoň 8 znaků.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Hesla se neshodují.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Chyba při registraci.');
      } else {
        router.push('/login?registered=1');
      }
    } catch {
      setError('Chyba serveru. Zkuste to prosím znovu.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🍵</div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Čajovna Zelená</h1>
          <p className="text-white/40 text-sm">Vytvořte si účet a začněte používat systém</p>
        </div>

        {/* Register Card */}
        <div className="glass-card p-8">
          <h2 className="text-lg font-bold tracking-tight text-white mb-6">Registrace</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Jméno</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jana Nováková"
                required
                className={inputClass}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vas@email.cz"
                required
                className={inputClass}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimálně 8 znaků"
                required
                className={inputClass}
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Zopakuj heslo</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Zadejte heslo znovu"
                required
                className={inputClass}
              />
            </div>

            {/* Role selection */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Typ účtu</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('employer')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-300 ${
                    role === 'employer'
                      ? 'border-[#C8F542]/60 bg-[#C8F542]/10 text-white'
                      : 'border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <span className="text-2xl">🏪</span>
                  <div className="text-center">
                    <p className="text-xs font-semibold leading-tight">Provozovatel</p>
                    <p className="text-xs opacity-70 leading-tight mt-0.5">/ majitel</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('employee')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-300 ${
                    role === 'employee'
                      ? 'border-[#C8F542]/60 bg-[#C8F542]/10 text-white'
                      : 'border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <span className="text-2xl">👤</span>
                  <div className="text-center">
                    <p className="text-xs font-semibold leading-tight">Zaměstnanec</p>
                    <p className="text-xs opacity-70 leading-tight mt-0.5">barista / obsluha</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-full bg-[#C8F542] hover:brightness-110 disabled:opacity-50 text-black font-semibold transition-all text-sm active:scale-[0.98]"
            >
              {isLoading ? 'Vytváření účtu...' : 'Vytvořit účet'}
            </button>
          </form>

          {/* Login link */}
          <p className="text-center text-white/40 text-sm mt-6">
            Už máte účet?{' '}
            <Link href="/login" className="text-[#C8F542] hover:underline font-medium">
              Přihlásit se
            </Link>
          </p>
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          © 2025 Čajovna Zelená · Interní systém
        </p>
      </div>
    </div>
  );
}
