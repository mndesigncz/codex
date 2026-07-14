'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
    <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🍵</div>
          <h1 className="text-2xl font-bold text-white mb-1">Čajovna Zelená</h1>
          <p className="text-[#8E8E93] text-sm">Vytvořte si účet a začněte používat systém</p>
        </div>

        {/* Register Card */}
        <div className="bg-[#1C1C1E] rounded-2xl p-6 border border-[#2C2C2E]">
          <h2 className="text-lg font-semibold text-white mb-5">Registrace</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-[#8E8E93] mb-1.5">Jméno</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jana Nováková"
                required
                className="w-full px-4 py-3 bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl text-white placeholder:text-[#48484A] focus:outline-none focus:border-[#30D158] transition-colors text-sm"
              />
            </div>

            {/* Email */}
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

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-[#8E8E93] mb-1.5">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimálně 8 znaků"
                required
                className="w-full px-4 py-3 bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl text-white placeholder:text-[#48484A] focus:outline-none focus:border-[#30D158] transition-colors text-sm"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-[#8E8E93] mb-1.5">Zopakuj heslo</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Zadejte heslo znovu"
                required
                className="w-full px-4 py-3 bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl text-white placeholder:text-[#48484A] focus:outline-none focus:border-[#30D158] transition-colors text-sm"
              />
            </div>

            {/* Role selection */}
            <div>
              <label className="block text-sm font-medium text-[#8E8E93] mb-2">Typ účtu</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('employer')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    role === 'employer'
                      ? 'border-[#30D158] bg-[#30D158]/10 text-white'
                      : 'border-[#3A3A3C] bg-[#2C2C2E] text-[#8E8E93] hover:border-[#48484A]'
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
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    role === 'employee'
                      ? 'border-[#30D158] bg-[#30D158]/10 text-white'
                      : 'border-[#3A3A3C] bg-[#2C2C2E] text-[#8E8E93] hover:border-[#48484A]'
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
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#30D158] hover:bg-[#28B84A] disabled:bg-[#30D158]/50 text-black font-semibold rounded-xl transition-all text-sm active:scale-95"
            >
              {isLoading ? 'Vytváření účtu...' : 'Vytvořit účet'}
            </button>
          </form>

          {/* Login link */}
          <p className="text-center text-[#8E8E93] text-sm mt-5">
            Už máte účet?{' '}
            <Link href="/login" className="text-[#30D158] hover:text-[#28B84A] font-medium transition-colors">
              Přihlásit se
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
